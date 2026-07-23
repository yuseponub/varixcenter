/* eslint-disable @typescript-eslint/no-explicit-any */

import { randomUUID } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOutlookConfig } from './config'
import {
  calendarDeltaPath,
  graphRequest,
  GraphRequestError,
  type GraphCollection,
  type GraphEvent,
} from './graph'
import { getOrCreateOutlookConnection } from './repository'
import { processOutlookOutbox } from './outbox'
import { graphEventToUpsert, normalizeOutlookSubject, type OutlookEventUpsert } from './transform'
import type {
  OutlookConnection,
  OutlookEventRow,
  OutlookSyncResult,
  OutlookSyncStats,
} from '@/types/outlook'

const AGENT_VERSION = 'outlook-graph/1.0'
const DELTA_WINDOW_REFRESH_DAYS = 7

interface ExistingEvent extends OutlookEventRow {
  start_at: string
}

interface MatchAppointment {
  id: string
  fecha_hora_inicio: string
  notas: string | null
  patients: {
    nombre: string
    apellido: string
  } | Array<{
    nombre: string
    apellido: string
  }>
}

interface AppointmentState {
  id: string
  fecha_hora_inicio: string
  fecha_hora_fin: string
  estado: string
}

function emptyStats(): OutlookSyncStats {
  return {
    received: 0,
    upserted: 0,
    removed: 0,
    linked: 0,
    appointments_updated: 0,
    conflicts: 0,
    outbox_queued: 0,
    outbox_processed: 0,
    outbox_failed: 0,
    pages: 0,
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function retryMonitoring<T>(operation: () => Promise<{ data: T; error: { message: string } | null }>) {
  let lastError = 'Error desconocido'
  for (const waitMs of [0, 300, 1000]) {
    if (waitMs) await delay(waitMs)
    try {
      const result = await operation()
      if (!result.error) return result.data
      lastError = result.error.message
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
  }
  throw new Error(lastError)
}

function windowNeedsReset(connection: OutlookConnection, desiredStart: Date, desiredEnd: Date): boolean {
  if (!connection.delta_link || !connection.window_start || !connection.window_end) return true
  const storedStart = new Date(connection.window_start)
  const storedEnd = new Date(connection.window_end)
  if (Number.isNaN(storedStart.getTime()) || Number.isNaN(storedEnd.getTime())) return true

  const refreshMs = DELTA_WINDOW_REFRESH_DAYS * 24 * 60 * 60 * 1000
  return desiredStart.getTime() - storedStart.getTime() >= refreshMs ||
    desiredEnd.getTime() - storedEnd.getTime() >= refreshMs
}

function legacyMatchKey(startAt: string, subject: string): string {
  return `${new Date(startAt).toISOString()}|${normalizeOutlookSubject(subject)}`
}

function legacySubject(notes: string | null): string {
  return (notes ?? '').replace(/^Migrado de Outlook:\s*/i, '').trim()
}

function isExpiredDelta(error: unknown): boolean {
  if (!(error instanceof GraphRequestError)) return false
  return error.status === 410 || ['SyncStateNotFound', 'ErrorInvalidDeltaToken'].includes(error.code ?? '')
}

async function loadExistingEvents(db: any, connectionId: string): Promise<Map<string, ExistingEvent>> {
  const allEvents: ExistingEvent[] = []
  const pageSize = 1000
  for (let from = 0; from < 100_000; from += pageSize) {
    const { data, error } = await db
      .from('outlook_events')
      .select('*')
      .eq('connection_id', connectionId)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)

    if (error) throw new Error(`No se pudo consultar el espejo Outlook: ${error.message}`)
    const page = (data ?? []) as ExistingEvent[]
    allEvents.push(...page)
    if (page.length < pageSize) break
  }
  return new Map(allEvents.map((event) => [event.graph_event_id, event]))
}

async function loadAppointmentMatches(
  db: any,
  start: string,
  end: string
): Promise<Map<string, string[]>> {
  const allAppointments: MatchAppointment[] = []
  const pageSize = 1000
  for (let from = 0; from < 100_000; from += pageSize) {
    const { data, error } = await db
      .from('appointments')
      .select('id, fecha_hora_inicio, notas, patients!inner(nombre, apellido)')
      .gte('fecha_hora_inicio', start)
      .lte('fecha_hora_inicio', end)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)

    if (error) {
      throw new Error(`No se pudieron consultar citas para conciliacion Outlook: ${error.message}`)
    }
    const page = (data ?? []) as MatchAppointment[]
    allAppointments.push(...page)
    if (page.length < pageSize) break
  }

  const matches = new Map<string, string[]>()
  for (const appointment of allAppointments) {
    const patient = Array.isArray(appointment.patients)
      ? appointment.patients[0]
      : appointment.patients
    const subjects = new Set<string>()
    const importedSubject = legacySubject(appointment.notas)
    if (importedSubject && /^Migrado de Outlook:/i.test(appointment.notas ?? '')) {
      subjects.add(importedSubject)
    }
    if (patient) subjects.add(`${patient.nombre} ${patient.apellido}`.trim())

    for (const subject of subjects) {
      if (!subject) continue
      const key = legacyMatchKey(appointment.fecha_hora_inicio, subject)
      matches.set(key, [...(matches.get(key) ?? []), appointment.id])
    }
  }
  return matches
}

async function updateLinkedAppointment(
  db: any,
  mirror: OutlookEventUpsert,
  stats: OutlookSyncStats
) {
  if (!mirror.appointment_id) return

  const { data, error: readError } = await db
    .from('appointments')
    .select('id, fecha_hora_inicio, fecha_hora_fin, estado')
    .eq('id', mirror.appointment_id)
    .maybeSingle()
  if (readError) throw new Error(readError.message)
  if (!data) return

  const appointment = data as AppointmentState
  const updates: Record<string, string> = {}

  if (new Date(appointment.fecha_hora_inicio).toISOString() !== mirror.start_at) {
    updates.fecha_hora_inicio = mirror.start_at
  }
  if (new Date(appointment.fecha_hora_fin).toISOString() !== mirror.end_at) {
    updates.fecha_hora_fin = mirror.end_at
  }
  if (
    mirror.is_cancelled &&
    ['programada', 'confirmada', 'en_sala'].includes(appointment.estado)
  ) {
    updates.estado = 'cancelada'
  }

  if (Object.keys(updates).length === 0) return

  const { error } = await db
    .from('appointments')
    .update(updates)
    .eq('id', appointment.id)

  if (error) {
    stats.conflicts++
    await db
      .from('outlook_events')
      .update({ match_status: 'conflict', sync_error: error.message })
      .eq('connection_id', mirror.connection_id)
      .eq('graph_event_id', mirror.graph_event_id)
    return
  }

  stats.appointments_updated++
}

async function cancelRemovedLinkedAppointment(db: any, event: ExistingEvent, stats: OutlookSyncStats) {
  if (!event.appointment_id) return

  const { data, error } = await db
    .from('appointments')
    .update({ estado: 'cancelada' })
    .eq('id', event.appointment_id)
    .in('estado', ['programada', 'confirmada', 'en_sala'])
    .select('id')

  if (error) {
    stats.conflicts++
    await db
      .from('outlook_events')
      .update({ match_status: 'conflict', sync_error: error.message })
      .eq('id', event.id)
    return
  }
  if (data?.length) stats.appointments_updated++
}

async function processGraphPage(options: {
  db: any
  connection: OutlookConnection
  events: GraphEvent[]
  existing: Map<string, ExistingEvent>
  appointmentMatches: Map<string, string[]>
  claimedAppointments: Set<string>
  seenEventIds: Set<string>
  stats: OutlookSyncStats
}) {
  const {
    db,
    connection,
    events,
    existing,
    appointmentMatches,
    claimedAppointments,
    seenEventIds,
    stats,
  } = options
  const rows: OutlookEventUpsert[] = []
  const linkedRows: OutlookEventUpsert[] = []

  for (const graphEvent of events) {
    stats.received++
    if (!graphEvent.id) continue
    seenEventIds.add(graphEvent.id)

    const previous = existing.get(graphEvent.id)
    if (graphEvent['@removed']) {
      if (!previous) continue
      const now = new Date().toISOString()
      const { error } = await db
        .from('outlook_events')
        .update({ is_cancelled: true, deleted_at: now, synced_at: now, sync_error: null })
        .eq('id', previous.id)
      if (error) throw new Error(`No se pudo marcar evento Outlook eliminado: ${error.message}`)
      await cancelRemovedLinkedAppointment(db, previous, stats)
      stats.removed++
      continue
    }

    let appointmentId = previous?.appointment_id ?? null
    let matchStatus = previous?.match_status ?? 'unmatched'

    const provisional = graphEventToUpsert(graphEvent, {
      connectionId: connection.id,
      appointmentId,
      matchStatus,
    })
    if (!provisional) {
      stats.conflicts++
      continue
    }

    if (!appointmentId && matchStatus !== 'ignored') {
      const candidates = appointmentMatches.get(
        legacyMatchKey(provisional.start_at, provisional.subject)
      ) ?? []
      if (candidates.length === 1 && !claimedAppointments.has(candidates[0])) {
        appointmentId = candidates[0]
        matchStatus = 'matched'
        claimedAppointments.add(appointmentId)
        stats.linked++
      } else if (candidates.length > 0) {
        matchStatus = 'conflict'
        stats.conflicts++
      }
    }

    const mirror = { ...provisional, appointment_id: appointmentId, match_status: matchStatus }
    rows.push(mirror)
    if (appointmentId) linkedRows.push(mirror)
  }

  if (rows.length > 0) {
    const { data: savedRows, error } = await db
      .from('outlook_events')
      .upsert(rows, { onConflict: 'connection_id,graph_event_id' })
      .select('*')
    if (error) throw new Error(`No se pudieron guardar eventos Outlook: ${error.message}`)
    stats.upserted += rows.length

    for (const row of (savedRows ?? []) as ExistingEvent[]) {
      existing.set(row.graph_event_id, row)
    }
  }

  for (const mirror of linkedRows) {
    await updateLinkedAppointment(db, mirror, stats)
  }
}

async function cleanupMissingEventsAfterFullSync(options: {
  db: any
  existing: Map<string, ExistingEvent>
  seenEventIds: Set<string>
  start: Date
  end: Date
  stats: OutlookSyncStats
}) {
  const { db, existing, seenEventIds, start, end, stats } = options
  for (const event of existing.values()) {
    if (event.deleted_at || seenEventIds.has(event.graph_event_id)) continue
    const eventStart = new Date(event.start_at)
    if (eventStart < start || eventStart > end) continue

    const now = new Date().toISOString()
    const { error } = await db
      .from('outlook_events')
      .update({ is_cancelled: true, deleted_at: now, synced_at: now })
      .eq('id', event.id)
    if (error) throw new Error(`No se pudo depurar el espejo Outlook: ${error.message}`)
    await cancelRemovedLinkedAppointment(db, event, stats)
    stats.removed++
  }
}

export async function syncOutlookCalendar(reason = 'manual'): Promise<OutlookSyncResult> {
  const config = getOutlookConfig()
  const admin = createAdminClient()
  // Migration 065 tables intentionally use a narrow untyped boundary.
  const db = admin as any
  const startedAt = new Date().toISOString()
  const lockOwner = randomUUID()
  const stats = emptyStats()
  let runId: string | null = null
  let connection: OutlookConnection | null = null
  let lockAcquired = false

  try {
    const staleCutoff = new Date(Date.now() - 15 * 60_000).toISOString()
    await db
      .from('sync_runs')
      .update({
        finished_at: new Date().toISOString(),
        ok: false,
        error: 'Ejecucion Outlook interrumpida: supero 15 minutos',
      })
      .eq('source', 'outlook')
      .is('finished_at', null)
      .lt('started_at', staleCutoff)

    try {
      const run = await retryMonitoring<{ id: string }>(() =>
        db
          .from('sync_runs')
          .insert({ source: 'outlook', started_at: startedAt, agent_info: `${AGENT_VERSION} (${reason})` })
          .select('id')
          .single()
      )
      runId = run?.id ?? null
    } catch (error) {
      console.error('[Outlook] No se pudo registrar el inicio:', error)
    }

    connection = await getOrCreateOutlookConnection(admin, config)
    if (!connection.enabled) throw new Error('La conexion Outlook esta deshabilitada')

    const { data: acquired, error: lockError } = await db.rpc('acquire_outlook_sync_lock', {
      p_connection_id: connection.id,
      p_owner: lockOwner,
      p_ttl_seconds: 600,
    })
    if (lockError) throw new Error(`No se pudo adquirir el bloqueo Outlook: ${lockError.message}`)

    if (!acquired) {
      const skippedAt = new Date().toISOString()
      if (runId) {
        await retryMonitoring(() =>
          db
            .from('sync_runs')
            .update({ finished_at: skippedAt, ok: true, stats, error: null })
            .eq('id', runId)
            .select('id')
            .single()
        )
      }
      return {
        ok: true,
        connectionId: connection.id,
        fullSync: false,
        stats,
        syncedAt: connection.last_synced_at ?? skippedAt,
        skipped: 'already-running',
      }
    }
    lockAcquired = true

    const now = new Date()
    const desiredStart = new Date(now.getTime() - config.pastDays * 24 * 60 * 60 * 1000)
    const desiredEnd = new Date(now.getTime() + config.futureDays * 24 * 60 * 60 * 1000)
    let fullSync = windowNeedsReset(connection, desiredStart, desiredEnd)
    let windowStart = fullSync ? desiredStart : new Date(connection.window_start!)
    let windowEnd = fullSync ? desiredEnd : new Date(connection.window_end!)
    let nextLink = fullSync
      ? calendarDeltaPath(config, windowStart.toISOString(), windowEnd.toISOString())
      : connection.delta_link!
    let deltaLink: string | null = null

    // Once the initial mirror exists, pending Varix edits win over a concurrent
    // Outlook edit. This prevents a delayed notification from undoing a change
    // that reception just made in Varix.
    if (!fullSync) {
      const earlyOutbox = await processOutlookOutbox(admin, config, connection)
      stats.outbox_processed += earlyOutbox.processed
      stats.outbox_failed += earlyOutbox.failed
    }

    const existing = await loadExistingEvents(db, connection.id)
    let appointmentMatches = await loadAppointmentMatches(
      db,
      windowStart.toISOString(),
      windowEnd.toISOString()
    )
    const claimedAppointments = new Set(
      [...existing.values()].flatMap((event) => event.appointment_id ? [event.appointment_id] : [])
    )
    const seenEventIds = new Set<string>()

    let deltaResetAttempted = false
    for (let page = 0; nextLink && page < 100; page++) {
      let response: GraphCollection<GraphEvent>
      try {
        response = await graphRequest<GraphCollection<GraphEvent>>(config, nextLink)
      } catch (error) {
        if (!fullSync && !deltaResetAttempted && isExpiredDelta(error)) {
          deltaResetAttempted = true
          fullSync = true
          windowStart = desiredStart
          windowEnd = desiredEnd
          nextLink = calendarDeltaPath(config, windowStart.toISOString(), windowEnd.toISOString())
          deltaLink = null
          seenEventIds.clear()
          appointmentMatches = await loadAppointmentMatches(
            db,
            windowStart.toISOString(),
            windowEnd.toISOString()
          )
          page = -1
          continue
        }
        throw error
      }
      stats.pages++
      await processGraphPage({
        db,
        connection,
        events: response.value ?? [],
        existing,
        appointmentMatches,
        claimedAppointments,
        seenEventIds,
        stats,
      })
      nextLink = response['@odata.nextLink'] ?? ''
      deltaLink = response['@odata.deltaLink'] ?? deltaLink
    }

    if (!deltaLink) throw new Error('Microsoft Graph no devolvio deltaLink; la corrida no se confirmara')

    if (fullSync) {
      await cleanupMissingEventsAfterFullSync({
        db,
        existing,
        seenEventIds,
        start: windowStart,
        end: windowEnd,
        stats,
      })
    }

    const { data: queued, error: backfillError } = await db.rpc('backfill_outlook_outbox', {
      p_connection_id: connection.id,
    })
    if (backfillError) {
      throw new Error(`No se pudo completar el outbox Outlook: ${backfillError.message}`)
    }
    stats.outbox_queued = Number(queued ?? 0)

    const outbox = await processOutlookOutbox(admin, config, connection)
    stats.outbox_processed += outbox.processed
    stats.outbox_failed += outbox.failed

    const syncedAt = new Date().toISOString()
    const syncOk = stats.outbox_failed === 0
    const syncError = syncOk
      ? null
      : `${stats.outbox_failed} cambio(s) Varix pendientes de reintento en Outlook`
    const { error: connectionError } = await db
      .from('outlook_connections')
      .update({
        window_start: windowStart.toISOString(),
        window_end: windowEnd.toISOString(),
        delta_link: deltaLink,
        last_synced_at: syncedAt,
        last_sync_ok: syncOk,
        last_error: syncError,
      })
      .eq('id', connection.id)
    if (connectionError) throw new Error(`No se pudo confirmar el delta Outlook: ${connectionError.message}`)

    if (runId) {
      await retryMonitoring(() =>
        db
          .from('sync_runs')
          .update({ finished_at: syncedAt, ok: syncOk, stats, error: syncError })
          .eq('id', runId)
          .select('id')
          .single()
      )
    }

    return { ok: syncOk, connectionId: connection.id, fullSync, stats, syncedAt }
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error).slice(0, 2000)
    console.error('[Outlook] Sincronizacion fallida:', error)

    if (connection) {
      await db
        .from('outlook_connections')
        .update({ last_sync_ok: false, last_error: message })
        .eq('id', connection.id)
    }
    if (runId) {
      try {
        await retryMonitoring(() =>
          db
            .from('sync_runs')
            .update({ finished_at: new Date().toISOString(), ok: false, stats, error: message })
            .eq('id', runId)
            .select('id')
            .single()
        )
      } catch (monitorError) {
        console.error('[Outlook] Tambien fallo el cierre de monitoreo:', monitorError)
      }
    }
    throw error
  } finally {
    if (lockAcquired && connection) {
      try {
        const { error: releaseError } = await db.rpc('release_outlook_sync_lock', {
          p_connection_id: connection.id,
          p_owner: lockOwner,
        })
        if (releaseError) {
          console.error('[Outlook] No se pudo liberar el bloqueo; expirara automaticamente:', releaseError)
        }
      } catch (releaseError) {
        console.error('[Outlook] No se pudo liberar el bloqueo; expirara automaticamente:', releaseError)
      }
    }
  }
}

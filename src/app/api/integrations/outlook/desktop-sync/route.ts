import { createAdminClient } from '@/lib/supabase/admin'
import {
  DESKTOP_BRIDGE_MAX_BODY_BYTES,
  desktopBridgeTokenMatches,
  findDesktopAppointmentMatch,
  parseDesktopBridgeSnapshot,
  type BridgeAppointmentCandidate,
} from '@/lib/outlook/desktop-bridge'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

interface ExistingDesktopEvent {
  id: string
  external_id: string
  start_at: string
  deleted_at: string | null
  appointment_id: string | null
}

function bearerToken(request: Request): string | null {
  const authorization = request.headers.get('authorization')
  const match = authorization?.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

function chunks<T>(values: T[], size = 500): T[][] {
  const result: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size))
  }
  return result
}

export async function POST(request: Request) {
  if (!desktopBridgeTokenMatches(
    bearerToken(request),
    process.env.OUTLOOK_DESKTOP_BRIDGE_TOKEN
  )) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  const declaredLength = Number.parseInt(request.headers.get('content-length') ?? '', 10)
  if (Number.isFinite(declaredLength) && declaredLength > DESKTOP_BRIDGE_MAX_BODY_BYTES) {
    return Response.json({ error: 'Snapshot demasiado grande' }, { status: 413 })
  }

  let connectionId: string | null = null
  // Desktop-bridge tables are migration-owned and intentionally isolated from
  // generated client types.
  const db = createAdminClient() as any

  try {
    const body = await request.text()
    if (Buffer.byteLength(body, 'utf8') > DESKTOP_BRIDGE_MAX_BODY_BYTES) {
      return Response.json({ error: 'Snapshot demasiado grande' }, { status: 413 })
    }

    let decoded: unknown
    try {
      decoded = JSON.parse(body)
    } catch {
      return Response.json({ error: 'JSON invalido' }, { status: 400 })
    }
    const snapshot = parseDesktopBridgeSnapshot(decoded)
    const now = new Date().toISOString()

    const { data: connection, error: connectionError } = await db
      .from('outlook_desktop_connections')
      .upsert(
        {
          device_id: snapshot.deviceId,
          calendar_name: snapshot.calendarName,
          enabled: true,
          window_start: snapshot.windowStart,
          window_end: snapshot.windowEnd,
        },
        { onConflict: 'device_id' }
      )
      .select('id, enabled')
      .single()

    if (connectionError || !connection) {
      throw new Error(`No se pudo preparar el puente: ${connectionError?.message ?? 'sin fila'}`)
    }
    if (!connection.enabled) {
      return Response.json({ error: 'Puente deshabilitado' }, { status: 409 })
    }
    connectionId = connection.id

    const [appointmentsResult, existingResult] = await Promise.all([
      db
        .from('appointments')
        .select(`
          id,
          fecha_hora_inicio,
          fecha_hora_fin,
          estado,
          patients!inner(nombre, apellido)
        `)
        .gte('fecha_hora_inicio', snapshot.windowStart)
        .lte('fecha_hora_inicio', snapshot.windowEnd)
        .limit(10_000),
      db
        .from('outlook_desktop_events')
        .select('id, external_id, start_at, deleted_at, appointment_id')
        .eq('connection_id', connection.id)
        .limit(10_000),
    ])

    if (appointmentsResult.error) {
      throw new Error(`No se pudieron consultar citas Varix: ${appointmentsResult.error.message}`)
    }
    if (existingResult.error) {
      throw new Error(`No se pudo consultar el espejo local: ${existingResult.error.message}`)
    }

    const appointments = (appointmentsResult.data ?? []) as BridgeAppointmentCandidate[]
    const appointmentById = new Map(appointments.map((appointment) => [appointment.id, appointment]))
    const matchableAppointments = appointments.filter((appointment) =>
      ['programada', 'confirmada', 'en_sala'].includes(appointment.estado)
    )
    const existing = (existingResult.data ?? []) as ExistingDesktopEvent[]
    const existingByExternalId = new Map(existing.map((event) => [event.external_id, event]))
    const seenExternalIds = new Set(snapshot.events.map((event) => event.externalId))
    const startMs = new Date(snapshot.windowStart).getTime()
    const endMs = new Date(snapshot.windowEnd).getTime()
    const missing = existing.filter((event) => {
      const eventStart = new Date(event.start_at).getTime()
      return !event.deleted_at && eventStart >= startMs && eventStart <= endMs &&
        !seenExternalIds.has(event.external_id)
    })

    for (const group of chunks(missing.map((event) => event.id))) {
      const { error } = await db
        .from('outlook_desktop_events')
        .update({ deleted_at: now, appointment_id: null, synced_at: now, sync_error: null })
        .in('id', group)
      if (error) throw new Error(`No se pudieron cerrar eventos eliminados: ${error.message}`)
    }

    const claimedAppointmentIds = new Set<string>()
    const rows: Array<Record<string, unknown>> = []
    const mappings: Array<{ externalId: string; appointmentId: string }> = []
    const stats = {
      received: snapshot.events.length,
      upserted: 0,
      removed: missing.length,
      matched: 0,
      conflicts: 0,
    }

    for (const event of snapshot.events) {
      const previous = existingByExternalId.get(event.externalId)
      const preferredAppointmentId = event.appointmentId ?? previous?.appointment_id ?? null
      let appointmentId: string | null = null
      let matchStatus: 'unmatched' | 'matched' | 'conflict' = 'unmatched'

      if (
        preferredAppointmentId &&
        appointmentById.has(preferredAppointmentId) &&
        !claimedAppointmentIds.has(preferredAppointmentId)
      ) {
        appointmentId = preferredAppointmentId
        matchStatus = 'matched'
      } else {
        const match = findDesktopAppointmentMatch(
          event,
          matchableAppointments,
          claimedAppointmentIds
        )
        appointmentId = match.appointmentId
        matchStatus = appointmentId ? 'matched' : match.conflict ? 'conflict' : 'unmatched'
      }

      if (appointmentId) {
        claimedAppointmentIds.add(appointmentId)
        mappings.push({ externalId: event.externalId, appointmentId })
        stats.matched++
      } else if (matchStatus === 'conflict') {
        stats.conflicts++
      }

      rows.push({
        connection_id: connection.id,
        external_id: event.externalId,
        global_id: event.globalId,
        subject: event.subject,
        start_at: event.start,
        end_at: event.end,
        is_all_day: event.isAllDay,
        show_as: event.showAs,
        location: event.location,
        categories: event.categories,
        source_last_modified_at: event.lastModifiedAt,
        appointment_id: appointmentId,
        match_status: matchStatus,
        sync_error: null,
        deleted_at: null,
        synced_at: now,
      })
    }

    for (const group of chunks(rows)) {
      const { error } = await db
        .from('outlook_desktop_events')
        .upsert(group, { onConflict: 'connection_id,external_id' })
      if (error) throw new Error(`No se pudo guardar la agenda local: ${error.message}`)
      stats.upserted += group.length
    }

    const { error: statusError } = await db
      .from('outlook_desktop_connections')
      .update({
        calendar_name: snapshot.calendarName,
        window_start: snapshot.windowStart,
        window_end: snapshot.windowEnd,
        last_snapshot_at: now,
        last_sync_ok: true,
        last_error: null,
      })
      .eq('id', connection.id)
    if (statusError) throw new Error(`No se pudo confirmar el snapshot: ${statusError.message}`)

    return Response.json({ ok: true, syncedAt: now, stats, mappings })
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error).slice(0, 1_000)
    console.error('[Outlook desktop bridge] Error:', error)
    if (connectionId) {
      await db
        .from('outlook_desktop_connections')
        .update({ last_sync_ok: false, last_error: message })
        .eq('id', connectionId)
    }
    return Response.json({ error: message }, { status: 400 })
  }
}

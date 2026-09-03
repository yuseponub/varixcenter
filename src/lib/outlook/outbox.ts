import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import type { OutlookConfig } from './config'
import { isOutlookConfigured, isOutlookSyncEnabled } from './config'
import type { OutlookConnection } from '@/types/outlook'
import {
  calendarCreateEventPath,
  graphRequest,
  GraphRequestError,
  type GraphEvent,
  userEventPath,
} from './graph'
import { graphEventToUpsert } from './transform'

interface OutboxRow {
  id: string
  appointment_id: string
  operation: 'upsert' | 'delete'
  attempts: number
  /** Snapshot del evento remoto cuando la cita ya fue borrada (migracion 080). */
  connection_id?: string | null
  graph_event_id?: string | null
}

interface AppointmentForOutlook {
  id: string
  fecha_hora_inicio: string
  fecha_hora_fin: string
  estado: string
  patients: {
    nombre: string
    apellido: string
  } | Array<{
    nombre: string
    apellido: string
  }>
}

interface ExistingMapping {
  id: string
  graph_event_id: string
}

export async function queueOutlookAppointmentSync(
  client: SupabaseClient<Database>,
  appointmentId: string,
  operation: 'upsert' | 'delete' = 'upsert'
): Promise<void> {
  if (!isOutlookSyncEnabled() || !isOutlookConfigured()) return

  const { error } = await client.rpc('enqueue_outlook_appointment' as never, {
    p_appointment_id: appointmentId,
    p_operation: operation,
  } as never)

  // Calendar operations remain successful even if Microsoft is temporarily down;
  // the queue is best-effort until migration/configuration is fully promoted.
  if (error) console.error('[Outlook] No se pudo encolar la cita:', error.message)
}

// Migration 065 tables intentionally use a narrow untyped boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function markProcessed(table: any, id: string) {
  const { error } = await table
    .update({ processed_at: new Date().toISOString(), last_error: null })
    .eq('id', id)
  if (error) throw new Error(`No se pudo cerrar el outbox Outlook: ${error.message}`)
}

export async function processOutlookOutbox(
  client: SupabaseClient<Database>,
  config: OutlookConfig,
  connection: OutlookConnection
): Promise<{ processed: number; failed: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = client as any
  const result = { processed: 0, failed: 0 }

  // `*` y no una lista de columnas: connection_id/graph_event_id llegan con la
  // migracion 080 y el outbox debe seguir andando mientras no este aplicada.
  const { data: pending, error: pendingError } = await db
    .from('outlook_sync_outbox')
    .select('*')
    .is('processed_at', null)
    .lte('available_at', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(25)

  if (pendingError) throw new Error(`No se pudo leer el outbox Outlook: ${pendingError.message}`)

  for (const item of (pending ?? []) as OutboxRow[]) {
    try {
      const [{ data: appointment, error: appointmentError }, { data: mapping, error: mappingError }] =
        await Promise.all([
          db
            .from('appointments')
            .select('id, fecha_hora_inicio, fecha_hora_fin, estado, patients!inner(nombre, apellido)')
            .eq('id', item.appointment_id)
            .maybeSingle(),
          db
            .from('outlook_events')
            .select('id, graph_event_id')
            .eq('connection_id', connection.id)
            .eq('appointment_id', item.appointment_id)
            .maybeSingle(),
        ])

      if (appointmentError) throw new Error(appointmentError.message)
      if (mappingError) throw new Error(mappingError.message)

      const existing = mapping as ExistingMapping | null
      if (!appointment) {
        // La cita se borro fisicamente (cita repetida): la orden trae el
        // evento remoto a retirar, porque el espejo ya no apunta a la cita.
        if (
          item.operation === 'delete' &&
          item.graph_event_id &&
          item.connection_id === connection.id
        ) {
          try {
            await graphRequest<void>(config, userEventPath(config, item.graph_event_id), {
              method: 'DELETE',
            })
          } catch (error) {
            if (!(error instanceof GraphRequestError) || error.status !== 404) throw error
          }

          const { error: mirrorDeleteError } = await db
            .from('outlook_events')
            .update({ is_cancelled: true, deleted_at: new Date().toISOString(), synced_at: new Date().toISOString() })
            .eq('connection_id', connection.id)
            .eq('graph_event_id', item.graph_event_id)
          if (mirrorDeleteError) {
            throw new Error(`No se pudo cerrar el espejo Outlook: ${mirrorDeleteError.message}`)
          }
        }

        await markProcessed(db.from('outlook_sync_outbox'), item.id)
        result.processed++
        continue
      }

      const apt = appointment as AppointmentForOutlook
      const shouldDelete = item.operation === 'delete' || apt.estado === 'cancelada'

      if (shouldDelete) {
        if (existing) {
          try {
            await graphRequest<void>(config, userEventPath(config, existing.graph_event_id), {
              method: 'DELETE',
            })
          } catch (error) {
            if (!(error instanceof GraphRequestError) || error.status !== 404) throw error
          }

          const { error: mirrorDeleteError } = await db
            .from('outlook_events')
            .update({ is_cancelled: true, deleted_at: new Date().toISOString(), synced_at: new Date().toISOString() })
            .eq('id', existing.id)
          if (mirrorDeleteError) {
            throw new Error(`No se pudo cerrar el espejo Outlook: ${mirrorDeleteError.message}`)
          }
        }

        await markProcessed(db.from('outlook_sync_outbox'), item.id)
        result.processed++
        continue
      }

      // Keep the Outlook subject intentionally minimal: no cedula, phone or diagnosis.
      const patient = Array.isArray(apt.patients) ? apt.patients[0] : apt.patients
      if (!patient) throw new Error('La cita no tiene un paciente valido para Outlook')
      const subject = `${patient.nombre} ${patient.apellido}`.trim()
      const eventPayload = {
        subject,
        start: { dateTime: new Date(apt.fecha_hora_inicio).toISOString(), timeZone: 'UTC' },
        end: { dateTime: new Date(apt.fecha_hora_fin).toISOString(), timeZone: 'UTC' },
        showAs: 'busy',
        categories: ['VarixCenter'],
        isReminderOn: true,
        reminderMinutesBeforeStart: 30,
      }

      let graphEvent: GraphEvent
      if (existing) {
        graphEvent = await graphRequest<GraphEvent>(config, userEventPath(config, existing.graph_event_id), {
          method: 'PATCH',
          body: JSON.stringify(eventPayload),
        })
      } else {
        graphEvent = await graphRequest<GraphEvent>(config, calendarCreateEventPath(config), {
          method: 'POST',
          body: JSON.stringify({ ...eventPayload, transactionId: apt.id }),
        })
      }

      const mirror = graphEventToUpsert(graphEvent, {
        connectionId: connection.id,
        appointmentId: apt.id,
        matchStatus: 'matched',
      })
      if (!mirror) throw new Error('Microsoft Graph devolvio un evento sin fechas validas')

      const { error: mirrorError } = await db
        .from('outlook_events')
        .upsert(mirror, { onConflict: 'connection_id,graph_event_id' })
      if (mirrorError) throw new Error(`No se pudo guardar el espejo Outlook: ${mirrorError.message}`)

      await markProcessed(db.from('outlook_sync_outbox'), item.id)
      result.processed++
    } catch (error) {
      const attempts = item.attempts + 1
      const retryMinutes = Math.min(60, 2 ** Math.min(attempts, 6))
      const { error: retryError } = await db
        .from('outlook_sync_outbox')
        .update({
          attempts,
          available_at: new Date(Date.now() + retryMinutes * 60_000).toISOString(),
          last_error: String(error instanceof Error ? error.message : error).slice(0, 2000),
        })
        .eq('id', item.id)
      if (retryError) {
        throw new Error(
          `No se pudo programar el reintento Outlook: ${retryError.message}; error original: ${String(error)}`
        )
      }
      result.failed++
      console.error(`[Outlook] Fallo procesando cita ${item.appointment_id}:`, error)
    }
  }

  return result
}

/**
 * Notification Query Functions
 *
 * Database operations for SMS reminder system.
 * Uses service role client for cron job operations.
 */
import { createClient } from '@/lib/supabase/server'
import type {
  Notification,
  NotificationWithDetails,
  CreateNotificationData,
  ReminderType,
} from '@/types/notifications'
import { addHours, subMinutes, addMinutes } from 'date-fns'

/**
 * Appointment data needed for sending reminders
 */
interface AppointmentForReminder {
  id: string
  fecha_hora_inicio: string
  patients: {
    id: string
    nombre: string
    apellido: string
    celular: string
  }
}

/**
 * Get appointments that need a reminder of the specified type
 *
 * Uses a 1-hour window centered on the target time:
 * - For 24h reminder: appointments 23.5h to 24.5h from now
 * - For 2h reminder: appointments 1.5h to 2.5h from now
 *
 * Excludes appointments that already have a notification (enviado or pendiente)
 * for this reminder type.
 *
 * @param reminderType - '24h' or '2h'
 * @returns Appointments needing this reminder
 */
export async function getAppointmentsNeedingReminder(
  reminderType: ReminderType
): Promise<AppointmentForReminder[]> {
  const supabase = await createClient()
  const now = new Date()

  // Calculate window based on reminder type
  const hoursAhead = reminderType === '24h' ? 24 : 2
  const windowStart = subMinutes(addHours(now, hoursAhead), 30) // -30 min
  const windowEnd = addMinutes(addHours(now, hoursAhead), 30) // +30 min

  // First get appointments in the time window with active status
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: appointments, error: aptError } = await (supabase as any)
    .from('appointments')
    .select(`
      id,
      fecha_hora_inicio,
      patients!inner (
        id,
        nombre,
        apellido,
        celular
      )
    `)
    .gte('fecha_hora_inicio', windowStart.toISOString())
    .lte('fecha_hora_inicio', windowEnd.toISOString())
    .in('estado', ['programada', 'confirmada'])

  if (aptError) {
    console.error('[Notifications] Error fetching appointments:', aptError)
    throw aptError
  }

  if (!appointments || appointments.length === 0) {
    return []
  }

  // Get existing notifications for these appointments
  const appointmentIds = appointments.map((a: AppointmentForReminder) => a.id)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingNotifications, error: notifError } = await (supabase as any)
    .from('notifications')
    .select('appointment_id')
    .in('appointment_id', appointmentIds)
    .eq('tipo_recordatorio', reminderType)
    .in('estado', ['pendiente', 'enviado', 'reintentando'])

  if (notifError) {
    console.error('[Notifications] Error checking existing:', notifError)
    throw notifError
  }

  // Filter out appointments that already have notifications
  const existingIds = new Set(
    (existingNotifications || []).map((n: { appointment_id: string }) => n.appointment_id)
  )

  return (appointments as AppointmentForReminder[]).filter(
    (apt) => !existingIds.has(apt.id) && apt.patients?.celular
  )
}

/**
 * Get notifications that need retry
 *
 * @returns Notifications in 'reintentando' state with retry time in the past
 */
export async function getNotificationsForRetry(): Promise<Notification[]> {
  const supabase = await createClient()
  const now = new Date().toISOString()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('notifications')
    .select('*')
    .eq('estado', 'reintentando')
    .lte('siguiente_reintento_at', now)
    .lt('intentos', 2) // Max 2 attempts (initial + 1 retry)

  if (error) {
    console.error('[Notifications] Error fetching retries:', error)
    throw error
  }

  return (data as Notification[]) || []
}

/**
 * Create a new notification record
 *
 * @param data - Notification data
 * @returns Created notification or null on constraint violation (duplicate)
 */
export async function createNotification(
  data: CreateNotificationData
): Promise<Notification | null> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: notification, error } = await (supabase as any)
    .from('notifications')
    .insert({
      ...data,
      estado: 'pendiente',
      intentos: 0,
    })
    .select()
    .single()

  if (error) {
    // Unique constraint violation = duplicate notification
    if (error.code === '23505') {
      console.log('[Notifications] Duplicate prevented:', data.appointment_id, data.tipo_recordatorio)
      return null
    }
    console.error('[Notifications] Error creating:', error)
    throw error
  }

  return notification as Notification
}

/**
 * Update notification after send attempt
 *
 * @param id - Notification UUID
 * @param updates - Fields to update
 * @returns Updated notification
 */
export async function updateNotificationStatus(
  id: string,
  updates: {
    estado: 'enviado' | 'fallido' | 'reintentando'
    twilio_message_sid?: string | null
    error_code?: number | null
    error_message?: string | null
    enviado_at?: string | null
    siguiente_reintento_at?: string | null
    intentos?: number
  }
): Promise<Notification | null> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('notifications')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('[Notifications] Error updating status:', error)
    throw error
  }

  return data as Notification
}

/**
 * Get notification by ID
 */
export async function getNotificationById(id: string): Promise<Notification | null> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('notifications')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }

  return data as Notification
}

/**
 * Get notifications list with optional filters
 *
 * @param filters - Optional filters
 * @returns Array of notifications with patient and appointment details
 */
export async function getNotifications(filters?: {
  estado?: string
  tipo_recordatorio?: string
  patient_id?: string
  limit?: number
}): Promise<NotificationWithDetails[]> {
  const supabase = await createClient()
  const limit = filters?.limit ?? 50

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('notifications')
    .select(`
      *,
      patients!inner (
        id,
        nombre,
        apellido,
        celular
      ),
      appointments!inner (
        id,
        fecha_hora_inicio,
        estado
      )
    `)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (filters?.estado) {
    query = query.eq('estado', filters.estado)
  }
  if (filters?.tipo_recordatorio) {
    query = query.eq('tipo_recordatorio', filters.tipo_recordatorio)
  }
  if (filters?.patient_id) {
    query = query.eq('patient_id', filters.patient_id)
  }

  const { data, error } = await query

  if (error) {
    console.error('[Notifications] Error fetching list:', error)
    throw error
  }

  return (data as NotificationWithDetails[]) || []
}

/**
 * Get notifications for a specific patient (for timeline)
 */
export async function getPatientNotifications(
  patientId: string,
  limit = 10
): Promise<Notification[]> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('notifications')
    .select('*')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[Notifications] Error fetching patient notifications:', error)
    return []
  }

  return (data as Notification[]) || []
}

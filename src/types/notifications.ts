/**
 * Notification Types for SMS Reminders
 *
 * Matches database schema from 030_notifications.sql
 */

/**
 * Notification status enum matching database
 * - pendiente: Scheduled, not yet sent
 * - enviado: Successfully sent to Twilio
 * - fallido: Failed after all retry attempts
 * - reintentando: Will retry in 30 minutes
 */
export type NotificationStatus = 'pendiente' | 'enviado' | 'fallido' | 'reintentando'

/**
 * Reminder type enum
 * - 24h: Sent 24 hours before appointment
 * - 2h: Sent 2 hours before appointment
 */
export type ReminderType = '24h' | '2h'

/**
 * Notification record from database
 */
export interface Notification {
  id: string
  appointment_id: string
  patient_id: string
  tipo_recordatorio: ReminderType
  telefono_destino: string
  mensaje: string
  estado: NotificationStatus
  twilio_message_sid: string | null
  error_code: number | null
  error_message: string | null
  intentos: number
  enviado_at: string | null
  siguiente_reintento_at: string | null
  created_at: string
}

/**
 * Notification with joined patient and appointment data
 * Used in notification list page
 */
export interface NotificationWithDetails extends Notification {
  patients: {
    id: string
    nombre: string
    apellido: string
    celular: string
  }
  appointments: {
    id: string
    fecha_hora_inicio: string
    estado: string
  }
}

/**
 * Data needed to create a notification
 */
export interface CreateNotificationData {
  appointment_id: string
  patient_id: string
  tipo_recordatorio: ReminderType
  telefono_destino: string
  mensaje: string
}

/**
 * Result from sending an SMS via Twilio
 */
export interface SendSMSResult {
  success: boolean
  messageSid?: string
  errorCode?: number
  errorMessage?: string
}

/**
 * Configuration for notification status display
 */
export const NOTIFICATION_STATUS_CONFIG: Record<
  NotificationStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: string }
> = {
  pendiente: { label: 'Pendiente', variant: 'secondary', icon: 'Clock' },
  enviado: { label: 'Enviado', variant: 'default', icon: 'CheckCircle' },
  fallido: { label: 'Fallido', variant: 'destructive', icon: 'XCircle' },
  reintentando: { label: 'Reintentando', variant: 'outline', icon: 'RefreshCw' },
}

/**
 * Configuration for reminder type display
 */
export const REMINDER_TYPE_CONFIG: Record<ReminderType, { label: string }> = {
  '24h': { label: '24 horas antes' },
  '2h': { label: '2 horas antes' },
}

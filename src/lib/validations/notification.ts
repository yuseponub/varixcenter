import { z } from 'zod'

/**
 * Phone number validation (E.164 format for Colombia)
 * Format: +57XXXXXXXXXX (10 digits after country code)
 */
export const phoneE164Schema = z
  .string()
  .regex(/^\+57[0-9]{10}$/, {
    message: 'Telefono debe estar en formato E.164 (+57XXXXXXXXXX)',
  })

/**
 * Notification status enum schema
 */
export const notificationStatusSchema = z.enum([
  'pendiente',
  'enviado',
  'fallido',
  'reintentando',
])

/**
 * Reminder type enum schema
 */
export const reminderTypeSchema = z.enum(['24h', '2h'])

/**
 * Schema for creating a new notification
 */
export const createNotificationSchema = z.object({
  appointment_id: z.string().uuid({ message: 'ID de cita invalido' }),
  patient_id: z.string().uuid({ message: 'ID de paciente invalido' }),
  tipo_recordatorio: reminderTypeSchema,
  telefono_destino: phoneE164Schema,
  mensaje: z
    .string()
    .min(1, { message: 'Mensaje es requerido' })
    .max(160, { message: 'Mensaje no puede exceder 160 caracteres' }),
})

/**
 * Schema for updating notification status after send attempt
 */
export const updateNotificationStatusSchema = z.object({
  estado: notificationStatusSchema,
  twilio_message_sid: z.string().nullable().optional(),
  error_code: z.number().nullable().optional(),
  error_message: z.string().nullable().optional(),
  enviado_at: z.string().datetime().nullable().optional(),
  siguiente_reintento_at: z.string().datetime().nullable().optional(),
  intentos: z.number().int().min(0).optional(),
})

/**
 * Schema for notification filters in list page
 */
export const notificationFiltersSchema = z.object({
  estado: notificationStatusSchema.optional(),
  tipo_recordatorio: reminderTypeSchema.optional(),
  patient_id: z.string().uuid().optional(),
  fecha_desde: z.string().date().optional(),
  fecha_hasta: z.string().date().optional(),
  limit: z.number().int().min(1).max(100).default(50),
})

export type CreateNotificationInput = z.infer<typeof createNotificationSchema>
export type UpdateNotificationStatusInput = z.infer<typeof updateNotificationStatusSchema>
export type NotificationFilters = z.infer<typeof notificationFiltersSchema>

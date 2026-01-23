import { z } from 'zod'
import { APPOINTMENT_STATES } from '@/lib/appointments/state-machine'

/**
 * Appointment creation schema
 * Used by: Appointment form, createAppointment server action
 *
 * All messages in Spanish for Colombian users
 */
export const appointmentSchema = z.object({
  // Required foreign keys
  patient_id: z
    .string()
    .uuid('ID de paciente invalido'),

  doctor_id: z
    .string()
    .uuid('ID de doctor invalido'),

  // Time range (ISO 8601 format)
  fecha_hora_inicio: z
    .string()
    .min(1, 'La fecha y hora de inicio es requerida')
    .refine(
      (val) => !isNaN(Date.parse(val)),
      'Formato de fecha y hora invalido'
    ),

  fecha_hora_fin: z
    .string()
    .min(1, 'La fecha y hora de fin es requerida')
    .refine(
      (val) => !isNaN(Date.parse(val)),
      'Formato de fecha y hora invalido'
    ),

  // Optional status (defaults to 'programada' in database)
  estado: z
    .enum(APPOINTMENT_STATES, { error: 'Estado de cita invalido' })
    .optional(),

  // Optional fields
  motivo_consulta: z
    .string()
    .max(500, 'El motivo de consulta es muy largo')
    .optional()
    .or(z.literal('')),

  notas: z
    .string()
    .max(1000, 'Las notas son muy largas')
    .optional()
    .or(z.literal('')),
}).refine(
  (data) => {
    const inicio = new Date(data.fecha_hora_inicio)
    const fin = new Date(data.fecha_hora_fin)
    return fin > inicio
  },
  {
    message: 'La hora de fin debe ser posterior a la hora de inicio',
    path: ['fecha_hora_fin'],
  }
)

/**
 * Status update schema
 * Used by: Status transition actions, quick status buttons
 */
export const appointmentStatusSchema = z.object({
  id: z
    .string()
    .uuid('ID de cita invalido'),

  estado: z
    .enum(APPOINTMENT_STATES, { error: 'Estado de cita invalido' }),
})

/**
 * Reschedule schema
 * Used by: Reschedule modal, rescheduleAppointment server action
 * Only allows changing time, keeps patient and doctor
 */
export const appointmentRescheduleSchema = z.object({
  id: z
    .string()
    .uuid('ID de cita invalido'),

  fecha_hora_inicio: z
    .string()
    .min(1, 'La fecha y hora de inicio es requerida')
    .refine(
      (val) => !isNaN(Date.parse(val)),
      'Formato de fecha y hora invalido'
    ),

  fecha_hora_fin: z
    .string()
    .min(1, 'La fecha y hora de fin es requerida')
    .refine(
      (val) => !isNaN(Date.parse(val)),
      'Formato de fecha y hora invalido'
    ),
}).refine(
  (data) => {
    const inicio = new Date(data.fecha_hora_inicio)
    const fin = new Date(data.fecha_hora_fin)
    return fin > inicio
  },
  {
    message: 'La hora de fin debe ser posterior a la hora de inicio',
    path: ['fecha_hora_fin'],
  }
)

/**
 * TypeScript types inferred from schemas
 */
export type AppointmentFormData = z.infer<typeof appointmentSchema>
export type AppointmentStatusData = z.infer<typeof appointmentStatusSchema>
export type AppointmentRescheduleData = z.infer<typeof appointmentRescheduleSchema>

/**
 * Date range query validation (for calendar views)
 */
export const appointmentQuerySchema = z.object({
  start: z.string().datetime({ message: 'Fecha de inicio invalida' }),
  end: z.string().datetime({ message: 'Fecha de fin invalida' }),
  doctor_id: z.string().uuid('ID de doctor invalido').optional(),
})

export type AppointmentQueryParams = z.infer<typeof appointmentQuerySchema>

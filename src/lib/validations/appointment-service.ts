import { z } from 'zod'

/**
 * Schema for adding a service to an appointment
 */
export const appointmentServiceSchema = z.object({
  appointment_id: z.string().uuid('ID de cita invalido'),
  service_id: z.string().uuid('ID de servicio invalido'),
  service_name: z.string().min(1, 'Nombre de servicio requerido'),
  precio_unitario: z.number().min(0, 'El precio debe ser positivo o cero'),
  cantidad: z.number().int().positive('La cantidad debe ser positiva').default(1),
  subtotal: z.number().min(0, 'El subtotal debe ser positivo o cero'),
  notas: z.string().max(500, 'Las notas son muy largas').nullable().optional(),
})

/**
 * Schema for removing a service from an appointment
 */
export const removeAppointmentServiceSchema = z.object({
  appointment_service_id: z.string().uuid('ID de servicio de cita invalido'),
})

/**
 * Schema for form input (simpler version for client-side)
 */
export const addServiceFormSchema = z.object({
  service_id: z.string().uuid('Seleccione un servicio'),
  cantidad: z.number().int().positive('La cantidad debe ser positiva').default(1),
  precio_unitario: z.number().min(0, 'El precio debe ser positivo o cero'),
  notas: z.string().max(500, 'Las notas son muy largas').optional(),
})

/**
 * TypeScript types inferred from schemas
 */
export type AppointmentServiceFormData = z.infer<typeof appointmentServiceSchema>
export type RemoveAppointmentServiceFormData = z.infer<typeof removeAppointmentServiceSchema>
export type AddServiceFormData = z.infer<typeof addServiceFormSchema>

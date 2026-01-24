/**
 * Appointment Services Type Definitions
 *
 * Types matching the appointment_services database schema (013_appointment_services.sql)
 * Used by: Appointment dialog, payment form, service tracking
 */

/**
 * Payment status values for appointment services.
 * Uses const assertion for literal type inference.
 */
export const ESTADO_PAGO_SERVICIO = ['pendiente', 'pagado'] as const

/**
 * Payment status type derived from ESTADO_PAGO_SERVICIO array.
 */
export type EstadoPagoServicio = (typeof ESTADO_PAGO_SERVICIO)[number]

/**
 * Human-readable labels for payment status (Spanish).
 */
export const ESTADO_PAGO_LABELS: Record<EstadoPagoServicio, string> = {
  pendiente: 'Pendiente',
  pagado: 'Pagado',
}

/**
 * Base appointment service type from database Row.
 * Matches the appointment_services table schema exactly.
 */
export interface AppointmentService {
  id: string
  appointment_id: string
  service_id: string
  service_name: string // snapshot at creation time
  precio_unitario: number // snapshot at creation time
  cantidad: number
  subtotal: number
  estado_pago: EstadoPagoServicio
  payment_item_id: string | null
  notas: string | null
  created_by: string
  created_at: string
  updated_at: string
}

/**
 * Appointment service insert type (for creating new records)
 */
export interface AppointmentServiceInsert {
  appointment_id: string
  service_id: string
  service_name: string
  precio_unitario: number
  cantidad?: number
  subtotal: number
  notas?: string | null
}

/**
 * Pending service by patient from the database view.
 * Used for displaying services pending payment.
 */
export interface PendingServiceByPatient {
  id: string
  appointment_id: string
  service_id: string
  service_name: string
  precio_unitario: number
  cantidad: number
  subtotal: number
  notas: string | null
  created_at: string
  patient_id: string
  appointment_date: string
  patient_nombre: string
  patient_apellido: string
  patient_cedula: string
}

/**
 * Grouped pending services for UI display.
 * Groups services by appointment for better UX.
 */
export interface PendingServicesGroup {
  appointment_id: string
  appointment_date: string
  services: PendingServiceByPatient[]
  total: number
}

/**
 * Extended payment item input with optional appointment_service_id.
 * Used when paying for appointment services.
 */
export interface PaymentItemWithAppointmentService {
  service_id: string
  service_name: string
  unit_price: number
  quantity: number
  appointment_service_id?: string | null
}

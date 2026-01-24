/**
 * Payment Type Definitions
 *
 * Types matching the payments database schema (009_payments.sql)
 * Used by: Payment forms, invoice display, audit trail
 */

/**
 * Payment status values matching the database enum.
 * Uses const assertion for literal type inference.
 */
export const PAYMENT_STATES = ['activo', 'anulado'] as const

/**
 * Payment status type derived from PAYMENT_STATES array.
 * Ensures compile-time type safety for status values.
 */
export type PaymentStatus = (typeof PAYMENT_STATES)[number]

/**
 * Type guard to check if a string is a valid PaymentStatus
 */
export function isValidPaymentStatus(status: unknown): status is PaymentStatus {
  return (
    typeof status === 'string' &&
    PAYMENT_STATES.includes(status as PaymentStatus)
  )
}

/**
 * Payment method values matching the database enum.
 * Uses const assertion for literal type inference.
 */
export const PAYMENT_METHODS = [
  'efectivo',
  'tarjeta',
  'transferencia',
  'nequi',
] as const

/**
 * Payment method type derived from PAYMENT_METHODS array.
 */
export type PaymentMethodType = (typeof PAYMENT_METHODS)[number]

/**
 * Human-readable labels for payment methods (Spanish).
 */
export const PAYMENT_METHOD_LABELS: Record<PaymentMethodType, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
  nequi: 'Nequi',
}

/**
 * Methods that require comprobante photo as evidence.
 * Electronic payments need proof for anti-fraud requirements.
 */
export const ELECTRONIC_METHODS: PaymentMethodType[] = [
  'tarjeta',
  'transferencia',
  'nequi',
]

/**
 * Check if a payment method requires a comprobante (receipt photo).
 * Electronic methods require evidence; cash does not.
 */
export function requiresComprobante(metodo: PaymentMethodType): boolean {
  return ELECTRONIC_METHODS.includes(metodo)
}

/**
 * Base payment type from database Row.
 * Matches the payments table schema exactly.
 */
export interface Payment {
  id: string
  patient_id: string
  numero_factura: string
  subtotal: number
  descuento: number
  descuento_justificacion: string | null
  total: number
  estado: PaymentStatus
  anulado_por: string | null
  anulado_at: string | null
  anulacion_justificacion: string | null
  created_by: string
  created_at: string
}

/**
 * Payment item type (snapshot of service at time of payment).
 * Stores service name and price at payment time for immutability.
 */
export interface PaymentItem {
  id: string
  payment_id: string
  service_id: string
  service_name: string // snapshot at payment time
  unit_price: number // snapshot at payment time
  quantity: number
  subtotal: number
  created_at: string
}

/**
 * Payment method type for split payments.
 * Supports multiple payment methods per transaction.
 */
export interface PaymentMethod {
  id: string
  payment_id: string
  metodo: PaymentMethodType
  monto: number
  comprobante_path: string | null
  created_at: string
}

/**
 * Payment with all related data for display.
 * Includes patient info, items, and payment methods.
 */
export interface PaymentWithDetails extends Payment {
  patients: {
    id: string
    cedula: string
    nombre: string
    apellido: string
  }
  payment_items: PaymentItem[]
  payment_methods: PaymentMethod[]
}

/**
 * Input type for payment items (used in form/server action).
 * Matches PaymentItem without auto-generated fields.
 */
export interface PaymentItemInput {
  service_id: string
  service_name: string
  unit_price: number
  quantity: number
}

/**
 * Input type for payment methods (used in form/server action).
 * Matches PaymentMethod without auto-generated fields.
 */
export interface PaymentMethodInput {
  metodo: PaymentMethodType
  monto: number
  comprobante_path: string | null
}

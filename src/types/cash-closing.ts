/**
 * Cash Closing (Cierre de Caja) Type Definitions
 *
 * Types matching the cash_closings database schema (015_cash_closings.sql)
 * Used by: Closing forms, reports, audit trail
 */

/**
 * Closing status values matching the database enum.
 * Uses const assertion for literal type inference.
 */
export const CIERRE_ESTADOS = ['abierto', 'cerrado', 'reabierto'] as const

/**
 * Closing status type derived from CIERRE_ESTADOS array.
 * Ensures compile-time type safety for status values.
 */
export type CierreEstado = (typeof CIERRE_ESTADOS)[number]

/**
 * Type guard to check if a string is a valid CierreEstado
 */
export function isValidCierreEstado(estado: unknown): estado is CierreEstado {
  return (
    typeof estado === 'string' &&
    CIERRE_ESTADOS.includes(estado as CierreEstado)
  )
}

/**
 * Human-readable labels for closing status (Spanish).
 */
export const CIERRE_ESTADO_LABELS: Record<CierreEstado, string> = {
  abierto: 'Abierto',
  cerrado: 'Cerrado',
  reabierto: 'Reabierto',
}

/**
 * Badge variants for closing status display
 */
export const CIERRE_ESTADO_VARIANTS: Record<CierreEstado, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  abierto: 'secondary',
  cerrado: 'default',
  reabierto: 'destructive',
}

/**
 * Base cash closing type from database Row.
 * Matches the cash_closings table schema exactly.
 */
export interface CashClosing {
  id: string
  cierre_numero: string
  fecha_cierre: string // DATE as string
  total_efectivo: number
  total_tarjeta: number
  total_transferencia: number
  total_nequi: number
  total_descuentos: number
  total_anulaciones: number
  grand_total: number
  conteo_fisico_efectivo: number
  diferencia: number
  diferencia_justificacion: string | null
  cierre_photo_path: string | null
  estado: CierreEstado
  notas: string | null
  closed_by: string
  reopened_by: string | null
  reopened_at: string | null
  reopen_justificacion: string | null
  created_at: string
  updated_at: string
}

/**
 * Cash closing with related user data for display
 */
export interface CashClosingWithDetails extends CashClosing {
  closed_by_user?: {
    email: string
  }
  reopened_by_user?: {
    email: string
  } | null
}

/**
 * Closing summary returned by get_closing_summary RPC
 * Used for preview before closing
 */
export interface ClosingSummary {
  fecha: string
  total_efectivo: number
  total_tarjeta: number
  total_transferencia: number
  total_nequi: number
  total_descuentos: number
  total_anulaciones: number
  grand_total: number
  payment_count: number
  has_existing_closing: boolean
  existing_closing_id: string | null
}

/**
 * Unclosed day info returned by get_unclosed_days RPC
 */
export interface UnclosedDay {
  fecha: string
  payment_count: number
  total: number
}

/**
 * Input type for creating a cash closing
 */
export interface CreateClosingInput {
  fecha: string
  conteo_fisico: number
  diferencia_justificacion?: string
  cierre_photo_path?: string | null
  notas?: string
}

/**
 * Result type from create_cash_closing RPC
 */
export interface CreateClosingResult {
  id: string
  cierre_numero: string
  fecha_cierre: string
  total_efectivo: number
  total_tarjeta: number
  total_transferencia: number
  total_nequi: number
  grand_total: number
  conteo_fisico_efectivo: number
  diferencia: number
}

/**
 * Result type from reopen_cash_closing RPC
 */
export interface ReopenClosingResult {
  id: string
  cierre_numero: string
  estado: 'reabierto'
  reopened_by: string
  reopened_at: string
}

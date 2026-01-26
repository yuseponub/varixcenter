/**
 * Medias Cash Closing (Cierre de Caja Medias) Type Definitions
 *
 * Types matching the medias_cierres database schema (024_medias_cierres.sql)
 * Used by: Closing forms, reports, audit trail
 *
 * NOTE: CIE-08 - Independent from clinic cash closings
 * Uses CIM- prefix instead of CIE-
 */

import {
  type CierreEstado,
  CIERRE_ESTADOS,
  CIERRE_ESTADO_LABELS,
  CIERRE_ESTADO_VARIANTS
} from '@/types/cash-closing'

// Re-export estado types (shared with clinic)
export type { CierreEstado }
export { CIERRE_ESTADOS, CIERRE_ESTADO_LABELS, CIERRE_ESTADO_VARIANTS }

/**
 * Base medias closing type from database Row.
 * Matches the medias_cierres table schema exactly.
 *
 * NOTE: Does NOT include total_descuentos or total_anulaciones
 * (medias sales model is simpler - no discounts)
 */
export interface MediasCierre {
  id: string
  cierre_numero: string        // CIM-000001 (not CIE-)
  fecha_cierre: string         // DATE as string
  total_efectivo: number
  total_tarjeta: number
  total_transferencia: number
  total_nequi: number
  grand_total: number
  conteo_fisico_efectivo: number
  diferencia: number
  diferencia_justificacion: string | null
  cierre_photo_path: string    // Required (NOT NULL in schema)
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
 * Medias closing with related user data for display
 */
export interface MediasCierreWithDetails extends MediasCierre {
  closed_by_user?: {
    email: string
  }
  reopened_by_user?: {
    email: string
  } | null
}

/**
 * Closing summary returned by get_medias_cierre_summary RPC
 * Used for preview before closing
 *
 * NOTE: Uses sale_count (not payment_count) since this is for medias sales
 */
export interface MediasCierreSummary {
  fecha: string
  total_efectivo: number
  total_tarjeta: number
  total_transferencia: number
  total_nequi: number
  grand_total: number
  sale_count: number           // Different from clinic's payment_count
  has_existing_closing: boolean
  existing_closing_id: string | null
}

/**
 * Input type for creating a medias cierre
 */
export interface CreateMediasCierreInput {
  fecha: string
  conteo_fisico: number
  diferencia_justificacion?: string
  cierre_photo_path: string    // Required (not optional like clinic)
  notas?: string
}

/**
 * Result type from create_medias_cierre RPC
 */
export interface CreateMediasCierreResult {
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
 * Result type from reopen_medias_cierre RPC
 */
export interface ReopenMediasCierreResult {
  id: string
  cierre_numero: string
  estado: 'reabierto'
  reopened_by: string
  reopened_at: string
}

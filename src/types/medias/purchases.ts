/**
 * Medias Purchases Type Definitions
 *
 * Types matching purchases and purchase_items database schema
 * Used by: Purchase registration, reception confirmation, purchase list
 */

import { MediasProductType, MediasProductSize } from './products'

/**
 * Purchase status (matches compra_estado ENUM)
 */
export const PURCHASE_STATES = ['pendiente_recepcion', 'recibido', 'anulado'] as const
export type CompraEstado = (typeof PURCHASE_STATES)[number]

export const PURCHASE_STATE_LABELS: Record<CompraEstado, string> = {
  pendiente_recepcion: 'Pendiente Recepcion',
  recibido: 'Recibido',
  anulado: 'Anulado',
}

/**
 * Purchase header (purchases table)
 */
export interface Purchase {
  id: string
  numero_compra: string
  proveedor: string
  fecha_factura: string
  numero_factura: string | null
  total: number
  factura_path: string
  estado: CompraEstado
  notas: string | null
  created_by: string
  recibido_por: string | null
  recibido_at: string | null
  anulado_por: string | null
  anulado_at: string | null
  anulacion_justificacion: string | null
  created_at: string
  updated_at: string
}

/**
 * Purchase item with product snapshot (purchase_items table)
 */
export interface PurchaseItem {
  id: string
  purchase_id: string
  product_id: string
  product_codigo: string
  product_tipo: string  // Snapshot as string (from enum)
  product_talla: string // Snapshot as string (from enum)
  cantidad: number
  costo_unitario: number
  subtotal: number
  created_at: string
}

/**
 * Purchase with items for detail view
 */
export interface PurchaseWithItems extends Purchase {
  items: PurchaseItem[]
  created_by_user?: {
    id: string
    email: string
  } | null
  recibido_por_user?: {
    id: string
    email: string
  } | null
}

/**
 * Input types for purchase creation
 */
export interface PurchaseItemInput {
  product_id: string
  cantidad: number
  costo_unitario: number
}

/**
 * Form data for creating a new purchase
 */
export interface PurchaseFormData {
  proveedor: string
  fecha_factura: string
  numero_factura?: string | null
  total: number
  factura_path: string
  items: PurchaseItemInput[]
  notas?: string | null
}

/**
 * Form item with product details (for UI state)
 */
export interface PurchaseFormItem {
  product_id: string
  codigo: string
  tipo: MediasProductType
  talla: MediasProductSize
  cantidad: number
  costo_unitario: number
  subtotal: number
}

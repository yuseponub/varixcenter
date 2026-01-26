/**
 * Medias Sales Type Definitions
 *
 * Types matching medias_sales, medias_sale_items, medias_sale_methods tables
 * Used by: Sale creation, sales list, receipt generation
 */

import { MediasProductType, MediasProductSize } from './products'

/**
 * Payment status (reuse from payments domain)
 */
export type SaleStatus = 'activo' | 'anulado'

/**
 * Payment method types (same as clinic payments)
 */
export const PAYMENT_METHODS = ['efectivo', 'tarjeta', 'transferencia', 'nequi'] as const
export type PaymentMethodType = (typeof PAYMENT_METHODS)[number]

export const PAYMENT_METHOD_LABELS: Record<PaymentMethodType, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
  nequi: 'Nequi',
}

/**
 * Check if payment method requires comprobante photo
 */
export function requiresComprobante(method: PaymentMethodType): boolean {
  return method !== 'efectivo'
}

/**
 * Sale header (medias_sales table)
 */
export interface MediasSale {
  id: string
  numero_venta: string
  patient_id: string | null
  subtotal: number
  total: number
  estado: SaleStatus
  eliminado_por: string | null
  eliminado_at: string | null
  eliminacion_justificacion: string | null
  vendedor_id: string
  receptor_efectivo_id: string | null
  created_at: string
}

/**
 * Sale item with product snapshot (medias_sale_items table)
 */
export interface MediasSaleItem {
  id: string
  sale_id: string
  product_id: string
  product_codigo: string
  product_tipo: string  // Snapshot as string (from enum)
  product_talla: string // Snapshot as string (from enum)
  unit_price: number
  quantity: number
  subtotal: number
  created_at: string
}

/**
 * Payment method entry (medias_sale_methods table)
 */
export interface MediasSaleMethod {
  id: string
  sale_id: string
  metodo: PaymentMethodType
  monto: number
  comprobante_path: string | null
  created_at: string
}

/**
 * Full sale with items and methods (for detail view)
 */
export interface MediasSaleWithDetails extends MediasSale {
  items: MediasSaleItem[]
  methods: MediasSaleMethod[]
  patient?: {
    id: string
    nombre: string
    apellido: string
    cedula: string
  } | null
  vendedor?: {
    id: string
    email: string
  } | null
}

/**
 * Input types for sale creation
 */
export interface MediasSaleItemInput {
  product_id: string
  quantity: number
}

export interface MediasSaleMethodInput {
  metodo: PaymentMethodType
  monto: number
  comprobante_path: string | null
}

/**
 * Cart item with product details (for UI state)
 */
export interface CartItem {
  product_id: string
  codigo: string
  tipo: MediasProductType
  talla: MediasProductSize
  precio: number
  quantity: number
  subtotal: number
  stock_available: number
}

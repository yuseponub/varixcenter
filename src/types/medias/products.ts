/**
 * Medias Product Type Definitions
 *
 * Types matching the medias_products and medias_stock_movements database schema
 * Used by: Product management, inventory tracking, sales
 */

/**
 * Product type options (matches medias_tipo ENUM)
 */
export const PRODUCT_TYPES = ['Muslo', 'Panty', 'Rodilla'] as const
export type MediasProductType = (typeof PRODUCT_TYPES)[number]

/**
 * Size options (matches medias_talla ENUM)
 */
export const PRODUCT_SIZES = ['M', 'L', 'XL', 'XXL'] as const
export type MediasProductSize = (typeof PRODUCT_SIZES)[number]

/**
 * Stock movement types (matches medias_movement_type ENUM)
 */
export const MOVEMENT_TYPES = [
  'compra',
  'venta',
  'devolucion',
  'ajuste_entrada',
  'ajuste_salida',
  'transferencia'
] as const
export type MediasMovementType = (typeof MOVEMENT_TYPES)[number]

/**
 * Base product type from database Row.
 * Matches medias_products table schema exactly.
 */
export interface MediasProduct {
  id: string
  tipo: MediasProductType
  talla: MediasProductSize
  codigo: string
  precio: number
  stock_normal: number
  stock_devoluciones: number
  umbral_alerta: number
  activo: boolean
  created_at: string
  updated_at: string
}

/**
 * Product insert type (for creating new products)
 */
export interface MediasProductInsert {
  tipo: MediasProductType
  talla: MediasProductSize
  codigo: string
  precio: number
  activo?: boolean
}

/**
 * Product update type (for editing existing products)
 * Only precio and activo are editable per research decisions
 */
export interface MediasProductUpdate {
  precio?: number
  activo?: boolean
}

/**
 * Stock movement type (immutable audit record)
 * Matches medias_stock_movements table schema
 */
export interface MediasStockMovement {
  id: string
  product_id: string
  tipo: MediasMovementType
  cantidad: number
  stock_normal_antes: number
  stock_normal_despues: number
  stock_devoluciones_antes: number
  stock_devoluciones_despues: number
  referencia_id: string | null
  referencia_tipo: string | null
  notas: string | null
  created_by: string
  created_at: string
}

/**
 * Helper type for product display with computed total stock
 */
export interface MediasProductWithTotalStock extends MediasProduct {
  stock_total: number
}

/**
 * Helper function to compute total stock
 */
export function computeTotalStock(product: MediasProduct): number {
  return product.stock_normal + product.stock_devoluciones
}

import { createClient } from '@/lib/supabase/server'
import type { MediasStockMovement, MediasMovementType } from '@/types/medias/products'

/**
 * Filters for stock movements query
 */
export interface MovementFilters {
  product_id?: string
  tipo?: MediasMovementType
  from_date?: string // ISO date string
  to_date?: string // ISO date string
}

/**
 * Stock movement with product relation for display
 */
export interface StockMovementWithProduct extends MediasStockMovement {
  product: {
    id: string
    codigo: string
    tipo: string
    talla: string
  }
}

/**
 * Get stock movements with optional filters
 * Orders by created_at DESC (newest first)
 */
export async function getStockMovements(
  filters?: MovementFilters,
  limit = 200
): Promise<StockMovementWithProduct[]> {
  const supabase = await createClient()

  // Build query with product relation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('medias_stock_movements')
    .select(
      `
      *,
      product:medias_products(id, codigo, tipo, talla)
    `
    )
    .order('created_at', { ascending: false })

  // Apply filters
  if (filters?.product_id) {
    query = query.eq('product_id', filters.product_id)
  }

  if (filters?.tipo) {
    query = query.eq('tipo', filters.tipo)
  }

  if (filters?.from_date) {
    query = query.gte('created_at', filters.from_date)
  }

  if (filters?.to_date) {
    query = query.lte('created_at', filters.to_date)
  }

  // Apply limit
  query = query.limit(limit)

  const { data, error } = await query

  if (error) throw error
  return (data || []) as StockMovementWithProduct[]
}

/**
 * Get movements for a single product
 * Used on product detail view for movement history
 */
export async function getProductMovements(
  productId: string,
  limit = 50
): Promise<StockMovementWithProduct[]> {
  return getStockMovements({ product_id: productId }, limit)
}

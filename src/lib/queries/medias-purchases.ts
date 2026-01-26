/**
 * Medias Purchases Database Queries
 *
 * Query functions for purchases with filtering, ordering, and summary.
 * Follows patterns from medias/sales.ts for consistency.
 */

import { createClient } from '@/lib/supabase/server'
import type { PurchaseWithItems, CompraEstado } from '@/types/medias/purchases'

/**
 * Filter options for getPurchases
 */
export interface PurchaseFilters {
  fecha_desde?: string
  fecha_hasta?: string
  proveedor?: string
  estado?: CompraEstado
}

/**
 * Get all purchases with optional filters
 * Returns purchases with items
 * Orders: pendiente_recepcion first, then by created_at DESC
 */
export async function getPurchases(
  filters?: PurchaseFilters
): Promise<PurchaseWithItems[]> {
  const supabase = await createClient()

  // Table not in generated types yet (pending migration)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('purchases')
    .select(`
      *,
      items:purchase_items(*)
    `)

  // Apply filters
  if (filters?.fecha_desde) {
    query = query.gte('fecha_factura', filters.fecha_desde)
  }

  if (filters?.fecha_hasta) {
    query = query.lte('fecha_factura', filters.fecha_hasta)
  }

  if (filters?.proveedor) {
    query = query.ilike('proveedor', `%${filters.proveedor}%`)
  }

  if (filters?.estado) {
    query = query.eq('estado', filters.estado)
  }

  // Custom ordering: pendiente_recepcion first, then by created_at DESC
  // Use raw ordering with nullsfirst for estado priority
  const { data, error } = await query
    .order('estado', { ascending: true }) // pendiente_recepcion < recibido < anulado alphabetically
    .order('created_at', { ascending: false })

  if (error) throw error

  // Sort to ensure pendiente_recepcion always first
  const purchases = (data || []) as PurchaseWithItems[]
  return purchases.sort((a, b) => {
    // pendiente_recepcion has highest priority
    if (a.estado === 'pendiente_recepcion' && b.estado !== 'pendiente_recepcion') return -1
    if (a.estado !== 'pendiente_recepcion' && b.estado === 'pendiente_recepcion') return 1
    // Then by created_at DESC
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })
}

/**
 * Get single purchase by ID with all items
 */
export async function getPurchaseById(
  id: string
): Promise<PurchaseWithItems | null> {
  const supabase = await createClient()

  // Table not in generated types yet (pending migration)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('purchases')
    .select(`
      *,
      items:purchase_items(*)
    `)
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null // Not found
    throw error
  }

  return data as PurchaseWithItems
}

/**
 * Purchase summary for dashboard
 */
export interface PurchaseSummary {
  total_purchases: number
  pending_reception_count: number
  pending_reception_value: number
  received_this_month_value: number
}

/**
 * Count purchases by estado
 * Returns count for each state for UI stats badges
 */
export interface PurchaseStateCounts {
  pendiente_recepcion: number
  recibido: number
  anulado: number
}

export async function countPurchasesByEstado(): Promise<PurchaseStateCounts> {
  const supabase = await createClient()

  // Table not in generated types yet (pending migration)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('purchases')
    .select('estado')

  if (error) throw error

  const purchases = (data || []) as Array<{ estado: CompraEstado }>

  return {
    pendiente_recepcion: purchases.filter(p => p.estado === 'pendiente_recepcion').length,
    recibido: purchases.filter(p => p.estado === 'recibido').length,
    anulado: purchases.filter(p => p.estado === 'anulado').length,
  }
}

/**
 * Get products for OCR matching
 * Returns active products with id, codigo, tipo, talla, precio
 */
export interface ProductForMatching {
  id: string
  codigo: string
  tipo: string
  talla: string
  precio: number
}

export async function getProductsForMatching(): Promise<ProductForMatching[]> {
  const supabase = await createClient()

  // Table not in generated types yet (pending migration)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('medias_products')
    .select('id, codigo, tipo, talla, precio')
    .eq('activo', true)
    .order('tipo')
    .order('talla')

  if (error) throw error
  return (data || []) as ProductForMatching[]
}

/**
 * Get public URL for invoice file
 */
export async function getInvoicePublicUrl(path: string): Promise<string | null> {
  const supabase = await createClient()

  const { data } = supabase.storage
    .from('payment-receipts')
    .getPublicUrl(path)

  return data.publicUrl
}

/**
 * Get purchase summary for dashboard
 * - Total purchases count
 * - Pending reception count
 * - Total value of pending purchases
 * - Total value of received purchases this month
 */
export async function getPurchaseSummary(): Promise<PurchaseSummary> {
  const supabase = await createClient()

  // Get current month boundaries
  const now = new Date()
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const firstDayNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)

  // Table not in generated types yet (pending migration)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: allPurchases, error: allError } = await (supabase as any)
    .from('purchases')
    .select('id, estado, total, recibido_at')

  if (allError) throw allError

  const purchases = (allPurchases || []) as Array<{
    id: string
    estado: CompraEstado
    total: number
    recibido_at: string | null
  }>

  // Calculate summary
  const total_purchases = purchases.length

  const pendingPurchases = purchases.filter(p => p.estado === 'pendiente_recepcion')
  const pending_reception_count = pendingPurchases.length
  const pending_reception_value = pendingPurchases.reduce(
    (sum, p) => sum + Number(p.total),
    0
  )

  // Received this month (by recibido_at date)
  const receivedThisMonth = purchases.filter(p => {
    if (p.estado !== 'recibido' || !p.recibido_at) return false
    const recibidoDate = new Date(p.recibido_at)
    return recibidoDate >= firstDayOfMonth && recibidoDate < firstDayNextMonth
  })
  const received_this_month_value = receivedThisMonth.reduce(
    (sum, p) => sum + Number(p.total),
    0
  )

  return {
    total_purchases,
    pending_reception_count,
    pending_reception_value,
    received_this_month_value,
  }
}

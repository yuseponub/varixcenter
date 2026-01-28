import { createClient } from '@/lib/supabase/server'
import type { MediasSaleWithDetails } from '@/types/medias/sales'

/**
 * Get all sales with optional filters
 * Returns sales with items, methods, and patient relations
 */
export async function getSales(options?: {
  status?: 'activo' | 'anulado'
  limit?: number
  offset?: number
  startDate?: string
  endDate?: string
}): Promise<MediasSaleWithDetails[]> {
  const supabase = await createClient()

  // Build query - table not in generated types yet (pending migration)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('medias_sales')
    .select(`
      *,
      items:medias_sale_items(*),
      methods:medias_sale_methods(*),
      patient:patients(id, nombre, apellido, cedula)
    `)
    .order('created_at', { ascending: false })

  if (options?.status) {
    query = query.eq('estado', options.status)
  }

  if (options?.startDate) {
    query = query.gte('created_at', options.startDate)
  }

  if (options?.endDate) {
    query = query.lte('created_at', options.endDate)
  }

  if (options?.limit) {
    query = query.limit(options.limit)
  }

  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 50) - 1)
  }

  const { data, error } = await query

  if (error) throw error
  return (data || []) as MediasSaleWithDetails[]
}

/**
 * Get single sale by ID with all relations
 */
export async function getSaleById(id: string): Promise<MediasSaleWithDetails | null> {
  const supabase = await createClient()

  // Table not in generated types yet (pending migration)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('medias_sales')
    .select(`
      *,
      items:medias_sale_items(*),
      methods:medias_sale_methods(*),
      patient:patients(id, nombre, apellido, cedula)
    `)
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null // Not found
    throw error
  }

  return data as MediasSaleWithDetails
}

/**
 * Get active products with stock for sale form
 * Filters by activo=true and stock_normal > 0
 */
export async function getActiveSaleProducts() {
  const supabase = await createClient()

  // Table not in generated types yet (pending migration)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('medias_products')
    .select('id, tipo, talla, codigo, precio, stock_normal, stock_devoluciones, activo')
    .eq('activo', true)
    .gt('stock_normal', 0) // Only products with available stock
    .order('tipo')
    .order('talla')

  if (error) throw error
  return data || []
}

/**
 * Get sales for today (for cash closing)
 */
export async function getTodaySales(): Promise<MediasSaleWithDetails[]> {
  const now = new Date()
  const colombiaDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Bogota' }))
  const todayStr = `${colombiaDate.getFullYear()}-${String(colombiaDate.getMonth() + 1).padStart(2, '0')}-${String(colombiaDate.getDate()).padStart(2, '0')}`

  return getSales({
    startDate: `${todayStr}T00:00:00-05:00`,
    endDate: `${todayStr}T23:59:59.999-05:00`,
    status: 'activo',
  })
}

/**
 * Get sales count and totals for a date range
 */
export async function getSalesSummary(startDate: string, endDate: string) {
  const supabase = await createClient()

  // Table not in generated types yet (pending migration)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('medias_sales')
    .select('total, estado')
    .eq('estado', 'activo')
    .gte('created_at', startDate)
    .lte('created_at', endDate)

  if (error) throw error

  const sales = (data || []) as { total: number; estado: string }[]
  return {
    count: sales.length,
    total: sales.reduce((sum, s) => sum + Number(s.total), 0),
  }
}

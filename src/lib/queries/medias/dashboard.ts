import { createClient } from '@/lib/supabase/server'
import type {
  DashboardMetrics,
  LowStockProduct,
  StockAlertsSummary,
} from '@/types/medias/dashboard'
import { getSalesSummary } from './sales'
import { getPendingReturnsCount } from './returns'

/**
 * Get dashboard metrics for Medias module
 * Combines cash from cierre, sales stats, and pending returns
 */
export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const supabase = await createClient()

  // Get today's date range
  const today = new Date()
  const todayStart = new Date(today)
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date(today)
  todayEnd.setHours(23, 59, 59, 999)

  // Get month's date range
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  monthEnd.setHours(23, 59, 59, 999)

  // Get today's date string for RPC
  const todayStr = today.toISOString().split('T')[0]

  // Fetch efectivo_en_caja from cierre summary RPC
  // This returns efectivo_neto (cash received minus cash refunds)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: cierreSummary } = await (supabase as any).rpc(
    'get_medias_cierre_summary',
    { p_fecha: todayStr }
  )

  const efectivo_en_caja = cierreSummary?.efectivo_neto ?? 0

  // Fetch sales summaries for today and month
  const [ventasHoy, ventasMes, devolucionesPendientes] = await Promise.all([
    getSalesSummary(todayStart.toISOString(), todayEnd.toISOString()),
    getSalesSummary(monthStart.toISOString(), monthEnd.toISOString()),
    getPendingReturnsCount(),
  ])

  return {
    efectivo_en_caja,
    ventas_hoy_count: ventasHoy.count,
    ventas_hoy_total: ventasHoy.total,
    ventas_mes_count: ventasMes.count,
    ventas_mes_total: ventasMes.total,
    devoluciones_pendientes: devolucionesPendientes,
  }
}

/**
 * Get products with low stock (stock_normal < umbral_alerta)
 * Only considers stock_normal, not stock_devoluciones (per CONTEXT.md)
 */
export async function getLowStockProducts(): Promise<LowStockProduct[]> {
  const supabase = await createClient()

  // Query all active products and filter client-side for stock_normal < umbral_alerta
  // Note: Supabase PostgREST doesn't support comparing two columns in filter
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('medias_products')
    .select('id, codigo, tipo, talla, stock_normal, umbral_alerta')
    .eq('activo', true)
    .order('stock_normal', { ascending: true })

  if (error) throw error

  // Filter for low stock (stock_normal < umbral_alerta)
  const lowStockProducts = (data || []).filter(
    (p: LowStockProduct) => p.stock_normal < p.umbral_alerta
  )

  return lowStockProducts as LowStockProduct[]
}

/**
 * Get stock alerts summary for dashboard display
 */
export async function getStockAlertsSummary(): Promise<StockAlertsSummary> {
  const products = await getLowStockProducts()

  return {
    critical_count: products.length,
    products,
  }
}

/**
 * Product option for dropdowns (filters, forms)
 */
export interface ProductOption {
  id: string
  codigo: string
  tipo: string
  talla: string
  stock_normal: number
  stock_devoluciones: number
}

/**
 * Get all products for dropdown selects
 * Used by: movement filters, adjustment forms
 */
export async function getProducts(): Promise<ProductOption[]> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('medias_products')
    .select('id, codigo, tipo, talla, stock_normal, stock_devoluciones')
    .eq('activo', true)
    .order('tipo')
    .order('talla')

  if (error) throw error
  return (data || []) as ProductOption[]
}

import { createClient } from '@/lib/supabase/server'
import type {
  MediasReturn,
  MediasReturnWithDetails,
  DevolucionEstado,
} from '@/types/medias/returns'

/**
 * Filters for returns query
 */
export interface ReturnFilters {
  estado?: DevolucionEstado
  sale_id?: string
  from_date?: string
  to_date?: string
}

/**
 * Get returns with optional filters
 * Orders by created_at DESC (newest first)
 */
export async function getReturns(
  filters?: ReturnFilters
): Promise<MediasReturnWithDetails[]> {
  const supabase = await createClient()

  // Table not in generated types yet (pending migration)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('medias_returns')
    .select(
      `
      *,
      sale:medias_sales(
        id,
        numero_venta,
        patient:patients(id, nombre, apellido)
      )
    `
    )
    .order('created_at', { ascending: false })

  if (filters?.estado) {
    query = query.eq('estado', filters.estado)
  }

  if (filters?.sale_id) {
    query = query.eq('sale_id', filters.sale_id)
  }

  if (filters?.from_date) {
    query = query.gte('created_at', filters.from_date)
  }

  if (filters?.to_date) {
    query = query.lte('created_at', filters.to_date)
  }

  const { data, error } = await query

  if (error) throw error
  return (data || []) as MediasReturnWithDetails[]
}

/**
 * Get single return by ID with full details
 * Includes sale with patient, solicitante email, aprobador email
 */
export async function getReturnById(
  id: string
): Promise<MediasReturnWithDetails | null> {
  const supabase = await createClient()

  // Table not in generated types yet (pending migration)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('medias_returns')
    .select(
      `
      *,
      sale:medias_sales(
        id,
        numero_venta,
        patient:patients(id, nombre, apellido)
      )
    `
    )
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null // Not found
    throw error
  }

  // Fetch solicitante and aprobador emails separately
  // (auth.users is not directly joinable via PostgREST)
  const returnData = data as MediasReturnWithDetails

  // Get solicitante email
  if (returnData.solicitante_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: solicitanteData } = await (supabase as any)
      .from('user_roles')
      .select('user_id')
      .eq('user_id', returnData.solicitante_id)
      .single()

    if (solicitanteData) {
      const {
        data: { user },
      } = await supabase.auth.admin.getUserById(returnData.solicitante_id)
      if (user) {
        returnData.solicitante = {
          id: user.id,
          email: user.email || '',
        }
      }
    }
  }

  // Get aprobador email if exists
  if (returnData.aprobador_id) {
    const {
      data: { user },
    } = await supabase.auth.admin.getUserById(returnData.aprobador_id)
    if (user) {
      returnData.aprobador = {
        id: user.id,
        email: user.email || '',
      }
    }
  }

  return returnData
}

/**
 * Get returns for a specific sale
 * Used on sale detail page to show return history
 */
export async function getReturnsBySale(saleId: string): Promise<MediasReturn[]> {
  const supabase = await createClient()

  // Table not in generated types yet (pending migration)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('medias_returns')
    .select('*')
    .eq('sale_id', saleId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data || []) as MediasReturn[]
}

/**
 * Get count of pending returns for badge/dashboard
 */
export async function getPendingReturnsCount(): Promise<number> {
  const supabase = await createClient()

  // Table not in generated types yet (pending migration)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count, error } = await (supabase as any)
    .from('medias_returns')
    .select('*', { count: 'exact', head: true })
    .eq('estado', 'pendiente')

  if (error) throw error
  return count || 0
}

/**
 * Get returnable quantity for a sale item
 * = original quantity - (pending + approved returns)
 * Used by return form to validate quantity
 */
export async function getReturnableQuantity(saleItemId: string): Promise<number> {
  const supabase = await createClient()

  // First get the original sale item quantity
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: saleItem, error: saleItemError } = await (supabase as any)
    .from('medias_sale_items')
    .select('quantity')
    .eq('id', saleItemId)
    .single()

  if (saleItemError) {
    if (saleItemError.code === 'PGRST116') return 0 // Not found
    throw saleItemError
  }

  // Get sum of quantities already in pending or approved returns
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: returns, error: returnsError } = await (supabase as any)
    .from('medias_returns')
    .select('cantidad')
    .eq('sale_item_id', saleItemId)
    .in('estado', ['pendiente', 'aprobada'])

  if (returnsError) throw returnsError

  const alreadyReturned = (returns || []).reduce(
    (sum: number, r: { cantidad: number }) => sum + r.cantidad,
    0
  )

  return Math.max(0, (saleItem?.quantity || 0) - alreadyReturned)
}

/**
 * Get returns count by estado for stats/badges
 */
export async function getReturnsCountByEstado(): Promise<
  Record<DevolucionEstado, number>
> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('medias_returns')
    .select('estado')

  if (error) throw error

  const counts: Record<DevolucionEstado, number> = {
    pendiente: 0,
    aprobada: 0,
    rechazada: 0,
  }

  for (const row of data || []) {
    if (row.estado in counts) {
      counts[row.estado as DevolucionEstado]++
    }
  }

  return counts
}

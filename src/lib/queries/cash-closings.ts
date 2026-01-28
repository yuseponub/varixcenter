import { createClient } from '@/lib/supabase/server'
import type { CashClosing, ClosingSummary, UnclosedDay } from '@/types'

// Note: cash_closings table and RPC types not yet in generated types
// Using type assertions until migrations are applied and types regenerated

/**
 * Get closing summary for a date (preview before closing)
 * Calls the get_closing_summary RPC
 */
export async function getClosingSummaryForDate(fecha: string): Promise<ClosingSummary | null> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('get_closing_summary', {
    p_fecha: fecha
  })

  if (error) {
    console.error('Error fetching closing summary:', error)
    return null
  }

  return data as ClosingSummary
}

/**
 * Get paginated list of cash closings
 * Most recent first
 */
export async function getCashClosings(options: {
  page?: number
  limit?: number
  estado?: 'cerrado' | 'reabierto'
} = {}): Promise<{ closings: CashClosing[]; total: number }> {
  const { page = 1, limit = 20, estado } = options
  const offset = (page - 1) * limit

  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('cash_closings')
    .select('*', { count: 'exact' })
    .order('fecha_cierre', { ascending: false })
    .range(offset, offset + limit - 1)

  if (estado) {
    query = query.eq('estado', estado)
  }

  const { data, error, count } = await query

  if (error) {
    console.error('Error fetching cash closings:', error)
    return { closings: [], total: 0 }
  }

  return {
    closings: (data as CashClosing[]) || [],
    total: count || 0
  }
}

/**
 * Get single cash closing by ID
 */
export async function getCashClosingById(id: string): Promise<CashClosing | null> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('cash_closings')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    console.error('Error fetching cash closing:', error)
    return null
  }

  return data as CashClosing
}

/**
 * Get cash closing by date
 */
export async function getCashClosingByDate(fecha: string): Promise<CashClosing | null> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('cash_closings')
    .select('*')
    .eq('fecha_cierre', fecha)
    .single()

  if (error) {
    if (error.code !== 'PGRST116') { // Not found is OK
      console.error('Error fetching cash closing by date:', error)
    }
    return null
  }

  return data as CashClosing
}

/**
 * Get days without closing (for alerts)
 * Calls the get_unclosed_days RPC
 */
export async function getUnclosedDays(limit: number = 30): Promise<UnclosedDay[]> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('get_unclosed_days', {
    p_limit: limit
  })

  if (error) {
    console.error('Error fetching unclosed days:', error)
    return []
  }

  return (data as UnclosedDay[]) || []
}

/**
 * Get payments for a specific date (for closing detail)
 */
export async function getPaymentsForDate(fecha: string) {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('payments')
    .select(`
      id,
      numero_factura,
      total,
      descuento,
      estado,
      created_at,
      patients!inner(id, nombre, apellido, cedula),
      payment_methods(metodo, monto)
    `)
    .gte('created_at', `${fecha}T00:00:00-05:00`)
    .lt('created_at', `${fecha}T23:59:59.999-05:00`)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error fetching payments for date:', error)
    return []
  }

  return data || []
}

/**
 * Check if a specific date is closed
 */
export async function isDateClosed(fecha: string): Promise<boolean> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('cash_closings')
    .select('id, estado')
    .eq('fecha_cierre', fecha)
    .eq('estado', 'cerrado')
    .single()

  if (error) {
    return false
  }

  return data !== null
}

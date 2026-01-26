import { createClient } from '@/lib/supabase/server'
import type {
  MediasCierre,
  MediasCierreSummary,
} from '@/types/medias/cierres'

// Note: medias_cierres table and RPC types not yet in generated types
// Using type assertions until migrations are applied and types regenerated

/**
 * Get closing summary for a date (preview before closing)
 * Calls the get_medias_cierre_summary RPC
 */
export async function getMediasCierreSummaryForDate(
  fecha: string
): Promise<MediasCierreSummary | null> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('get_medias_cierre_summary', {
    p_fecha: fecha,
  })

  if (error) {
    console.error('Error fetching medias cierre summary:', error)
    return null
  }

  return data as MediasCierreSummary
}

/**
 * Get paginated list of medias cash closings
 * Most recent first
 */
export async function getMediasCierres(
  options: {
    page?: number
    limit?: number
    estado?: 'cerrado' | 'reabierto'
  } = {}
): Promise<{ closings: MediasCierre[]; total: number }> {
  const { page = 1, limit = 20, estado } = options
  const offset = (page - 1) * limit

  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('medias_cierres')
    .select('*', { count: 'exact' })
    .order('fecha_cierre', { ascending: false })
    .range(offset, offset + limit - 1)

  if (estado) {
    query = query.eq('estado', estado)
  }

  const { data, error, count } = await query

  if (error) {
    console.error('Error fetching medias cierres:', error)
    return { closings: [], total: 0 }
  }

  return {
    closings: (data as MediasCierre[]) || [],
    total: count || 0,
  }
}

/**
 * Get single medias cash closing by ID
 */
export async function getMediasCierreById(
  id: string
): Promise<MediasCierre | null> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('medias_cierres')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    console.error('Error fetching medias cierre:', error)
    return null
  }

  return data as MediasCierre
}

/**
 * Get medias cash closing by date
 */
export async function getMediasCierreByDate(
  fecha: string
): Promise<MediasCierre | null> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('medias_cierres')
    .select('*')
    .eq('fecha_cierre', fecha)
    .single()

  if (error) {
    if (error.code !== 'PGRST116') {
      // Not found is OK
      console.error('Error fetching medias cierre by date:', error)
    }
    return null
  }

  return data as MediasCierre
}

/**
 * Check if a specific date is closed for medias
 */
export async function isMediasDateClosed(fecha: string): Promise<boolean> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('medias_cierres')
    .select('id, estado')
    .eq('fecha_cierre', fecha)
    .eq('estado', 'cerrado')
    .single()

  if (error) {
    return false
  }

  return data !== null
}

/**
 * Get sales for a specific date (for closing detail view)
 */
export async function getMediasSalesForDate(fecha: string) {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('medias_sales')
    .select(`
      id,
      numero_venta,
      total,
      estado,
      created_at,
      patients(id, nombre, apellido, cedula),
      medias_sale_methods(metodo, monto)
    `)
    .gte('created_at', `${fecha}T00:00:00`)
    .lt('created_at', `${fecha}T23:59:59.999`)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error fetching medias sales for date:', error)
    return []
  }

  return data || []
}

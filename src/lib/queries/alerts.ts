import { createClient } from '@/lib/supabase/server'
import type { Alert } from '@/types/alerts'

/**
 * Get list of alerts with optional filtering
 *
 * @param filters - Optional filters for resuelta status and limit
 * @returns Array of alerts or empty array on error
 */
export async function getAlerts(
  filters?: { resuelta?: boolean; limit?: number }
): Promise<Alert[]> {
  const supabase = await createClient()
  const limit = filters?.limit ?? 20

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('alerts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (filters?.resuelta !== undefined) {
    query = query.eq('resuelta', filters.resuelta)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching alerts:', error)
    return []
  }

  return (data as Alert[]) || []
}

/**
 * Get count of unread (unresolved) alerts
 *
 * @returns Number of unread alerts
 */
export async function getUnreadAlertCount(): Promise<number> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count, error } = await (supabase as any)
    .from('alerts')
    .select('*', { count: 'exact', head: true })
    .eq('resuelta', false)

  if (error) {
    console.error('Error fetching unread alert count:', error)
    return 0
  }

  return count || 0
}

/**
 * Get a single alert by ID
 *
 * @param id - Alert UUID
 * @returns Alert or null if not found
 */
export async function getAlertById(id: string): Promise<Alert | null> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('alerts')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    console.error('Error fetching alert:', error)
    return null
  }

  return data as Alert
}

/**
 * Mark an alert as resolved
 *
 * @param id - Alert UUID
 * @param userId - User ID who resolved the alert
 * @param notas - Resolution notes (required)
 * @returns Updated alert or null on error
 */
export async function markAlertResolved(
  id: string,
  userId: string,
  notas: string
): Promise<Alert | null> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('alerts')
    .update({
      resuelta: true,
      resuelta_por: userId,
      resuelta_at: new Date().toISOString(),
      resuelta_notas: notas,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error marking alert as resolved:', error)
    return null
  }

  return data as Alert
}

import { createClient } from '@/lib/supabase/server'
import type { IncomeReport, ReportFilters, DailyIncomeData } from '@/types/reports'

/**
 * Get aggregated income report for a date range
 * Calls the get_income_report RPC function
 *
 * @param filters - Date range filters (startDate, endDate in YYYY-MM-DD format)
 * @returns Aggregated income report or null on error
 */
export async function getIncomeReport(
  filters: ReportFilters
): Promise<IncomeReport | null> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('get_income_report', {
    p_start_date: filters.startDate,
    p_end_date: filters.endDate,
  })

  if (error) {
    console.error('Error fetching income report:', error.message)
    return null
  }

  return data as IncomeReport
}

/**
 * Get daily income breakdown for a date range
 * Calls the get_daily_income_breakdown RPC function
 *
 * @param filters - Date range filters (startDate, endDate in YYYY-MM-DD format)
 * @returns Array of daily income data or empty array on error
 */
export async function getDailyIncomeBreakdown(
  filters: ReportFilters
): Promise<DailyIncomeData[]> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('get_daily_income_breakdown', {
    p_start_date: filters.startDate,
    p_end_date: filters.endDate,
  })

  if (error) {
    console.error('Error fetching daily income breakdown:', error)
    return []
  }

  return (data as DailyIncomeData[]) || []
}

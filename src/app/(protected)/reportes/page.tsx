/**
 * Reports Page
 *
 * Server component that handles initial data fetching and access control.
 * Delegates rendering to ReportsPageClient for client-side interactivity.
 */

import { createClient } from '@/lib/supabase/server'
import { getReportData } from './actions'
import { ReportsPageClient } from './reports-page-client'
import { format } from 'date-fns'
import type { IncomeReport, DailyIncomeData } from '@/types/reports'

/**
 * Get today's date in YYYY-MM-DD format
 */
function getTodayDate(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

export default async function ReportesPage() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  // Extract role from JWT
  let role = 'none'
  if (session?.access_token) {
    try {
      const payload = JSON.parse(
        Buffer.from(session.access_token.split('.')[1], 'base64').toString()
      )
      role = payload.app_metadata?.role ?? 'none'
    } catch {
      role = 'none'
    }
  }

  // Check access (only admin/medico allowed)
  const hasAccess = role === 'admin' || role === 'medico'

  // Fetch initial data for today
  const today = getTodayDate()
  let initialReport: IncomeReport = {
    total_efectivo: 0,
    total_tarjeta: 0,
    total_transferencia: 0,
    total_nequi: 0,
    total_descuentos: 0,
    total_anulaciones: 0,
    grand_total: 0,
    payment_count: 0,
    citas_atendidas: 0,
  }
  let initialDailyBreakdown: DailyIncomeData[] = []

  if (hasAccess) {
    const result = await getReportData(today, today)
    if (!('error' in result)) {
      initialReport = result.report
      initialDailyBreakdown = result.dailyBreakdown
    }
  }

  return (
    <ReportsPageClient
      initialReport={initialReport}
      initialDailyBreakdown={initialDailyBreakdown}
      hasAccess={hasAccess}
    />
  )
}

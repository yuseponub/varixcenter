'use server'

import { createClient } from '@/lib/supabase/server'
import { getIncomeReport, getDailyIncomeBreakdown } from '@/lib/queries/reports'
import { markAlertResolved } from '@/lib/queries/alerts'
import { resolveAlertSchema } from '@/lib/validations/alerts'
import { revalidatePath } from 'next/cache'
import type { IncomeReport, DailyIncomeData } from '@/types/reports'
import type { Alert } from '@/types/alerts'

/**
 * Action state for report server actions
 */
export type ReportActionState = {
  error?: string
  errors?: Record<string, string[]>
  success?: boolean
}

/**
 * Report data result type
 */
export type ReportDataResult = {
  report: IncomeReport
  dailyBreakdown: DailyIncomeData[]
} | {
  error: string
}

/**
 * Alert resolution result type
 */
export type ResolveAlertResult = {
  success: true
  alert: Alert
} | {
  error: string
}

/**
 * Get user role from JWT session
 * @returns User role or 'none' if not found
 */
async function getUserRole(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) return 'none'

  try {
    const payload = JSON.parse(
      Buffer.from(session.access_token.split('.')[1], 'base64').toString()
    )
    return payload.app_metadata?.role ?? 'none'
  } catch {
    return 'none'
  }
}

/**
 * Get report data for a date range
 *
 * Only accessible by admin and medico roles.
 * Returns aggregated income report and daily breakdown.
 *
 * @param startDate - Start date in YYYY-MM-DD format
 * @param endDate - End date in YYYY-MM-DD format
 * @returns Report data or error
 */
export async function getReportData(
  startDate: string,
  endDate: string
): Promise<ReportDataResult> {
  const supabase = await createClient()

  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'No autorizado. Por favor inicie sesion.' }
  }

  // Check user role (only admin/medico allowed)
  const role = await getUserRole(supabase)
  if (role !== 'admin' && role !== 'medico') {
    return { error: 'Solo Admin y Medico pueden ver reportes financieros' }
  }

  // Validate date range
  if (!startDate || !endDate) {
    return { error: 'Las fechas de inicio y fin son requeridas' }
  }

  if (startDate > endDate) {
    return { error: 'La fecha inicial no puede ser mayor a la fecha final' }
  }

  // Fetch report data
  const filters = { startDate, endDate }
  const [report, dailyBreakdown] = await Promise.all([
    getIncomeReport(filters),
    getDailyIncomeBreakdown(filters),
  ])

  if (!report) {
    return { error: 'Error al obtener el reporte. Por favor intente de nuevo.' }
  }

  return { report, dailyBreakdown }
}

/**
 * Resolve an alert
 *
 * Only accessible by admin and medico roles.
 * Marks the alert as resolved with user tracking.
 *
 * @param formData - Form data with alertId and notas
 * @returns Success with updated alert or error
 */
export async function resolveAlertAction(
  formData: FormData
): Promise<ResolveAlertResult> {
  const supabase = await createClient()

  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'No autorizado. Por favor inicie sesion.' }
  }

  // Check user role (only admin/medico allowed)
  const role = await getUserRole(supabase)
  if (role !== 'admin' && role !== 'medico') {
    return { error: 'Solo Admin y Medico pueden resolver alertas' }
  }

  // Parse and validate form data
  const rawData = {
    alertId: formData.get('alertId') as string,
    notas: formData.get('notas') as string,
  }

  const validated = resolveAlertSchema.safeParse(rawData)

  if (!validated.success) {
    const firstError = Object.values(validated.error.flatten().fieldErrors)[0]?.[0]
    return { error: firstError || 'Datos invalidos' }
  }

  // Mark alert as resolved
  const alert = await markAlertResolved(
    validated.data.alertId,
    user.id,
    validated.data.notas
  )

  if (!alert) {
    return { error: 'Error al resolver la alerta. Por favor intente de nuevo.' }
  }

  // Revalidate affected pages
  revalidatePath('/dashboard')
  revalidatePath('/reportes')

  return { success: true, alert }
}

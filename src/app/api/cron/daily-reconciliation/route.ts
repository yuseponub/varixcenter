/**
 * Cron API Route: Conciliación diaria agenda vs pagos
 *
 * Vercel Cron la ejecuta cada día a las 01:00 UTC (20:00 America/Bogota),
 * construye el reporte del día en curso (hora Bogotá) y lo envía por correo
 * a los destinatarios configurados. Acepta ?fecha=YYYY-MM-DD para reenviar
 * un día concreto de forma manual.
 *
 * Autenticación: Bearer CRON_SECRET. Usa el cliente service role porque no
 * corre bajo la sesión de ningún usuario (integración de fondo).
 *
 * @see vercel.json
 */
import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { bogotaToday, getDailyReconciliation, isValidIsoDate } from '@/lib/queries/reconciliation'
import { getReconciliationEmailConfig, sendReconciliationEmail } from '@/lib/reconciliation/email'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[Cron] CRON_SECRET not configured')
    return false
  }
  return request.headers.get('authorization') === `Bearer ${cronSecret}`
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (process.env.ENABLE_CRON !== 'true') {
    console.log('[Cron] ENABLE_CRON != true - conciliación deshabilitada en este entorno')
    return Response.json({ skipped: true, reason: 'ENABLE_CRON disabled' })
  }

  const config = getReconciliationEmailConfig()
  if (!config) {
    console.error('[Cron] RESEND_API_KEY no configurada; no se envía la conciliación')
    return Response.json({ skipped: true, reason: 'RESEND_API_KEY missing' })
  }

  const param = request.nextUrl.searchParams.get('fecha') ?? undefined
  if (param !== undefined && !isValidIsoDate(param)) {
    return Response.json({ error: 'fecha inválida, use YYYY-MM-DD' }, { status: 400 })
  }
  const fecha = param ?? bogotaToday()

  try {
    const report = await getDailyReconciliation(fecha, createAdminClient())
    const result = await sendReconciliationEmail(report, config)
    if (!result.sent) {
      console.error('[Cron] Error enviando conciliación:', result.error)
      return Response.json({ fecha, sent: false, error: result.error }, { status: 502 })
    }
    console.log(`[Cron] Conciliación ${fecha} enviada: ${report.totals.discrepancias} discrepancia(s)`)
    return Response.json({
      fecha,
      sent: true,
      recipients: config.to.length,
      discrepancias: report.totals.discrepancias,
      citas: report.totals.citas,
      pagos_activos: report.totals.pagos_activos,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido'
    console.error('[Cron] Conciliación falló:', message)
    return Response.json({ fecha, sent: false, error: message }, { status: 500 })
  }
}

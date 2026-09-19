/**
 * Correo diario de conciliación agenda vs pagos.
 *
 * Se envía por la API HTTP de Resend (sin dependencia npm). Configuración:
 *   RESEND_API_KEY              clave de Resend (obligatoria para enviar)
 *   RECONCILIATION_EMAIL_TO     destinatarios separados por coma
 *   RECONCILIATION_EMAIL_FROM   remitente verificado en Resend
 */
import type { ReconciliationReport, ReconciliationRow } from '@/types/reconciliation'
import {
  RECONCILIATION_CATEGORY_LABELS,
  RECONCILIATION_DISCREPANCY_CATEGORIES,
  rowsByCategory,
} from '@/lib/reconciliation/classify'

const DEFAULT_TO = 'joseromerorincon041100@gmail.com'
const DEFAULT_FROM = 'VarixCenter <onboarding@resend.dev>'

export interface ReconciliationEmailConfig {
  apiKey: string
  to: string[]
  from: string
}

export function getReconciliationEmailConfig(): ReconciliationEmailConfig | null {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) return null
  const to = (process.env.RECONCILIATION_EMAIL_TO ?? DEFAULT_TO)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return { apiKey, to, from: process.env.RECONCILIATION_EMAIL_FROM?.trim() || DEFAULT_FROM }
}

const cop = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function fechaLarga(fecha: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Bogota',
  }).format(new Date(`${fecha}T12:00:00-05:00`))
}

function table(headers: string[], rows: string[][]): string {
  const th = headers.map((h) => `<th style="text-align:left;padding:6px 8px;border-bottom:2px solid #ddd;font-size:13px">${esc(h)}</th>`).join('')
  const tr = rows
    .map(
      (r) =>
        `<tr>${r.map((c) => `<td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:13px;vertical-align:top">${c}</td>`).join('')}</tr>`
    )
    .join('')
  return `<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;margin:8px 0 20px">${th ? `<thead><tr>${th}</tr></thead>` : ''}<tbody>${tr}</tbody></table>`
}

function pagoCell(row: ReconciliationRow): string {
  if (!row.payment) return '—'
  const p = row.payment
  return `${esc(p.numero_factura)} · ${cop(p.total)} · ${esc(p.hora)}<br><span style="color:#666">${esc(p.servicios)}${row.payment_linked ? '' : ' (por paciente, sin enlace a la cita)'}</span>`
}

function rowsTable(rows: ReconciliationRow[]): string {
  return table(
    ['Hora', 'Paciente', 'Agenda', 'Médico', 'Servicios agendados', 'Marcado por médico', 'Pago'],
    rows.map((r) => [
      esc(r.appointment.hora),
      `<strong>${esc(r.appointment.patient_nombre)} ${esc(r.appointment.patient_apellido)}</strong>${r.appointment.patient_cedula ? `<br><span style="color:#666">${esc(r.appointment.patient_cedula)}</span>` : ''}`,
      esc(r.appointment.estado),
      esc(r.appointment.doctor_nombre),
      esc(r.appointment.servicios || r.appointment.motivo_consulta || ''),
      r.attendance ? `${esc(r.attendance.hora)} ${esc(r.attendance.marked_by_nombre)}` : '—',
      pagoCell(r),
    ])
  )
}

export function buildReconciliationEmailSubject(report: ReconciliationReport): string {
  const n = report.totals.discrepancias
  const estado = n === 0 ? 'todo cuadra' : `${n} discrepancia${n === 1 ? '' : 's'}`
  return `Conciliación VarixCenter ${report.fecha}: ${estado}`
}

export function buildReconciliationEmailHtml(report: ReconciliationReport, appUrl?: string): string {
  const t = report.totals
  const ok = t.discrepancias === 0
  const color = ok ? '#15803d' : '#b45309'

  let html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:960px">`
  html += `<h2 style="margin:0 0 4px">Conciliación agenda vs pagos</h2>`
  html += `<p style="margin:0 0 16px;color:#555;text-transform:capitalize">${esc(fechaLarga(report.fecha))}</p>`
  html += `<p style="font-size:16px;font-weight:bold;color:${color}">${ok ? 'Todo cuadra: sin discrepancias.' : `${t.discrepancias} discrepancia(s) por revisar.`}</p>`

  html += table(
    [],
    [
      ['Citas del día', String(t.citas)],
      ...Object.entries(t.por_estado).map(([e, n]) => [`&nbsp;&nbsp;${esc(e)}`, String(n)]),
      ['Marcados "atendido" por médico', String(t.marcados_por_medico)],
      ['Pagos activos', `${t.pagos_activos} (${cop(t.pagos_activos_total)})`],
      ['&nbsp;&nbsp;enlazados a su cita', String(t.pagos_enlazados_a_cita)],
      ['Pagos anulados', String(t.pagos_anulados)],
      ['Ventas de medias', `${t.medias_ventas_count} (${cop(t.medias_ventas_total)})`],
    ]
  )

  for (const category of RECONCILIATION_DISCREPANCY_CATEGORIES) {
    const rows = rowsByCategory(report, category)
    if (!rows.length) continue
    html += `<h3 style="margin:16px 0 4px;color:#b45309">${esc(RECONCILIATION_CATEGORY_LABELS[category])} (${rows.length})</h3>`
    html += rowsTable(rows)
  }

  if (report.pagos_dobles.length) {
    html += `<h3 style="margin:16px 0 4px;color:#b45309">Pacientes con más de un pago el mismo día (${report.pagos_dobles.length})</h3>`
    html += table(
      ['Paciente', 'Facturas'],
      report.pagos_dobles.map((d) => [
        `<strong>${esc(d.patient_nombre)} ${esc(d.patient_apellido)}</strong>`,
        d.payments.map((p) => `${esc(p.numero_factura)} · ${cop(p.total)} · ${esc(p.hora)} · ${esc(p.servicios)}`).join('<br>'),
      ])
    )
  }

  if (report.pagos_sin_cita.length) {
    html += `<h3 style="margin:16px 0 4px;color:#b45309">Pagos de pacientes sin cita ese día (${report.pagos_sin_cita.length})</h3>`
    html += table(
      ['Hora', 'Paciente', 'Factura', 'Total', 'Servicios'],
      report.pagos_sin_cita.map((p) => [
        esc(p.hora),
        `<strong>${esc(p.patient_nombre)} ${esc(p.patient_apellido)}</strong>`,
        esc(p.numero_factura),
        cop(p.total),
        esc(p.servicios),
      ])
    )
  }

  const okRows = rowsByCategory(report, 'ok')
  if (okRows.length) {
    html += `<h3 style="margin:16px 0 4px;color:#15803d">Asistió y tiene pago (${okRows.length})</h3>`
    html += rowsTable(okRows)
  }

  if (report.pagos_anulados.length) {
    html += `<h3 style="margin:16px 0 4px">Pagos anulados (${report.pagos_anulados.length})</h3>`
    html += table(
      ['Hora', 'Paciente', 'Factura', 'Total'],
      report.pagos_anulados.map((p) => [esc(p.hora), `${esc(p.patient_nombre)} ${esc(p.patient_apellido)}`, esc(p.numero_factura), cop(p.total)])
    )
  }

  if (appUrl) {
    html += `<p style="margin-top:20px"><a href="${esc(appUrl)}/reportes/conciliacion?fecha=${esc(report.fecha)}">Ver en VarixCenter</a></p>`
  }
  html += `</div>`
  return html
}

export interface SendResult {
  sent: boolean
  id?: string
  error?: string
}

export async function sendReconciliationEmail(
  report: ReconciliationReport,
  config: ReconciliationEmailConfig = getReconciliationEmailConfig() ?? (() => { throw new Error('RESEND_API_KEY no configurada') })()
): Promise<SendResult> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, '')
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: config.from,
      to: config.to,
      subject: buildReconciliationEmailSubject(report),
      html: buildReconciliationEmailHtml(report, appUrl),
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    return { sent: false, error: `Resend ${res.status}: ${body.slice(0, 300)}` }
  }
  const data = (await res.json().catch(() => ({}))) as { id?: string }
  return { sent: true, id: data.id }
}

/**
 * Clasificación pura de la conciliación agenda vs pagos.
 * Sin dependencias de Supabase para poder probarla con node --test.
 */
import type {
  ReconciliationCategory,
  ReconciliationInput,
  ReconciliationPayment,
  ReconciliationReport,
  ReconciliationRow,
} from '@/types/reconciliation'

export const RECONCILIATION_CATEGORY_LABELS: Record<ReconciliationCategory, string> = {
  asistio_sin_pago: 'Asistió y no tiene pago',
  pago_sin_marcar_agenda: 'Tiene pago pero la agenda no registra asistencia',
  no_asistio_con_pago: 'Cancelada o no asistió, pero tiene pago',
  sin_estado_sin_pago: 'Sin asistencia registrada y sin pago',
  ok: 'Asistió y tiene pago',
  ok_no_asistio: 'Cancelada o no asistió, sin pago',
}

/** Categorías que requieren revisión humana. */
export const RECONCILIATION_DISCREPANCY_CATEGORIES: ReconciliationCategory[] = [
  'asistio_sin_pago',
  'no_asistio_con_pago',
  'pago_sin_marcar_agenda',
  'sin_estado_sin_pago',
]

const ASISTIO = new Set(['en_sala', 'en_atencion', 'completada'])
const NO_ASISTIO = new Set(['cancelada', 'no_asistio'])

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const k = key(item)
    const list = map.get(k)
    if (list) list.push(item)
    else map.set(k, [item])
  }
  return map
}

export function classifyReconciliation(input: ReconciliationInput): ReconciliationReport {
  const activos = input.payments.filter((p) => p.estado === 'activo')
  const anulados = input.payments.filter((p) => p.estado !== 'activo')

  const pagosPorCita = groupBy(
    activos.filter((p) => p.appointment_id),
    (p) => p.appointment_id as string
  )
  const pagosPorPaciente = groupBy(activos, (p) => p.patient_id)
  const asistenciaPorPaciente = new Map(input.attendances.map((a) => [a.patient_id, a]))
  const citasPorPaciente = groupBy(input.appointments, (a) => a.patient_id)

  // Un pago solo puede cubrir una cita. Primero se asignan los pagos enlazados
  // por appointment_id; el resto se reparte por paciente en orden de hora.
  const pagosUsados = new Set<string>()
  const tomarPago = (candidatos: ReconciliationPayment[]): ReconciliationPayment | null => {
    const libre = candidatos.find((p) => !pagosUsados.has(p.id))
    if (libre) pagosUsados.add(libre.id)
    return libre ?? null
  }

  const enlazados = new Map<string, ReconciliationPayment>()
  for (const appointment of input.appointments) {
    const pago = tomarPago(pagosPorCita.get(appointment.id) ?? [])
    if (pago) enlazados.set(appointment.id, pago)
  }

  const rows: ReconciliationRow[] = input.appointments.map((appointment) => {
    const attendance = asistenciaPorPaciente.get(appointment.patient_id) ?? null

    const enlazado = enlazados.get(appointment.id) ?? null
    const payment = enlazado ?? tomarPago(pagosPorPaciente.get(appointment.patient_id) ?? [])
    const tienePago = payment !== null

    let category: ReconciliationCategory
    if (ASISTIO.has(appointment.estado) || attendance) {
      category = tienePago ? 'ok' : 'asistio_sin_pago'
    } else if (NO_ASISTIO.has(appointment.estado)) {
      category = tienePago ? 'no_asistio_con_pago' : 'ok_no_asistio'
    } else {
      category = tienePago ? 'pago_sin_marcar_agenda' : 'sin_estado_sin_pago'
    }

    return { category, appointment, attendance, payment, payment_linked: enlazado !== null }
  })

  const pagos_sin_cita = activos.filter((p) => !citasPorPaciente.has(p.patient_id))

  const pagos_dobles = [...pagosPorPaciente.entries()]
    .filter(([, pagos]) => pagos.length > 1)
    .map(([patient_id, payments]) => ({
      patient_id,
      patient_nombre: payments[0].patient_nombre,
      patient_apellido: payments[0].patient_apellido,
      payments,
    }))

  const por_estado: Record<string, number> = {}
  for (const a of input.appointments) por_estado[a.estado] = (por_estado[a.estado] ?? 0) + 1

  const discrepancias =
    rows.filter((r) => RECONCILIATION_DISCREPANCY_CATEGORIES.includes(r.category)).length +
    pagos_sin_cita.length +
    pagos_dobles.length

  return {
    fecha: input.fecha,
    totals: {
      citas: input.appointments.length,
      por_estado,
      marcados_por_medico: input.attendances.length,
      pagos_activos: activos.length,
      pagos_activos_total: activos.reduce((s, p) => s + p.total, 0),
      pagos_enlazados_a_cita: activos.filter((p) => p.appointment_id).length,
      pagos_anulados: anulados.length,
      medias_ventas_count: input.medias_ventas_count,
      medias_ventas_total: input.medias_ventas_total,
      discrepancias,
    },
    rows,
    pagos_sin_cita,
    pagos_dobles,
    pagos_anulados: anulados,
  }
}

export function rowsByCategory(
  report: ReconciliationReport,
  category: ReconciliationCategory
): ReconciliationRow[] {
  return report.rows.filter((r) => r.category === category)
}

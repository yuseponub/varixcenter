import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/types/supabase'
import type {
  ReconciliationAppointment,
  ReconciliationAttendance,
  ReconciliationInput,
  ReconciliationPayment,
  ReconciliationReport,
} from '@/types/reconciliation'
import { classifyReconciliation } from '@/lib/reconciliation/classify'
import { bogotaDayBounds, bogotaHHMM, bogotaToday, isValidIsoDate } from '@/lib/bogota-date'

type Client = SupabaseClient<Database>

export { bogotaToday, bogotaDayBounds, isValidIsoDate }

interface PersonName {
  nombre?: string | null
  apellido?: string | null
}

function fullName(p: PersonName | null | undefined): string {
  return `${p?.nombre ?? ''} ${p?.apellido ?? ''}`.trim()
}

/**
 * Carga y clasifica la conciliación de un día.
 *
 * Acepta un cliente explícito para que el cron (service role) reutilice la
 * misma lógica; por defecto usa el cliente SSR bajo RLS del usuario.
 */
export async function getDailyReconciliation(
  fecha: string,
  client?: Client
): Promise<ReconciliationReport> {
  const supabase = client ?? (await createClient())
  const { start, end } = bogotaDayBounds(fecha)

  const [apptRes, payRes, attRes, mediasRes] = await Promise.all([
    supabase
      .from('appointments')
      .select(
        `id, patient_id, doctor_id, estado, motivo_consulta, fecha_hora_inicio,
         patients(nombre, apellido, cedula),
         appointment_services(service_name, cantidad)`
      )
      .gte('fecha_hora_inicio', start)
      .lte('fecha_hora_inicio', end)
      .order('fecha_hora_inicio', { ascending: true }),
    supabase
      .from('payments')
      .select(
        `id, patient_id, appointment_id, numero_factura, total, estado, created_at,
         patients(nombre, apellido),
         payment_items(service_name, quantity)`
      )
      .gte('created_at', start)
      .lte('created_at', end)
      .order('created_at', { ascending: true }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('patient_attendances')
      .select('patient_id, hora, marked_by')
      .eq('fecha', fecha),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('medias_sales')
      .select('total, estado')
      .gte('created_at', start)
      .lte('created_at', end),
  ])

  if (apptRes.error) throw new Error(`Citas: ${apptRes.error.message}`)
  if (payRes.error) throw new Error(`Pagos: ${payRes.error.message}`)
  if (attRes.error) throw new Error(`Asistencias: ${attRes.error.message}`)

  const userIds = new Set<string>()
  for (const a of apptRes.data ?? []) if (a.doctor_id) userIds.add(a.doctor_id)
  for (const a of (attRes.data ?? []) as Array<{ marked_by: string }>) userIds.add(a.marked_by)

  const userMap = new Map<string, PersonName>()
  if (userIds.size > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: users } = await (supabase as any)
      .from('doctors_view')
      .select('id, nombre, apellido')
      .in('id', [...userIds])
    for (const u of (users ?? []) as Array<{ id: string } & PersonName>) userMap.set(u.id, u)
  }

  const appointments: ReconciliationAppointment[] = (apptRes.data ?? []).map((a) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patient = (a as any).patients as (PersonName & { cedula?: string | null }) | null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const servicios = ((a as any).appointment_services ?? []) as Array<{ service_name: string; cantidad: number }>
    return {
      id: a.id,
      patient_id: a.patient_id,
      patient_nombre: patient?.nombre ?? '',
      patient_apellido: patient?.apellido ?? '',
      patient_cedula: patient?.cedula ?? null,
      hora: bogotaHHMM(a.fecha_hora_inicio),
      estado: a.estado,
      doctor_nombre: a.doctor_id ? fullName(userMap.get(a.doctor_id)) : '',
      motivo_consulta: a.motivo_consulta ?? null,
      servicios: servicios.map((s) => `${s.service_name} x${s.cantidad}`).join(', '),
    }
  })

  const payments: ReconciliationPayment[] = (payRes.data ?? []).map((p) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patient = (p as any).patients as PersonName | null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = ((p as any).payment_items ?? []) as Array<{ service_name: string; quantity: number }>
    return {
      id: p.id,
      patient_id: p.patient_id,
      appointment_id: p.appointment_id ?? null,
      patient_nombre: patient?.nombre ?? '',
      patient_apellido: patient?.apellido ?? '',
      numero_factura: p.numero_factura,
      total: Number(p.total),
      estado: p.estado,
      hora: bogotaHHMM(p.created_at),
      servicios: items.map((i) => `${i.service_name} x${i.quantity}`).join(', '),
    }
  })

  const attendances: ReconciliationAttendance[] = (
    (attRes.data ?? []) as Array<{ patient_id: string; hora: string; marked_by: string }>
  ).map((a) => ({
    patient_id: a.patient_id,
    hora: String(a.hora).slice(0, 5),
    marked_by_nombre: fullName(userMap.get(a.marked_by)),
  }))

  const medias = ((mediasRes.data ?? []) as Array<{ total: number; estado: string }>).filter(
    (m) => m.estado === 'activo'
  )

  const input: ReconciliationInput = {
    fecha,
    appointments,
    payments,
    attendances,
    medias_ventas_count: medias.length,
    medias_ventas_total: medias.reduce((s, m) => s + Number(m.total), 0),
  }

  return classifyReconciliation(input)
}

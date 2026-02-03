import { createClient } from '@/lib/supabase/server'
import type {
  PatientAttendance,
  AttendanceComparisonItem,
  AttendanceTotals,
} from '@/types'

/**
 * Get patient attendance for a specific date
 * Returns the attendance record if patient was marked as attended
 */
export async function getPatientAttendance(
  patientId: string,
  fecha?: string
): Promise<PatientAttendance | null> {
  const supabase = await createClient()
  const targetDate = fecha || new Date().toISOString().split('T')[0]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('patient_attendances')
    .select('*')
    .eq('patient_id', patientId)
    .eq('fecha', targetDate)
    .single()

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('Error fetching patient attendance:', error)
    }
    return null
  }

  return data as PatientAttendance
}

/**
 * Get attendance comparison for a specific date
 * Returns list of attended patients with their payment status
 */
export async function getAttendanceComparison(
  fecha?: string
): Promise<AttendanceComparisonItem[]> {
  const supabase = await createClient()
  const targetDate = fecha || new Date().toISOString().split('T')[0]

  // Get all attendances for the date with patient info
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: attendances, error: attError } = await (supabase as any)
    .from('patient_attendances')
    .select(`
      id,
      patient_id,
      hora,
      marked_by,
      patients(id, nombre, apellido, cedula)
    `)
    .eq('fecha', targetDate)
    .order('hora', { ascending: true })

  if (attError) {
    console.error('Error fetching attendances:', attError)
    return []
  }

  if (!attendances || attendances.length === 0) {
    return []
  }

  // Get user info for marked_by
  const markerIds = [...new Set(attendances.map((a: { marked_by: string }) => a.marked_by))]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: users } = await (supabase as any)
    .from('doctors_view')
    .select('id, email, nombre, apellido')
    .in('id', markerIds)

  const userMap = new Map(users?.map((u: { id: string }) => [u.id, u]) || [])

  // Get payments for the date
  const { data: payments, error: payError } = await supabase
    .from('payments')
    .select('id, patient_id, total, estado')
    .eq('fecha', targetDate)
    .eq('estado', 'activo')

  if (payError) {
    console.error('Error fetching payments:', payError)
  }

  // Create payment lookup by patient_id
  const paymentMap = new Map<string, { id: string; total: number; estado: string }>()
  if (payments) {
    for (const p of payments) {
      // If multiple payments, keep the one with higher total
      const existing = paymentMap.get(p.patient_id)
      if (!existing || p.total > existing.total) {
        paymentMap.set(p.patient_id, { id: p.id, total: p.total, estado: p.estado })
      }
    }
  }

  // Combine data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: AttendanceComparisonItem[] = attendances.map((att: any) => {
    const patient = att.patients
    const marker = userMap.get(att.marked_by) as { nombre?: string; apellido?: string } | undefined
    const payment = paymentMap.get(att.patient_id)

    return {
      attendance_id: att.id,
      patient_id: att.patient_id,
      patient_nombre: patient?.nombre || '',
      patient_apellido: patient?.apellido || '',
      patient_cedula: patient?.cedula || '',
      hora_atendido: att.hora,
      marked_by_nombre: marker?.nombre || '',
      marked_by_apellido: marker?.apellido || '',
      tiene_pago: !!payment,
      payment_id: payment?.id,
      payment_total: payment?.total,
      payment_estado: payment?.estado as 'activo' | 'anulado' | undefined,
    }
  })

  return result
}

/**
 * Get attendance totals for a specific date
 */
export async function getAttendanceTotals(fecha?: string): Promise<AttendanceTotals> {
  const supabase = await createClient()
  const targetDate = fecha || new Date().toISOString().split('T')[0]

  // Count attendances
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: attendances, error: attError } = await (supabase as any)
    .from('patient_attendances')
    .select('patient_id')
    .eq('fecha', targetDate)

  if (attError) {
    console.error('Error fetching attendance count:', attError)
    return { total_atendidos: 0, con_pago: 0, sin_pago: 0, monto_total: 0 }
  }

  const totalAtendidos = attendances?.length || 0
  const patientIds = attendances?.map((a: { patient_id: string }) => a.patient_id) || []

  if (totalAtendidos === 0) {
    return { total_atendidos: 0, con_pago: 0, sin_pago: 0, monto_total: 0 }
  }

  // Get payments for attended patients on this date
  const { data: payments, error: payError } = await supabase
    .from('payments')
    .select('patient_id, total')
    .eq('fecha', targetDate)
    .eq('estado', 'activo')
    .in('patient_id', patientIds)

  if (payError) {
    console.error('Error fetching payments for totals:', payError)
    return { total_atendidos: totalAtendidos, con_pago: 0, sin_pago: totalAtendidos, monto_total: 0 }
  }

  // Count unique patients with payments and sum totals
  const patientsWithPayment = new Set<string>()
  let montoTotal = 0

  if (payments) {
    for (const p of payments) {
      patientsWithPayment.add(p.patient_id)
      montoTotal += p.total
    }
  }

  const conPago = patientsWithPayment.size
  const sinPago = totalAtendidos - conPago

  return {
    total_atendidos: totalAtendidos,
    con_pago: conPago,
    sin_pago: sinPago,
    monto_total: montoTotal,
  }
}

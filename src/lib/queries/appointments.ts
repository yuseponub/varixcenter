import { createClient } from '@/lib/supabase/server'
import type { CalendarEvent, AppointmentStatus, AppointmentWithPatient } from '@/types/appointments'

/**
 * Status color mapping for calendar events.
 * Maps appointment status to FullCalendar-compatible colors.
 */
const STATUS_COLORS: Record<AppointmentStatus, { bg: string; border: string; text: string }> = {
  programada: { bg: '#3b82f6', border: '#2563eb', text: '#ffffff' },    // Blue
  confirmada: { bg: '#22c55e', border: '#16a34a', text: '#ffffff' },    // Green
  en_sala: { bg: '#f59e0b', border: '#d97706', text: '#000000' },       // Amber
  en_atencion: { bg: '#8b5cf6', border: '#7c3aed', text: '#ffffff' },   // Purple
  completada: { bg: '#6b7280', border: '#4b5563', text: '#ffffff' },    // Gray
  cancelada: { bg: '#ef4444', border: '#dc2626', text: '#ffffff' },     // Red
  no_asistio: { bg: '#f97316', border: '#ea580c', text: '#ffffff' },    // Orange
}

/**
 * Get appointments for calendar view with date range and optional doctor filter.
 * Returns data in FullCalendar event format.
 *
 * @param startDate - Start of date range (ISO string)
 * @param endDate - End of date range (ISO string)
 * @param doctorId - Optional filter by doctor (APT-02 requirement)
 * @returns Array of CalendarEvent objects ready for FullCalendar
 */
export async function getAppointmentsForCalendar(
  startDate: string,
  endDate: string,
  doctorId?: string
): Promise<CalendarEvent[]> {
  const supabase = await createClient()

  let query = supabase
    .from('appointments')
    .select(`
      id,
      patient_id,
      doctor_id,
      fecha_hora_inicio,
      fecha_hora_fin,
      estado,
      notas,
      motivo_consulta,
      patients!inner (
        id,
        cedula,
        nombre,
        apellido,
        celular
      )
    `)
    .gte('fecha_hora_inicio', startDate)
    .lte('fecha_hora_inicio', endDate)
    .order('fecha_hora_inicio', { ascending: true })

  // Apply doctor filter if specified (APT-02)
  if (doctorId) {
    query = query.eq('doctor_id', doctorId)
  }

  const { data, error } = await query

  if (error) throw error
  if (!data) return []

  // Transform to CalendarEvent format
  return data.map((appointment) => {
    const patient = appointment.patients as unknown as {
      id: string
      cedula: string
      nombre: string
      apellido: string
      celular: string
    }
    const colors = STATUS_COLORS[appointment.estado as AppointmentStatus]

    return {
      id: appointment.id,
      title: `${patient.nombre} ${patient.apellido}`,
      start: appointment.fecha_hora_inicio,
      end: appointment.fecha_hora_fin,
      backgroundColor: colors.bg,
      borderColor: colors.border,
      textColor: colors.text,
      extendedProps: {
        appointmentId: appointment.id,
        patientId: patient.id,
        patientName: `${patient.nombre} ${patient.apellido}`,
        patientCedula: patient.cedula,
        patientCelular: patient.celular,
        doctorId: appointment.doctor_id,
        estado: appointment.estado as AppointmentStatus,
        motivoConsulta: appointment.motivo_consulta,
        notas: appointment.notas,
      },
    }
  })
}

/**
 * Get a single appointment by ID with patient data.
 *
 * @param id - Appointment UUID
 * @returns Appointment with patient data or null if not found
 */
export async function getAppointmentById(id: string): Promise<AppointmentWithPatient | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('appointments')
    .select(`
      id,
      patient_id,
      doctor_id,
      fecha_hora_inicio,
      fecha_hora_fin,
      estado,
      notas,
      motivo_consulta,
      created_by,
      created_at,
      updated_at,
      patients!inner (
        id,
        cedula,
        nombre,
        apellido,
        celular
      )
    `)
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      // Not found
      return null
    }
    throw error
  }

  return data as unknown as AppointmentWithPatient
}

/**
 * Get list of doctors for appointment scheduling.
 * Uses doctors_view which doesn't require service role.
 *
 * @returns Array of doctors with id, email, nombre, apellido
 */
export async function getDoctors() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('doctors_view')
    .select('id, email, nombre, apellido')
    .not('id', 'is', null)
    .order('apellido', { ascending: true })

  if (error) throw error

  // Filter to ensure non-null id and email, keep null for nombre/apellido
  return (data ?? [])
    .filter((d): d is { id: string; email: string; nombre: string | null; apellido: string | null } =>
      d.id !== null && d.email !== null
    )
    .map(d => ({
      id: d.id,
      email: d.email,
      nombre: d.nombre,
      apellido: d.apellido,
    }))
}

/**
 * Get appointments for a specific patient.
 * Useful for patient detail page and history.
 *
 * @param patientId - Patient UUID
 * @param limit - Max appointments to return (default 20)
 * @returns Array of appointments sorted by most recent first
 */
export async function getAppointmentsByPatient(patientId: string, limit = 20) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('appointments')
    .select(`
      id,
      patient_id,
      doctor_id,
      fecha_hora_inicio,
      fecha_hora_fin,
      estado,
      notas,
      motivo_consulta,
      created_at
    `)
    .eq('patient_id', patientId)
    .order('fecha_hora_inicio', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data ?? []
}

/**
 * Count appointments for a specific date.
 * Useful for dashboard metrics and availability checks.
 *
 * @param date - Date string (YYYY-MM-DD format)
 * @param doctorId - Optional filter by doctor
 * @returns Count of appointments for that date
 */
export async function countAppointmentsForDate(
  date: string,
  doctorId?: string
): Promise<number> {
  const supabase = await createClient()

  // Build date range for the full day
  const startOfDay = `${date}T00:00:00.000-05:00`
  const endOfDay = `${date}T23:59:59.999-05:00`

  let query = supabase
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .gte('fecha_hora_inicio', startOfDay)
    .lte('fecha_hora_inicio', endOfDay)

  if (doctorId) {
    query = query.eq('doctor_id', doctorId)
  }

  const { count, error } = await query

  if (error) throw error
  return count ?? 0
}

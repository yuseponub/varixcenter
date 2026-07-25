import { createClient } from '@/lib/supabase/server'
import type { CalendarEvent, AppointmentStatus, AppointmentWithPatient } from '@/types/appointments'
import { getPatientNameIndex, matchPatientBySubject } from '@/lib/queries/patient-name-index'

/**
 * Status color mapping for calendar events.
 * Maps appointment status to FullCalendar-compatible colors.
 */
// Paleta "Aqua clínica": fondos suaves + borde izquierdo saturado por estado.
const STATUS_COLORS: Record<AppointmentStatus, { bg: string; border: string; text: string }> = {
  programada: { bg: 'oklch(0.94 0.03 210)', border: 'oklch(0.55 0.13 200)', text: 'oklch(0.35 0.08 210)' },
  confirmada: { bg: 'oklch(0.95 0.05 155)', border: 'oklch(0.62 0.15 165)', text: 'oklch(0.38 0.1 160)' },
  en_sala: { bg: 'oklch(0.97 0.05 90)', border: 'oklch(0.75 0.15 85)', text: 'oklch(0.5 0.12 78)' },
  en_atencion: { bg: 'oklch(0.55 0.13 200)', border: 'oklch(0.45 0.12 205)', text: '#ffffff' },
  completada: { bg: 'oklch(0.94 0.008 210)', border: 'oklch(0.7 0.02 210)', text: 'oklch(0.45 0.03 210)' },
  cancelada: { bg: 'oklch(0.95 0.03 25)', border: 'oklch(0.6 0.18 27)', text: 'oklch(0.52 0.19 27)' },
  no_asistio: { bg: 'oklch(0.96 0.04 60)', border: 'oklch(0.68 0.15 55)', text: 'oklch(0.5 0.14 50)' },
}

/**
 * Muestra el asunto de un evento de Outlook sin el prefijo "Outlook ·" ni la
 * hora inicial ("8.00 NOMBRE" → "NOMBRE"). El color del evento ya indica que
 * proviene de Outlook, así que el título queda limpio con solo el nombre.
 */
function cleanOutlookSubject(subject: string): string {
  const withoutTime = subject.replace(/^\s*\d{1,2}[.:hH]\d{2}\s*/, '').trim()
  return withoutTime || subject.trim()
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
      ),
      appointment_services (
        service_name,
        cantidad
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

  // Transform native Varix appointments to FullCalendar events.
  const appointmentEvents: CalendarEvent[] = data.map((appointment) => {
    const patient = appointment.patients as unknown as {
      id: string
      cedula: string
      nombre: string
      apellido: string
      celular: string
    }
    const colors = STATUS_COLORS[appointment.estado as AppointmentStatus]

    // Procedimientos agendados: "Sesion Piernas ×2", para mostrar en la card.
    const servicios = (
      (appointment as unknown as {
        appointment_services?: { service_name: string; cantidad: number }[]
      }).appointment_services ?? []
    ).map((s) => (s.cantidad > 1 ? `${s.service_name} ×${s.cantidad}` : s.service_name))

    return {
      id: appointment.id,
      title: `${patient.nombre} ${patient.apellido}`,
      start: appointment.fecha_hora_inicio,
      end: appointment.fecha_hora_fin,
      editable: true,
      backgroundColor: colors.bg,
      borderColor: colors.border,
      textColor: colors.text,
      classNames: [`evt-${appointment.estado}`],
      extendedProps: {
        source: 'varix',
        appointmentId: appointment.id,
        patientId: patient.id,
        patientName: `${patient.nombre} ${patient.apellido}`,
        patientCedula: patient.cedula,
        patientCelular: patient.celular,
        doctorId: appointment.doctor_id,
        estado: appointment.estado as AppointmentStatus,
        motivoConsulta: appointment.motivo_consulta,
        notas: appointment.notas,
        servicios,
      },
    }
  })

  // Outlook events have no reliable doctor mapping while they remain free-text.
  // Show them in the all-doctors view; linked events are represented by their
  // native appointment and therefore hidden here. Conflicts remain visible.
  if (doctorId) return appointmentEvents

  // Índice de pacientes para mapear por nombre los eventos de Outlook (texto
  // libre) a un paciente existente. Si falla, se sigue sin mapeo.
  const patientIndex = await getPatientNameIndex().catch((indexError) => {
    console.error('[Outlook] No se pudo cargar el índice de pacientes:', indexError)
    return []
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: outlookData, error: outlookError } = await (supabase as any)
    .from('outlook_events')
    .select(`
      id,
      graph_event_id,
      subject,
      start_at,
      end_at,
      is_all_day,
      location,
      web_link,
      appointment_id,
      match_status
    `)
    .gte('start_at', startDate)
    .lte('start_at', endDate)
    .is('deleted_at', null)
    .eq('is_cancelled', false)
    .or('appointment_id.is.null,match_status.eq.conflict')
    .order('start_at', { ascending: true })

  if (outlookError) {
    // Allows code promotion before migration 065 without breaking the core agenda.
    if (outlookError.code !== '42P01' && outlookError.code !== 'PGRST205') {
      console.error('[Outlook] Error loading mirrored calendar:', outlookError)
    }
    return appointmentEvents
  }

  const outlookEvents: CalendarEvent[] = (outlookData ?? []).map((event: {
    id: string
    graph_event_id: string
    subject: string
    start_at: string
    end_at: string
    is_all_day: boolean
    location: string | null
    web_link: string | null
    appointment_id: string | null
    match_status: string
  }) => {
    const conflict = event.match_status === 'conflict'
    const matched = matchPatientBySubject(event.subject, patientIndex)
    return {
      id: `outlook-${event.id}`,
      title: cleanOutlookSubject(event.subject),
      start: event.is_all_day ? event.start_at.slice(0, 10) : event.start_at,
      end: event.is_all_day ? event.end_at.slice(0, 10) : event.end_at,
      allDay: event.is_all_day,
      editable: false,
      backgroundColor: conflict ? 'oklch(0.52 0.19 27)' : 'oklch(0.45 0.12 210)',
      borderColor: conflict ? 'oklch(0.42 0.17 27)' : 'oklch(0.38 0.1 212)',
      textColor: '#ffffff',
      extendedProps: {
        source: 'outlook',
        appointmentId: event.appointment_id ?? '',
        patientId: matched?.id ?? '',
        patientName: cleanOutlookSubject(event.subject),
        patientCedula: matched?.cedula ?? '',
        patientCelular: matched?.celular ?? '',
        matchedPatientName: matched?.name ?? null,
        doctorId: null,
        estado: 'programada',
        motivoConsulta: null,
        notas: null,
        outlookEventId: event.graph_event_id,
        outlookWebLink: event.web_link,
        outlookLocation: event.location,
        outlookConflict: conflict,
        outlookAllDay: event.is_all_day,
      },
    }
  })

  // The reception PC can also mirror a local PST calendar through the desktop
  // bridge. The local Outlook row is authoritative for calendar display and
  // remains read-only; a linked native row is hidden to avoid a duplicate.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: desktopData, error: desktopError } = await (supabase as any)
    .from('outlook_desktop_events')
    .select(`
      id,
      external_id,
      subject,
      start_at,
      end_at,
      is_all_day,
      location,
      appointment_id,
      match_status
    `)
    .gte('start_at', startDate)
    .lte('start_at', endDate)
    .is('deleted_at', null)
    .neq('match_status', 'ignored')
    .order('start_at', { ascending: true })

  if (desktopError) {
    if (desktopError.code !== '42P01' && desktopError.code !== 'PGRST205') {
      console.error('[Outlook desktop] Error loading mirrored calendar:', desktopError)
    }
    return [...appointmentEvents, ...outlookEvents]
  }

  // Una cita nativa de Varix (editable, con máquina de estados) manda sobre el
  // espejo de Outlook: una vez el evento de escritorio se vincula a una cita
  // nativa (al convertirlo), se oculta el espejo read-only y se muestra la cita
  // nativa que sí se puede confirmar, mover de estado, etc.
  const unlinkedDesktopData = (desktopData ?? []).filter(
    (event: { appointment_id: string | null }) => !event.appointment_id
  )

  const desktopEvents: CalendarEvent[] = unlinkedDesktopData.map((event: {
    id: string
    external_id: string
    subject: string
    start_at: string
    end_at: string
    is_all_day: boolean
    location: string | null
    appointment_id: string | null
    match_status: string
  }) => {
    const conflict = event.match_status === 'conflict'
    const matched = matchPatientBySubject(event.subject, patientIndex)
    return {
      id: `outlook-desktop-${event.id}`,
      title: cleanOutlookSubject(event.subject),
      start: event.is_all_day ? event.start_at.slice(0, 10) : event.start_at,
      end: event.is_all_day ? event.end_at.slice(0, 10) : event.end_at,
      allDay: event.is_all_day,
      editable: false,
      backgroundColor: conflict ? 'oklch(0.52 0.19 27)' : 'oklch(0.5 0.1 205)',
      borderColor: conflict ? 'oklch(0.42 0.17 27)' : 'oklch(0.42 0.09 208)',
      textColor: '#ffffff',
      extendedProps: {
        source: 'outlook',
        appointmentId: event.appointment_id ?? '',
        patientId: matched?.id ?? '',
        patientName: cleanOutlookSubject(event.subject),
        patientCedula: matched?.cedula ?? '',
        patientCelular: matched?.celular ?? '',
        matchedPatientName: matched?.name ?? null,
        doctorId: null,
        estado: 'programada',
        motivoConsulta: null,
        notas: null,
        outlookEventId: `desktop:${event.external_id}`,
        outlookWebLink: null,
        outlookLocation: event.location,
        outlookConflict: conflict,
        outlookAllDay: event.is_all_day,
      },
    }
  })

  return [...appointmentEvents, ...outlookEvents, ...desktopEvents]
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

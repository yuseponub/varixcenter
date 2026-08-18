import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import {
  getPatientNameIndex,
  type IndexedPatient,
} from '@/lib/queries/patient-name-index'
import {
  scoreName,
  searchTokens,
  toAccentInsensitivePattern,
} from '@/lib/appointments/name-match'
import { STATUS_COLORS, cleanOutlookSubject } from '@/lib/queries/appointments'
import type { AppointmentStatus, CalendarEvent } from '@/types/appointments'

/**
 * GET /api/appointments/search?q=<texto>
 *
 * Busca a una persona en la agenda y devuelve TODAS sus citas, sin importar de
 * dónde nacieron: citas nativas de Varix, eventos espejo de Outlook (Graph) y
 * eventos del puente de escritorio del PC de recepción. El calendario ya pinta
 * las tres fuentes; el buscador tenía que hacer lo mismo o la recepción concluía
 * que "la cita no existe" cuando solo vivía en Outlook.
 *
 * Reglas de coincidencia:
 * - El texto se parte en palabras y TODAS deben aparecer, en cualquier orden.
 *   Así "gomez maria" y "maria gomez" encuentran a la misma persona.
 * - Sin tildes y sin distinguir mayúsculas, a ambos lados de la comparación.
 * - Si el texto trae 4+ dígitos también se busca por cédula y celular.
 *
 * Orden del resultado: primero las citas de hoy en adelante (la pregunta real de
 * recepción es "¿tiene cita?"), y después el historial reciente.
 */

/** Cuántas citas futuras y pasadas se piden por fuente. */
const UPCOMING_PER_SOURCE = 12
const PAST_PER_SOURCE = 6
/** Tope de pacientes que alimentan la consulta de citas nativas. */
const MAX_PATIENTS = 80

interface SearchResultEvent extends CalendarEvent {
  /** Etiqueta de origen para la lista de resultados. */
  origen: 'varix' | 'outlook' | 'outlook-escritorio'
  /** Nombre a mostrar como titular del resultado. */
  displayName: string
  cedula: string
  celular: string
  doctorName: string | null
  /** Si la cita es de hoy en adelante. Lo decide la consulta, no una
   *  comparación de cadenas: un evento de todo el día se guarda como
   *  'YYYY-MM-DD' y no se puede comparar contra un ISO completo. */
  esProxima: boolean
  /** Instante real de inicio (ISO), para ordenar sin ambigüedad. */
  sortKey: string
}

/**
 * Puntúa a un paciente contra los términos buscados. Devuelve null si alguno de
 * los términos no aparece. Un término que arranca palabra puntúa más que uno
 * que cae a mitad de palabra, para que "gom" saque antes a GOMEZ que a ANGOMEZ.
 */
function scorePatient(patient: IndexedPatient, tokens: string[], digits: string): number | null {
  const direct = scoreName(patient.normalized, tokens)
  if (direct !== null) return direct

  // Documento o celular: solo si lo escrito es un número, no si son dígitos
  // sueltos dentro de un nombre. Si no, "Daniela 1005" sacaría a cualquiera
  // cuya cédula contenga 1005, con el nombre completamente ignorado.
  const soloNumeros = tokens.every((token) => /^[0-9]+$/.test(token))
  if (soloNumeros && digits.length >= 4 && matchesDigits(patient, digits)) return 3
  return null
}

function matchesDigits(patient: IndexedPatient, digits: string): boolean {
  return (
    (patient.cedula || '').includes(digits) ||
    (patient.celular || '').replace(/\D/g, '').includes(digits)
  )
}

/** Medianoche de hoy en Bogotá, expresada en UTC (Colombia es UTC−5 fijo). */
function bogotaStartOfToday(): string {
  const now = new Date()
  const bogota = new Date(now.getTime() - 5 * 60 * 60 * 1000)
  return new Date(
    Date.UTC(bogota.getUTCFullYear(), bogota.getUTCMonth(), bogota.getUTCDate(), 5, 0, 0)
  ).toISOString()
}

export async function GET(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const rawQuery = searchParams.get('q')?.trim() || ''

  const tokens = searchTokens(rawQuery)
  const digits = rawQuery.replace(/\D/g, '')

  if (tokens.length === 0) {
    return NextResponse.json({ appointments: [] })
  }

  const cutoff = bogotaStartOfToday()

  const [varixResults, outlookResults, desktopResults] = await Promise.all([
    searchVarixAppointments(supabase, tokens, digits, cutoff),
    searchOutlookEvents(supabase, tokens, cutoff, 'outlook_events', 'outlook'),
    searchOutlookEvents(supabase, tokens, cutoff, 'outlook_desktop_events', 'outlook-escritorio'),
  ])

  const all = [...varixResults, ...outlookResults, ...desktopResults]

  // Un evento espejo ya vinculado a una cita nativa se representa por la cita
  // nativa, igual que hace el calendario; si no, saldría dos veces.
  const nativeIds = new Set(
    varixResults.map((event) => event.extendedProps.appointmentId).filter(Boolean)
  )
  const deduped = all.filter(
    (event) =>
      event.origen === 'varix' || !nativeIds.has(event.extendedProps.appointmentId)
  )

  const upcoming = deduped
    .filter((event) => event.esProxima)
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
  const past = deduped
    .filter((event) => !event.esProxima)
    .sort((a, b) => b.sortKey.localeCompare(a.sortKey))

  return NextResponse.json({
    appointments: [...upcoming.slice(0, 15), ...past.slice(0, 8)],
    upcomingCount: upcoming.length,
  })
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Citas nativas de Varix, resueltas por el índice de pacientes en memoria. */
async function searchVarixAppointments(
  supabase: any,
  tokens: string[],
  digits: string,
  cutoff: string
): Promise<SearchResultEvent[]> {
  const index = await getPatientNameIndex().catch((error) => {
    console.error('[Buscador] No se pudo cargar el índice de pacientes:', error)
    return [] as IndexedPatient[]
  })

  const scored: Array<{ patient: IndexedPatient; score: number }> = []
  for (const patient of index) {
    const score = scorePatient(patient, tokens, digits)
    if (score !== null) scored.push({ patient, score })
  }
  if (scored.length === 0) return []

  scored.sort((a, b) => b.score - a.score)
  const patientIds = scored.slice(0, MAX_PATIENTS).map((entry) => entry.patient.id)

  const select = `
    id,
    fecha_hora_inicio,
    fecha_hora_fin,
    estado,
    motivo_consulta,
    notas,
    doctor_id,
    patient_id,
    patients!inner ( id, cedula, nombre, apellido, celular ),
    appointment_services ( service_name, cantidad )
  `

  const base = () =>
    supabase.from('appointments').select(select).in('patient_id', patientIds)

  const [upcoming, past] = await Promise.all([
    base().gte('fecha_hora_inicio', cutoff).order('fecha_hora_inicio', { ascending: true }).limit(UPCOMING_PER_SOURCE),
    base().lt('fecha_hora_inicio', cutoff).order('fecha_hora_inicio', { ascending: false }).limit(PAST_PER_SOURCE),
  ])

  if (upcoming.error) console.error('[Buscador] Citas futuras:', upcoming.error)
  if (past.error) console.error('[Buscador] Citas pasadas:', past.error)

  const rows = [
    ...(upcoming.data ?? []).map((row: any) => ({ row, esProxima: true })),
    ...(past.data ?? []).map((row: any) => ({ row, esProxima: false })),
  ]
  const doctorNames = await loadDoctorNames(supabase, rows.map((entry) => entry.row.doctor_id))

  return rows.map(({ row, esProxima }: { row: any; esProxima: boolean }) => {
    const patient = row.patients
    const colors = STATUS_COLORS[row.estado as AppointmentStatus]
    const fullName = `${patient.nombre} ${patient.apellido}`.replace(/\s+/g, ' ').trim()
    const servicios = (row.appointment_services ?? []).map((service: any) =>
      service.cantidad > 1 ? `${service.service_name} ×${service.cantidad}` : service.service_name
    )

    return {
      id: row.id,
      title: fullName,
      start: row.fecha_hora_inicio,
      end: row.fecha_hora_fin,
      editable: true,
      backgroundColor: colors.bg,
      borderColor: colors.border,
      textColor: colors.text,
      classNames: [`evt-${row.estado}`],
      origen: 'varix' as const,
      displayName: fullName,
      cedula: patient.cedula ?? '',
      celular: patient.celular ?? '',
      doctorName: doctorNames.get(row.doctor_id) ?? null,
      esProxima,
      sortKey: row.fecha_hora_inicio,
      extendedProps: {
        source: 'varix' as const,
        appointmentId: row.id,
        patientId: patient.id,
        patientName: fullName,
        patientCedula: patient.cedula ?? '',
        patientCelular: patient.celular ?? '',
        doctorId: row.doctor_id,
        estado: row.estado as AppointmentStatus,
        motivoConsulta: row.motivo_consulta,
        notas: row.notas,
        servicios,
      },
    }
  })
}

/**
 * Eventos espejo de Outlook. El paciente no está relacionado por clave, solo
 * escrito a mano en el asunto, así que la coincidencia se hace contra el texto
 * del asunto con un regex tolerante a tildes.
 */
async function searchOutlookEvents(
  supabase: any,
  tokens: string[],
  cutoff: string,
  table: 'outlook_events' | 'outlook_desktop_events',
  origen: 'outlook' | 'outlook-escritorio'
): Promise<SearchResultEvent[]> {
  const isDesktop = table === 'outlook_desktop_events'
  const idColumn = isDesktop ? 'external_id' : 'graph_event_id'
  const select = `
    id,
    ${idColumn},
    subject,
    start_at,
    end_at,
    is_all_day,
    location,
    ${isDesktop ? '' : 'web_link,'}
    appointment_id,
    match_status
  `

  const base = (modo: 'imatch' | 'ilike') => {
    let query = supabase
      .from(table)
      .select(select)
      .is('deleted_at', null)
    if (isDesktop) {
      // Mismo criterio que el calendario: un evento ya convertido en cita
      // nativa se representa por la cita, no por su espejo de solo lectura.
      query = query.neq('match_status', 'ignored').is('appointment_id', null)
    } else {
      query = query
        .eq('is_cancelled', false)
        .or('appointment_id.is.null,match_status.eq.conflict')
    }
    for (const token of tokens) {
      query = modo === 'imatch'
        ? query.imatch('subject', toAccentInsensitivePattern(token))
        : query.ilike('subject', `%${token}%`)
    }
    return query
  }

  const consultar = (modo: 'imatch' | 'ilike') =>
    Promise.all([
      base(modo).gte('start_at', cutoff).order('start_at', { ascending: true }).limit(UPCOMING_PER_SOURCE),
      base(modo).lt('start_at', cutoff).order('start_at', { ascending: false }).limit(PAST_PER_SOURCE),
    ])

  // La tabla todavía no existe: código promovido antes de correr la migración.
  const tablaAusente = (error: any) =>
    error && (error.code === '42P01' || error.code === 'PGRST205')

  let [upcoming, past] = await consultar('imatch')

  // `imatch` (~*) es lo que hace la comparación tolerante a tildes. Si este
  // PostgREST no lo acepta, la búsqueda en Outlook se caería entera y en
  // silencio; se reintenta con `ilike`, que pierde las tildes pero encuentra.
  const falloOperador = [upcoming, past].some(
    (result) => result.error && !tablaAusente(result.error)
  )
  if (falloOperador) {
    console.error(`[Buscador] ${table}: reintentando con ilike:`, upcoming.error || past.error)
    ;[upcoming, past] = await consultar('ilike')
  }

  for (const result of [upcoming, past]) {
    if (result.error && !tablaAusente(result.error)) {
      console.error(`[Buscador] ${table}:`, result.error)
    }
  }

  const rows = [
    ...(upcoming.data ?? []).map((row: any) => ({ row, esProxima: true })),
    ...(past.data ?? []).map((row: any) => ({ row, esProxima: false })),
  ]

  return rows.map(({ row, esProxima }: { row: any; esProxima: boolean }) => {
    const conflict = row.match_status === 'conflict'
    const title = cleanOutlookSubject(row.subject)
    return {
      id: `${isDesktop ? 'outlook-desktop' : 'outlook'}-${row.id}`,
      title,
      start: row.is_all_day ? row.start_at.slice(0, 10) : row.start_at,
      end: row.is_all_day ? row.end_at.slice(0, 10) : row.end_at,
      allDay: row.is_all_day,
      editable: false,
      backgroundColor: conflict ? 'oklch(0.52 0.19 27)' : 'oklch(0.45 0.12 210)',
      borderColor: conflict ? 'oklch(0.42 0.17 27)' : 'oklch(0.38 0.1 212)',
      textColor: '#ffffff',
      origen,
      displayName: title,
      cedula: '',
      celular: '',
      doctorName: null,
      esProxima,
      sortKey: row.start_at,
      extendedProps: {
        source: 'outlook' as const,
        appointmentId: row.appointment_id ?? '',
        patientId: '',
        patientName: title,
        patientCedula: '',
        patientCelular: '',
        doctorId: null,
        estado: 'programada' as AppointmentStatus,
        motivoConsulta: null,
        notas: null,
        outlookEventId: isDesktop ? `desktop:${row.external_id}` : row.graph_event_id,
        outlookWebLink: isDesktop ? null : row.web_link,
        outlookLocation: row.location,
        outlookConflict: conflict,
        outlookAllDay: row.is_all_day,
      },
    }
  })
}

/** Nombre del médico para mostrarlo en el resultado, sin romper si falta. */
async function loadDoctorNames(
  supabase: any,
  ids: Array<string | null>
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))]
  if (unique.length === 0) return new Map()

  const { data, error } = await supabase
    .from('doctors_view')
    .select('id, nombre, apellido, email')
    .in('id', unique)

  if (error) {
    console.error('[Buscador] Médicos:', error)
    return new Map()
  }

  return new Map(
    (data ?? []).map((doctor: any) => [
      doctor.id,
      `${doctor.nombre ?? ''} ${doctor.apellido ?? ''}`.trim() || doctor.email,
    ])
  )
}

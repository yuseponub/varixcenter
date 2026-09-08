import { createClient } from '@/lib/supabase/server'
import { getPatientNotifications } from './notifications'
import { normalizeName, toAccentInsensitivePattern } from '@/lib/appointments/name-match'

/**
 * Normalize text for phonetic search (Spanish)
 * Handles: S/C/Z, B/V, Y/I, Ñ/N, accents, case
 */
function normalizeForSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[csz]/g, 's')          // S = C = Z
    .replace(/[bv]/g, 'b')           // B = V
    .replace(/[yi]/g, 'i')           // Y = I
    .replace(/ñ/g, 'n')              // Ñ = N
    .replace(/[^a-z0-9\s]/g, '')     // Remove special chars
    .replace(/\s+/g, ' ')            // Normalize spaces
    .trim()
}

/** Mismas equivalencias fonéticas que el buscador existente, dentro de SQL. */
function phoneticPattern(word: string): string {
  return Array.from(normalizeForSearch(word), (char) => {
    if (char === 's') return '[scçzSCÇZ]'
    if (char === 'b') return '[bvBV]'
    if (char === 'i') return '[yiíìïîYIÍÌÏÎ]'
    return toAccentInsensitivePattern(char.toUpperCase())
  }).join('')
}

/**
 * Search patients by cedula, nombre, apellido, or celular
 * Smart search with phonetic matching for Spanish names
 *
 * @param query - Search term (partial match on multiple fields)
 * @param limit - Max results to return (default 50)
 * @returns Matching patients sorted by relevance
 */
export async function searchPatients(query: string, limit = 50) {
  const supabase = await createClient()

  // If empty query, return recent patients
  if (!query.trim()) {
    const { data, error } = await supabase
      .from('patients')
      .select('id, cedula, nombre, apellido, celular, created_at')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw error
    return data
  }

  const searchTerm = query.trim()

  // Admitir documentos/teléfonos con separadores sin interpretar números
  // sueltos dentro de un nombre como una búsqueda de cualquier documento.
  if (/^[+\d\s.()-]+$/.test(searchTerm) && /\d/.test(searchTerm)) {
    const pattern = searchTerm.replace(/\D/g, '').split('').join('[^0-9]*')
    const { data, error } = await supabase
      .from('patients')
      .select('id, cedula, nombre, apellido, celular, created_at')
      .or(`cedula.imatch.${pattern},celular.imatch.${pattern}`)
      .order('apellido', { ascending: true })
      .order('nombre', { ascending: true })
      .order('id', { ascending: true })
      .limit(limit)

    if (error) throw error
    return data
  }

  // Solo letras/números normalizados llegan a la gramática de PostgREST.
  // La puntuación separa términos y nunca se convierte en un filtro/comodín.
  const words = normalizeName(searchTerm).split(' ').filter(Boolean)
  if (words.length === 0) return []

  const findNames = async (phonetic: boolean) => {
    let request = supabase
      .from('patients')
      .select('id, cedula, nombre, apellido, celular, created_at')

    // AND entre palabras, OR entre nombre/apellido. El límite se aplica DESPUÉS
    // de comprobar todos los términos, incluso si hay miles de nombres iguales.
    for (const word of words) {
      const pattern = phonetic ? phoneticPattern(word) : toAccentInsensitivePattern(word)
      request = request.or(`nombre.imatch.${pattern},apellido.imatch.${pattern}`)
    }
    const { data, error } = await request
      .order('apellido', { ascending: true })
      .order('nombre', { ascending: true })
      .order('id', { ascending: true })
      .limit(limit)
    if (error) throw error
    return data ?? []
  }

  // Las coincidencias directas (sin tildes) tienen prioridad ANTES del límite;
  // las variantes fonéticas completan la lista sin desplazar al nombre escrito.
  const exact = await findNames(false)
  if (exact.length >= limit) return exact
  const phonetic = await findNames(true)
  const seen = new Set(exact.map(patient => patient.id))
  return [...exact, ...phonetic.filter(patient => !seen.has(patient.id))].slice(0, limit)
}

/**
 * Get a single patient by ID with all fields
 *
 * @param id - Patient UUID
 * @returns Full patient record or null if not found
 */
export async function getPatientById(id: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      // Not found
      return null
    }
    throw error
  }

  return data
}

/**
 * Get patient timeline from audit_log AND notifications
 * Shows history of changes and SMS reminders
 *
 * @param patientId - Patient UUID
 * @param limit - Max events to return (default 20)
 * @returns Timeline events sorted by most recent first
 */
export async function getPatientTimeline(patientId: string, limit = 20) {
  const supabase = await createClient()

  // Get audit log entries
  const { data, error } = await supabase
    .from('audit_log')
    .select('id, action, changed_fields, changed_at, old_data, new_data')
    .eq('table_name', 'patients')
    .eq('record_id', patientId)
    .order('changed_at', { ascending: false })
    .limit(limit)

  if (error) throw error

  // Transform audit log entries into timeline events
  const auditEvents = data.map((entry) => ({
    id: String(entry.id),
    type: 'patient_record' as const,
    action: entry.action,
    changedFields: entry.changed_fields,
    timestamp: entry.changed_at,
    details: getTimelineEventDetails(entry),
  }))

  // Get notifications for this patient
  let notificationEvents: Array<{
    id: string
    type: 'sms_reminder'
    action: string
    changedFields: null
    timestamp: string
    details: string
  }> = []

  try {
    const notifications = await getPatientNotifications(patientId, limit)
    notificationEvents = notifications.map((notif) => ({
      id: notif.id,
      type: 'sms_reminder' as const,
      action: notif.estado,
      changedFields: null,
      timestamp: notif.enviado_at || notif.created_at,
      details: `Recordatorio ${notif.tipo_recordatorio === '24h' ? '24 horas' : '2 horas'} - ${
        notif.estado === 'enviado'
          ? 'Enviado'
          : notif.estado === 'fallido'
            ? 'Fallido'
            : 'Pendiente'
      }`,
    }))
  } catch (err) {
    // If notifications table doesn't exist yet, continue without
    console.warn('Could not fetch notifications for timeline:', err)
  }

  // Merge and sort by timestamp
  const allEvents = [...auditEvents, ...notificationEvents].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )

  return allEvents.slice(0, limit)
}

/**
 * Helper to generate human-readable timeline event descriptions
 */
function getTimelineEventDetails(entry: {
  action: string
  changed_fields: string[] | null
  old_data: unknown
  new_data: unknown
}): string {
  switch (entry.action) {
    case 'INSERT':
      return 'Paciente registrado en el sistema'
    case 'UPDATE':
      if (entry.changed_fields?.length) {
        return `Datos actualizados: ${entry.changed_fields.join(', ')}`
      }
      return 'Datos del paciente actualizados'
    case 'DELETE':
      return 'Paciente eliminado del sistema'
    default:
      return 'Cambio en registro'
  }
}

/**
 * Check if a cedula already exists
 * Used before creating a patient to provide better UX
 *
 * @param cedula - Cedula to check
 * @returns true if cedula exists, false otherwise
 */
export async function cedulaExists(cedula: string): Promise<boolean> {
  const supabase = await createClient()

  const { count, error } = await supabase
    .from('patients')
    .select('id', { count: 'exact', head: true })
    .eq('cedula', cedula)

  if (error) throw error
  return (count ?? 0) > 0
}

/**
 * Get paginated list of patients
 *
 * @param page - Page number (1-indexed)
 * @param limit - Items per page
 * @returns Paginated patients with total count
 */
export async function getPatientsPage(page = 1, limit = 20) {
  const supabase = await createClient()
  const offset = (page - 1) * limit

  // Get total count
  const { count, error: countError } = await supabase
    .from('patients')
    .select('id', { count: 'exact', head: true })

  if (countError) throw countError

  // Get page data
  const { data, error } = await supabase
    .from('patients')
    .select('id, cedula, nombre, apellido, celular, created_at')
    .order('apellido', { ascending: true })
    .range(offset, offset + limit - 1)

  if (error) throw error

  return {
    data,
    pagination: {
      page,
      limit,
      total: count ?? 0,
      totalPages: Math.ceil((count ?? 0) / limit),
    },
  }
}

import { createClient } from '@/lib/supabase/server'
import { getPatientNotifications } from './notifications'

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

/**
 * Check if patient matches search query
 * Uses phonetic matching for Spanish names
 */
function patientMatchesSearch(
  patient: { cedula: string | null; nombre: string | null; apellido: string | null; celular: string | null },
  searchWords: string[]
): boolean {
  const cedula = (patient.cedula || '').toLowerCase()
  const celular = (patient.celular || '').toLowerCase()
  const fullName = normalizeForSearch(`${patient.nombre || ''} ${patient.apellido || ''}`)

  // Check if search is a number (cedula/celular search)
  const searchTerm = searchWords.join(' ')
  if (/^\d+$/.test(searchTerm)) {
    return cedula.includes(searchTerm) || celular.includes(searchTerm)
  }

  // For name search, all words must match in the full name
  const normalizedWords = searchWords.map(w => normalizeForSearch(w))
  return normalizedWords.every(word => fullName.includes(word))
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
  const words = searchTerm.split(/\s+/).filter(w => w.length > 0)

  // For numeric search (cedula/celular), use direct query
  if (/^\d+$/.test(searchTerm)) {
    const pattern = `%${searchTerm}%`
    const { data, error } = await supabase
      .from('patients')
      .select('id, cedula, nombre, apellido, celular, created_at')
      .or(`cedula.ilike.${pattern},celular.ilike.${pattern}`)
      .order('apellido', { ascending: true })
      .limit(limit)

    if (error) throw error
    return data
  }

  // For name search, search with original terms AND phonetic variants
  // Generate variants for each word
  const generateVariants = (word: string): string[] => {
    const lower = word.toLowerCase()
    const variants = new Set<string>([lower])

    // Add common Spanish phonetic variants
    variants.add(lower.replace(/s/g, 'c'))
    variants.add(lower.replace(/s/g, 'z'))
    variants.add(lower.replace(/c/g, 's'))
    variants.add(lower.replace(/c/g, 'z'))
    variants.add(lower.replace(/z/g, 's'))
    variants.add(lower.replace(/z/g, 'c'))
    variants.add(lower.replace(/b/g, 'v'))
    variants.add(lower.replace(/v/g, 'b'))
    variants.add(lower.replace(/y/g, 'i'))
    variants.add(lower.replace(/i/g, 'y'))
    variants.add(lower.replace(/ñ/g, 'n'))
    variants.add(lower.replace(/n/g, 'ñ'))

    return Array.from(variants).filter(v => v.length > 0)
  }

  // Get variants for first word only (to limit query size)
  const firstWordVariants = generateVariants(words[0])

  // Build OR query - search in nombre and apellido for all variants
  const orFilters = firstWordVariants
    .flatMap(v => [`nombre.ilike.%${v}%`, `apellido.ilike.%${v}%`])
    .join(',')

  const { data, error } = await supabase
    .from('patients')
    .select('id, cedula, nombre, apellido, celular, created_at')
    .or(orFilters)
    .limit(500) // Get more candidates for filtering

  if (error) throw error

  // Filter with phonetic matching for multi-word searches
  const filtered = (data || []).filter(p => patientMatchesSearch(p, words))

  // Sort by relevance (exact matches first)
  filtered.sort((a, b) => {
    const aName = `${a.nombre} ${a.apellido}`.toLowerCase()
    const bName = `${b.nombre} ${b.apellido}`.toLowerCase()
    const searchLower = searchTerm.toLowerCase()

    // Exact match scores higher
    const aExact = aName.includes(searchLower) ? 0 : 1
    const bExact = bName.includes(searchLower) ? 0 : 1

    if (aExact !== bExact) return aExact - bExact
    return aName.localeCompare(bName)
  })

  return filtered.slice(0, limit)
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

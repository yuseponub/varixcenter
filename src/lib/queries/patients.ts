import { createClient } from '@/lib/supabase/server'

/**
 * Search patients by cedula, nombre, apellido, or celular
 * Uses ILIKE for case-insensitive partial matching
 *
 * @param query - Search term (partial match on multiple fields)
 * @param limit - Max results to return (default 50)
 * @returns Matching patients sorted by apellido
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

  const searchPattern = `%${query.trim()}%`

  const { data, error } = await supabase
    .from('patients')
    .select('id, cedula, nombre, apellido, celular, created_at')
    .or(
      `cedula.ilike.${searchPattern},nombre.ilike.${searchPattern},apellido.ilike.${searchPattern},celular.ilike.${searchPattern}`
    )
    .order('apellido', { ascending: true })
    .limit(limit)

  if (error) throw error
  return data
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
 * Get patient timeline from audit_log
 * Shows history of changes to the patient record
 *
 * Note: In future phases, this will expand to include
 * payments, appointments, and medical records
 *
 * @param patientId - Patient UUID
 * @param limit - Max events to return (default 20)
 * @returns Timeline events sorted by most recent first
 */
export async function getPatientTimeline(patientId: string, limit = 20) {
  const supabase = await createClient()

  // For Phase 2, timeline only shows patient record changes
  // Future phases will add: payments, appointments, procedures
  const { data, error } = await supabase
    .from('audit_log')
    .select('id, action, changed_fields, changed_at, old_data, new_data')
    .eq('table_name', 'patients')
    .eq('record_id', patientId)
    .order('changed_at', { ascending: false })
    .limit(limit)

  if (error) throw error

  // Transform audit log entries into timeline events
  return data.map((entry) => ({
    id: entry.id,
    type: 'patient_record' as const,
    action: entry.action,
    changedFields: entry.changed_fields,
    timestamp: entry.changed_at,
    details: getTimelineEventDetails(entry),
  }))
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

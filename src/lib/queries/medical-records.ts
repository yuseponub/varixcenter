import { createClient } from '@/lib/supabase/server'
import type {
  MedicalRecord,
  MedicalRecordWithDetails,
  Quotation,
  QuotationWithDetails,
  ProgressNote,
  ProgressNoteWithDetails,
} from '@/types'

// Note: medical_records table types not yet in generated types
// Using type assertions until migrations are applied and types regenerated

/**
 * Get medical record by ID with all related data
 */
export async function getMedicalRecordById(id: string): Promise<MedicalRecordWithDetails | null> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('medical_records')
    .select(`
      *,
      patient:patients(
        id, nombre, apellido, cedula, fecha_nacimiento, celular, email, direccion
      ),
      appointment:appointments(
        id, fecha_hora_inicio, fecha_hora_fin, estado, motivo_consulta
      )
    `)
    .eq('id', id)
    .single()

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('Error fetching medical record:', error)
    }
    return null
  }

  // Fetch doctor info separately (from doctors_view)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: doctorData } = await (supabase as any)
    .from('doctors_view')
    .select('id, email, nombre, apellido')
    .eq('id', data.doctor_id)
    .single()

  // Fetch treatments if tratamiento_ids has values
  let treatments: MedicalRecordWithDetails['treatments'] = []
  if (data.tratamiento_ids && data.tratamiento_ids.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: servicesData } = await (supabase as any)
      .from('services')
      .select('id, nombre, precio_base, precio_variable, precio_minimo, precio_maximo')
      .in('id', data.tratamiento_ids)

    treatments = servicesData || []
  }

  // Fetch created_by user info
  let createdByUser = undefined
  if (data.created_by) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: creatorData } = await (supabase as any)
      .from('user_roles')
      .select('user_id, role')
      .eq('user_id', data.created_by)
      .single()

    if (creatorData) {
      // Try to get name from doctors_view (works for all staff with auth)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: userData } = await (supabase as any)
        .from('doctors_view')
        .select('id, email, nombre, apellido')
        .eq('id', data.created_by)
        .single()

      createdByUser = {
        id: data.created_by,
        email: userData?.email,
        nombre: userData?.nombre,
        apellido: userData?.apellido,
        role: creatorData.role,
      }
    }
  }

  return {
    ...data,
    doctor: doctorData || undefined,
    treatments,
    created_by_user: createdByUser,
  } as MedicalRecordWithDetails
}

/**
 * Get medical record by appointment ID
 */
export async function getMedicalRecordByAppointment(appointmentId: string): Promise<MedicalRecord | null> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('medical_records')
    .select('*')
    .eq('appointment_id', appointmentId)
    .single()

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('Error fetching medical record by appointment:', error)
    }
    return null
  }

  return data as MedicalRecord
}

/**
 * Get medical records by patient ID (paginated)
 */
export async function getMedicalRecordsByPatient(
  patientId: string,
  options: { page?: number; limit?: number } = {}
): Promise<{ records: MedicalRecordWithDetails[]; total: number }> {
  const { page = 1, limit = 20 } = options
  const offset = (page - 1) * limit

  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error, count } = await (supabase as any)
    .from('medical_records')
    .select(`
      *,
      appointment:appointments(
        id, fecha_hora_inicio, fecha_hora_fin, estado, motivo_consulta
      )
    `, { count: 'exact' })
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('Error fetching medical records by patient:', error)
    return { records: [], total: 0 }
  }

  return {
    records: (data as MedicalRecordWithDetails[]) || [],
    total: count || 0,
  }
}

/**
 * Get all medical records (paginated) with filters
 */
export async function getMedicalRecords(options: {
  page?: number
  limit?: number
  estado?: 'borrador' | 'completado'
  doctorId?: string
  search?: string
} = {}): Promise<{ records: MedicalRecordWithDetails[]; total: number }> {
  const { page = 1, limit = 20, estado, doctorId, search } = options
  const offset = (page - 1) * limit

  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('medical_records')
    .select(`
      *,
      patient:patients(
        id, nombre, apellido, cedula
      ),
      appointment:appointments(
        id, fecha_hora_inicio, estado, motivo_consulta
      )
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (estado) {
    query = query.eq('estado', estado)
  }

  if (doctorId) {
    query = query.eq('doctor_id', doctorId)
  }

  const { data, error, count } = await query

  if (error) {
    console.error('Error fetching medical records:', error)
    return { records: [], total: 0 }
  }

  // Filter by search if provided (patient name or cedula)
  let filteredData = data || []
  if (search && filteredData.length > 0) {
    const searchLower = search.toLowerCase()
    filteredData = filteredData.filter((record: MedicalRecordWithDetails) => {
      const patient = record.patient
      if (!patient) return false
      return (
        patient.nombre?.toLowerCase().includes(searchLower) ||
        patient.apellido?.toLowerCase().includes(searchLower) ||
        patient.cedula?.includes(search)
      )
    })
  }

  return {
    records: filteredData as MedicalRecordWithDetails[],
    total: search ? filteredData.length : (count || 0),
  }
}

/**
 * Get quotation by medical record ID
 */
export async function getQuotationByMedicalRecord(medicalRecordId: string): Promise<Quotation | null> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('quotations')
    .select('*')
    .eq('medical_record_id', medicalRecordId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('Error fetching quotation:', error)
    }
    return null
  }

  return data as Quotation
}

/**
 * Get quotation by ID with details
 */
export async function getQuotationById(id: string): Promise<QuotationWithDetails | null> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('quotations')
    .select(`
      *,
      medical_record:medical_records(
        id, patient_id
      )
    `)
    .eq('id', id)
    .single()

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('Error fetching quotation:', error)
    }
    return null
  }

  // Fetch patient info if medical_record exists
  if (data.medical_record?.patient_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: patientData } = await (supabase as any)
      .from('patients')
      .select('nombre, apellido, cedula')
      .eq('id', data.medical_record.patient_id)
      .single()

    data.patient = patientData
  }

  return data as QuotationWithDetails
}

/**
 * Get progress notes for a medical record
 */
export async function getProgressNotes(medicalRecordId: string): Promise<ProgressNoteWithDetails[]> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('progress_notes')
    .select(`
      *,
      appointment:appointments(
        fecha_hora_inicio, motivo_consulta
      )
    `)
    .eq('medical_record_id', medicalRecordId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching progress notes:', error)
    return []
  }

  // Fetch user info for each note
  if (data && data.length > 0) {
    const userIds = [...new Set(data.map((note: ProgressNote) => note.created_by))]

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: usersData } = await (supabase as any)
      .from('doctors_view')
      .select('id, email, nombre, apellido')
      .in('id', userIds)

    const userMap = new Map(usersData?.map((u: { id: string }) => [u.id, u]) || [])

    return data.map((note: ProgressNoteWithDetails) => ({
      ...note,
      created_by_user: userMap.get(note.created_by) || undefined,
    }))
  }

  return data as ProgressNoteWithDetails[]
}

/**
 * Check if appointment already has a medical record
 */
export async function hasExistingMedicalRecord(appointmentId: string): Promise<boolean> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('medical_records')
    .select('id')
    .eq('appointment_id', appointmentId)
    .single()

  if (error) {
    return false
  }

  return data !== null
}

/**
 * Get quotation by appointment ID (through medical record)
 * Returns quotation if it exists and has items
 */
export async function getQuotationByAppointment(appointmentId: string): Promise<Quotation | null> {
  const supabase = await createClient()

  // First get the medical record for this appointment
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: medicalRecord, error: mrError } = await (supabase as any)
    .from('medical_records')
    .select('id')
    .eq('appointment_id', appointmentId)
    .single()

  if (mrError || !medicalRecord) {
    return null
  }

  // Then get the quotation for this medical record
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('quotations')
    .select('*')
    .eq('medical_record_id', medicalRecord.id)
    .single()

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('Error fetching quotation by appointment:', error)
    }
    return null
  }

  // Only return if quotation has items
  if (!data.items || data.items.length === 0) {
    return null
  }

  return data as Quotation
}

/**
 * Get active services for treatment selection
 */
export async function getActiveServices(): Promise<{
  id: string
  nombre: string
  descripcion: string | null
  precio_base: number
  precio_variable: boolean
  precio_minimo: number | null
  precio_maximo: number | null
}[]> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('services')
    .select('id, nombre, descripcion, precio_base, precio_variable, precio_minimo, precio_maximo')
    .eq('activo', true)
    .order('nombre')

  if (error) {
    console.error('Error fetching services:', error)
    return []
  }

  return data || []
}

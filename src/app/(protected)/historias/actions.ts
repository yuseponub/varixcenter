'use server'

import { createClient } from '@/lib/supabase/server'
import {
  createMedicalRecordSchema,
  updateMedicalRecordSchema,
  createQuotationSchema,
  createProgressNoteSchema,
} from '@/lib/validations/medical-record'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type {
  MedicalRecordSymptoms,
  MedicalRecordSigns,
  MedicalRecordOnset,
  MedicalRecordHistory,
  MedicalRecordVascularLab,
  QuotationItem,
} from '@/types'

// Note: medical_records table types not yet in generated types
// Using type assertions until migrations are applied and types regenerated

/**
 * Get medical record ID by appointment ID (for checking if record exists)
 */
export async function getMedicalRecordIdByAppointment(
  appointmentId: string
): Promise<{ id: string } | null> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('medical_records')
    .select('id')
    .eq('appointment_id', appointmentId)
    .single()

  if (error || !data) {
    return null
  }

  return { id: data.id }
}

/**
 * Get quotation info by appointment ID (for showing in appointment dialog)
 * Returns quotation ID and total if exists
 */
export async function getQuotationInfoByAppointment(
  appointmentId: string
): Promise<{ id: string; medicalRecordId: string; total: number; itemCount: number } | null> {
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
    .select('id, total, items')
    .eq('medical_record_id', medicalRecord.id)
    .single()

  if (error || !data) {
    return null
  }

  // Only return if quotation has items
  const items = data.items as QuotationItem[] | null
  if (!items || items.length === 0) {
    return null
  }

  return {
    id: data.id,
    medicalRecordId: medicalRecord.id,
    total: data.total,
    itemCount: items.length,
  }
}

/**
 * Action state for medical record server actions
 */
export type MedicalRecordActionState = {
  error?: string
  errors?: Record<string, string[]>
  success?: boolean
  data?: { id: string }
}

/**
 * Parse JSONB field from FormData
 */
function parseJsonField<T>(formData: FormData, fieldName: string, defaultValue: T): T {
  const value = formData.get(fieldName)
  if (!value || typeof value !== 'string') return defaultValue
  try {
    return JSON.parse(value) as T
  } catch {
    return defaultValue
  }
}

/**
 * Parse UUID array from FormData
 */
function parseUuidArray(formData: FormData, fieldName: string): string[] {
  const value = formData.get(fieldName)
  if (!value || typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * Create a new medical record
 */
export async function createMedicalRecord(
  prevState: MedicalRecordActionState | null,
  formData: FormData
): Promise<MedicalRecordActionState> {
  const supabase = await createClient()

  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'No autorizado. Por favor inicie sesion.' }
  }

  // Parse form data
  const rawData = {
    patient_id: formData.get('patient_id') as string,
    appointment_id: formData.get('appointment_id') as string,
    doctor_id: formData.get('doctor_id') as string,
    sintomas: parseJsonField<MedicalRecordSymptoms>(formData, 'sintomas', {}),
    signos: parseJsonField<MedicalRecordSigns>(formData, 'signos', {}),
    inicio_relacionado: parseJsonField<MedicalRecordOnset>(formData, 'inicio_relacionado', {}),
    antecedentes: parseJsonField<MedicalRecordHistory>(formData, 'antecedentes', {}),
    laboratorio_vascular: parseJsonField<MedicalRecordVascularLab>(formData, 'laboratorio_vascular', {}),
    diagnostico: (formData.get('diagnostico') as string) || null,
    ceap_pierna_izquierda: (formData.get('ceap_pierna_izquierda') as string) || null,
    ceap_pierna_derecha: (formData.get('ceap_pierna_derecha') as string) || null,
    tratamiento_ids: parseUuidArray(formData, 'tratamiento_ids'),
    diagrama_piernas: (formData.get('diagrama_piernas') as string) || null,
    estado: (formData.get('estado') as string) || 'borrador',
  }

  // Validate with Zod
  const validated = createMedicalRecordSchema.safeParse(rawData)

  if (!validated.success) {
    return {
      errors: validated.error.flatten().fieldErrors as Record<string, string[]>,
      error: 'Por favor corrija los errores en el formulario',
    }
  }

  // Insert medical record
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('medical_records')
    .insert({
      ...validated.data,
      created_by: user.id,
      updated_by: user.id,
    })
    .select('id')
    .single()

  if (error) {
    console.error('Create medical record error:', error)

    // Map database errors to user-friendly messages
    if (error.code === '23505') {
      if (error.message.includes('appointment_id')) {
        return { error: 'Ya existe una historia clinica para esta cita' }
      }
      return { error: 'Ya existe un registro con estos datos' }
    }
    if (error.code === '23503') {
      if (error.message.includes('patient_id')) {
        return { error: 'El paciente no existe', errors: { patient_id: ['Paciente no encontrado'] } }
      }
      if (error.message.includes('appointment_id')) {
        return { error: 'La cita no existe', errors: { appointment_id: ['Cita no encontrada'] } }
      }
      if (error.message.includes('doctor_id')) {
        return { error: 'El medico no existe', errors: { doctor_id: ['Medico no encontrado'] } }
      }
    }

    return { error: 'Error al crear la historia clinica. Por favor intente de nuevo.' }
  }

  // Revalidate affected pages
  revalidatePath('/historias')
  revalidatePath('/citas')

  // Redirect to the new medical record page
  redirect(`/historias/${data.id}`)
}

/**
 * Update an existing medical record
 */
export async function updateMedicalRecord(
  id: string,
  prevState: MedicalRecordActionState | null,
  formData: FormData
): Promise<MedicalRecordActionState> {
  const supabase = await createClient()

  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'No autorizado. Por favor inicie sesion.' }
  }

  // Parse form data
  const rawData = {
    sintomas: parseJsonField<MedicalRecordSymptoms>(formData, 'sintomas', {}),
    signos: parseJsonField<MedicalRecordSigns>(formData, 'signos', {}),
    inicio_relacionado: parseJsonField<MedicalRecordOnset>(formData, 'inicio_relacionado', {}),
    antecedentes: parseJsonField<MedicalRecordHistory>(formData, 'antecedentes', {}),
    laboratorio_vascular: parseJsonField<MedicalRecordVascularLab>(formData, 'laboratorio_vascular', {}),
    diagnostico: (formData.get('diagnostico') as string) || null,
    ceap_pierna_izquierda: (formData.get('ceap_pierna_izquierda') as string) || null,
    ceap_pierna_derecha: (formData.get('ceap_pierna_derecha') as string) || null,
    tratamiento_ids: parseUuidArray(formData, 'tratamiento_ids'),
    diagrama_piernas: (formData.get('diagrama_piernas') as string) || null,
    estado: (formData.get('estado') as string) || undefined,
  }

  // Validate with Zod
  const validated = updateMedicalRecordSchema.safeParse(rawData)

  if (!validated.success) {
    return {
      errors: validated.error.flatten().fieldErrors as Record<string, string[]>,
      error: 'Por favor corrija los errores en el formulario',
    }
  }

  // Update medical record
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('medical_records')
    .update({
      ...validated.data,
      updated_by: user.id,
    })
    .eq('id', id)

  if (error) {
    console.error('Update medical record error:', error)

    // Map database errors
    if (error.message?.includes('Enfermera no puede modificar')) {
      return { error: error.message }
    }
    if (error.message?.includes('Solo el medico puede completar')) {
      return { error: 'Solo el medico puede completar la historia clinica' }
    }

    return { error: 'Error al actualizar la historia clinica. Por favor intente de nuevo.' }
  }

  // Revalidate affected pages
  revalidatePath('/historias')
  revalidatePath(`/historias/${id}`)

  return {
    success: true,
    data: { id },
  }
}

/**
 * Save medical record as draft
 * Wrapper around updateMedicalRecord that ensures estado = 'borrador'
 */
export async function saveDraft(
  id: string,
  prevState: MedicalRecordActionState | null,
  formData: FormData
): Promise<MedicalRecordActionState> {
  formData.set('estado', 'borrador')
  return updateMedicalRecord(id, prevState, formData)
}

/**
 * Complete medical record (change estado to 'completado')
 * Only medico can do this (enforced by trigger)
 */
export async function completeMedicalRecord(
  id: string,
  prevState: MedicalRecordActionState | null,
  formData: FormData
): Promise<MedicalRecordActionState> {
  formData.set('estado', 'completado')
  return updateMedicalRecord(id, prevState, formData)
}

/**
 * Action state for quotation actions
 */
export type QuotationActionState = {
  error?: string
  errors?: Record<string, string[]>
  success?: boolean
  data?: { id: string; total: number }
}

/**
 * Create or update quotation from medical record treatments
 */
export async function createQuotation(
  prevState: QuotationActionState | null,
  formData: FormData
): Promise<QuotationActionState> {
  const supabase = await createClient()

  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'No autorizado. Por favor inicie sesion.' }
  }

  // Parse form data
  const rawData = {
    medical_record_id: formData.get('medical_record_id') as string,
    items: parseJsonField<QuotationItem[]>(formData, 'items', []),
    notas: (formData.get('notas') as string) || null,
  }

  // Validate with Zod
  const validated = createQuotationSchema.safeParse(rawData)

  if (!validated.success) {
    return {
      errors: validated.error.flatten().fieldErrors as Record<string, string[]>,
      error: 'Por favor corrija los errores en el formulario',
    }
  }

  // Calculate total
  const total = validated.data.items.reduce(
    (sum, item) => sum + item.precio * item.cantidad,
    0
  )

  // Check if quotation already exists for this medical record
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingQuotation } = await (supabase as any)
    .from('quotations')
    .select('id')
    .eq('medical_record_id', validated.data.medical_record_id)
    .single()

  let result

  if (existingQuotation) {
    // Update existing quotation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result = await (supabase as any)
      .from('quotations')
      .update({
        items: validated.data.items,
        total,
        notas: validated.data.notas,
        updated_by: user.id,
      })
      .eq('id', existingQuotation.id)
      .select('id')
      .single()
  } else {
    // Create new quotation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result = await (supabase as any)
      .from('quotations')
      .insert({
        medical_record_id: validated.data.medical_record_id,
        items: validated.data.items,
        total,
        notas: validated.data.notas,
        created_by: user.id,
        updated_by: user.id,
      })
      .select('id')
      .single()
  }

  const { data, error } = result

  if (error) {
    console.error('Create/update quotation error:', error)
    return { error: 'Error al guardar la cotizacion. Por favor intente de nuevo.' }
  }

  // Revalidate affected pages
  revalidatePath(`/historias/${validated.data.medical_record_id}`)
  revalidatePath(`/historias/${validated.data.medical_record_id}/cotizacion`)

  return {
    success: true,
    data: { id: data.id, total },
  }
}

/**
 * Action state for progress note actions
 */
export type ProgressNoteActionState = {
  error?: string
  errors?: Record<string, string[]>
  success?: boolean
  data?: { id: string }
}

/**
 * Add a progress note to a medical record
 */
export async function addProgressNote(
  prevState: ProgressNoteActionState | null,
  formData: FormData
): Promise<ProgressNoteActionState> {
  const supabase = await createClient()

  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'No autorizado. Por favor inicie sesion.' }
  }

  // Parse form data
  const rawData = {
    medical_record_id: formData.get('medical_record_id') as string,
    appointment_id: (formData.get('appointment_id') as string) || null,
    nota: formData.get('nota') as string,
  }

  // Validate with Zod
  const validated = createProgressNoteSchema.safeParse(rawData)

  if (!validated.success) {
    return {
      errors: validated.error.flatten().fieldErrors as Record<string, string[]>,
      error: 'Por favor corrija los errores en el formulario',
    }
  }

  // Insert progress note
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('progress_notes')
    .insert({
      ...validated.data,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error) {
    console.error('Add progress note error:', error)

    if (error.code === '23503') {
      if (error.message.includes('medical_record_id')) {
        return { error: 'La historia clinica no existe' }
      }
    }

    return { error: 'Error al agregar la nota. Por favor intente de nuevo.' }
  }

  // Revalidate affected pages
  revalidatePath(`/historias/${validated.data.medical_record_id}`)

  return {
    success: true,
    data: { id: data.id },
  }
}

/**
 * Generate quotation items from treatment IDs
 * Fetches service details and creates snapshot
 */
export async function generateQuotationFromTreatments(
  medicalRecordId: string,
  treatmentIds: string[]
): Promise<{ items: QuotationItem[]; total: number } | { error: string }> {
  const supabase = await createClient()

  if (treatmentIds.length === 0) {
    return { items: [], total: 0 }
  }

  // Fetch services
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: services, error } = await (supabase as any)
    .from('services')
    .select('id, nombre, precio_base')
    .in('id', treatmentIds)

  if (error) {
    console.error('Error fetching services for quotation:', error)
    return { error: 'Error al obtener los servicios' }
  }

  // Create quotation items
  const items: QuotationItem[] = (services || []).map((service: { id: string; nombre: string; precio_base: number }) => ({
    service_id: service.id,
    nombre: service.nombre,
    precio: service.precio_base,
    cantidad: 1,
  }))

  const total = items.reduce((sum, item) => sum + item.precio * item.cantidad, 0)

  return { items, total }
}

/**
 * Create a minimal medical record for legacy photo upload
 * Creates an empty historia clinica and redirects to the foto upload page
 */
export async function createLegacyMedicalRecord(
  appointmentId: string
): Promise<{ error: string } | never> {
  const supabase = await createClient()

  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'No autorizado. Por favor inicie sesion.' }
  }

  // Check user role
  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (!roleData || !['admin', 'medico', 'enfermera'].includes(roleData.role)) {
    return { error: 'No tiene permisos para crear historias clinicas' }
  }

  // Get appointment data
  const { data: appointment, error: aptError } = await supabase
    .from('appointments')
    .select('id, patient_id, doctor_id')
    .eq('id', appointmentId)
    .single()

  if (aptError || !appointment) {
    return { error: 'Cita no encontrada' }
  }

  // Check if medical record already exists
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabase as any)
    .from('medical_records')
    .select('id')
    .eq('appointment_id', appointmentId)
    .single()

  if (existing) {
    // If record exists, just redirect to historia-antigua
    redirect(`/historias/${existing.id}/historia-antigua`)
  }

  // Create minimal medical record
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('medical_records')
    .insert({
      patient_id: appointment.patient_id,
      appointment_id: appointmentId,
      doctor_id: appointment.doctor_id,
      sintomas: {},
      signos: {},
      inicio_relacionado: {},
      antecedentes: {},
      laboratorio_vascular: {},
      tratamiento_ids: [],
      estado: 'borrador',
      created_by: user.id,
      updated_by: user.id,
    })
    .select('id')
    .single()

  if (error) {
    console.error('Create legacy medical record error:', error)

    if (error.code === '23505' && error.message.includes('appointment_id')) {
      // Race condition - record was created by another user
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existingRecord } = await (supabase as any)
        .from('medical_records')
        .select('id')
        .eq('appointment_id', appointmentId)
        .single()

      if (existingRecord) {
        redirect(`/historias/${existingRecord.id}/historia-antigua`)
      }
    }

    return { error: 'Error al crear la historia clinica' }
  }

  // Revalidate affected pages
  revalidatePath('/historias')
  revalidatePath('/citas')

  // Redirect to legacy photo upload page
  redirect(`/historias/${data.id}/historia-antigua`)
}

/**
 * Update medical record doctor
 */
export async function updateMedicalRecordDoctor(
  medicalRecordId: string,
  doctorId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'No autorizado. Por favor inicie sesion.' }
  }

  // Check user role - only admin, medico can change doctor
  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (!roleData || !['admin', 'medico'].includes(roleData.role)) {
    return { success: false, error: 'No tiene permisos para cambiar el medico.' }
  }

  // Update medical record
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('medical_records')
    .update({
      doctor_id: doctorId,
      updated_by: user.id,
    })
    .eq('id', medicalRecordId)

  if (error) {
    console.error('Update medical record doctor error:', error)
    return { success: false, error: 'Error al actualizar el medico.' }
  }

  // Revalidate affected pages
  revalidatePath('/historias')
  revalidatePath(`/historias/${medicalRecordId}`)
  revalidatePath(`/historias/${medicalRecordId}/cotizacion`)

  return { success: true }
}

/**
 * Update patient data from medical record view
 */
export async function updatePatient(
  patientId: string,
  data: {
    nombre?: string
    apellido?: string
    cedula?: string
    celular?: string
    fecha_nacimiento?: string
  }
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'No autorizado. Por favor inicie sesion.' }
  }

  // Check user role - only admin, medico, enfermera can edit patients
  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (!roleData || !['admin', 'medico', 'enfermera'].includes(roleData.role)) {
    return { success: false, error: 'No tiene permisos para editar pacientes.' }
  }

  // Update patient
  const { error } = await supabase
    .from('patients')
    .update({
      nombre: data.nombre,
      apellido: data.apellido,
      cedula: data.cedula,
      celular: data.celular,
      fecha_nacimiento: data.fecha_nacimiento || null,
    })
    .eq('id', patientId)

  if (error) {
    console.error('Update patient error:', error)
    if (error.code === '23505') {
      return { success: false, error: 'Ya existe un paciente con esa cedula.' }
    }
    return { success: false, error: 'Error al actualizar el paciente.' }
  }

  // Revalidate affected pages
  revalidatePath('/pacientes')
  revalidatePath('/historias')

  return { success: true }
}

/**
 * Rotate a legacy photo by 90 degrees clockwise
 */
export async function rotateLegacyPhoto(
  photoId: string
): Promise<{ success: boolean; rotation: number } | { error: string }> {
  const supabase = await createClient()

  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'No autorizado' }
  }

  // Get current rotation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: photo, error: fetchError } = await (supabase as any)
    .from('legacy_history_photos')
    .select('rotation, medical_record_id')
    .eq('id', photoId)
    .single()

  if (fetchError || !photo) {
    return { error: 'Foto no encontrada' }
  }

  // Calculate new rotation (add 90, wrap at 360)
  const currentRotation = photo.rotation || 0
  const newRotation = (currentRotation + 90) % 360

  // Update rotation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateError } = await (supabase as any)
    .from('legacy_history_photos')
    .update({ rotation: newRotation })
    .eq('id', photoId)

  if (updateError) {
    console.error('Rotate photo error:', updateError)
    return { error: 'Error al rotar la foto' }
  }

  // Revalidate the page
  revalidatePath(`/historias/${photo.medical_record_id}`)

  return { success: true, rotation: newRotation }
}

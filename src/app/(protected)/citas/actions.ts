'use server'

import { createClient } from '@/lib/supabase/server'
import {
  appointmentSchema,
  appointmentStatusSchema,
  appointmentRescheduleSchema,
} from '@/lib/validations/appointment'
import { patientSchema } from '@/lib/validations/patient'
import { canTransition, STATUS_LABELS } from '@/lib/appointments/state-machine'
import type { AppointmentStatus } from '@/types/appointments'
import { revalidatePath } from 'next/cache'

/**
 * Action state for useActionState pattern
 * Consistent with patient actions pattern
 */
export type ActionState = {
  error?: string
  errors?: Record<string, string[]>
  success?: boolean
  data?: { id: string }
}

/**
 * Create a new appointment
 *
 * Validates with Zod schema and handles overlap constraint (23P01)
 * Returns Spanish error messages for user-friendly feedback
 */
export async function createAppointment(
  prevState: ActionState | null,
  formData: FormData
): Promise<ActionState> {
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
    patient_id: formData.get('patient_id'),
    doctor_id: formData.get('doctor_id'),
    fecha_hora_inicio: formData.get('fecha_hora_inicio'),
    fecha_hora_fin: formData.get('fecha_hora_fin'),
    motivo_consulta: formData.get('motivo_consulta') || '',
    notas: formData.get('notas') || '',
  }

  // Validate with Zod
  const validated = appointmentSchema.safeParse(rawData)

  if (!validated.success) {
    return {
      errors: validated.error.flatten().fieldErrors as Record<string, string[]>,
      error: 'Por favor corrija los errores en el formulario',
    }
  }

  // Prepare data for insert (handle empty strings -> null)
  const insertData = {
    patient_id: validated.data.patient_id,
    doctor_id: validated.data.doctor_id,
    fecha_hora_inicio: validated.data.fecha_hora_inicio,
    fecha_hora_fin: validated.data.fecha_hora_fin,
    motivo_consulta: validated.data.motivo_consulta || null,
    notas: validated.data.notas || null,
    created_by: user.id,
  }

  // Insert into database
  const { data, error } = await supabase
    .from('appointments')
    .insert(insertData)
    .select('id')
    .single()

  if (error) {
    // Handle exclusion constraint violation (overlapping appointments)
    // PostgreSQL code 23P01 = exclusion_violation
    if (error.code === '23P01') {
      return {
        error: 'El doctor ya tiene una cita programada en ese horario. Por favor seleccione otro horario.',
        errors: {
          fecha_hora_inicio: ['Horario no disponible - hay otra cita'],
        },
      }
    }

    // Handle foreign key violations
    if (error.code === '23503') {
      if (error.message?.includes('patient_id')) {
        return {
          error: 'El paciente seleccionado no existe',
          errors: { patient_id: ['Paciente no encontrado'] },
        }
      }
      if (error.message?.includes('doctor_id')) {
        return {
          error: 'El doctor seleccionado no existe',
          errors: { doctor_id: ['Doctor no encontrado'] },
        }
      }
    }

    console.error('Appointment creation error:', error)
    return { error: 'Error al crear la cita. Por favor intente de nuevo.' }
  }

  // Revalidate citas pages
  revalidatePath('/citas')

  return { success: true, data: { id: data.id } }
}

/**
 * Update appointment status following state machine rules
 *
 * Validates that the transition is allowed before updating
 * Returns Spanish error messages for invalid transitions
 */
export async function updateAppointmentStatus(
  appointmentId: string,
  newStatus: AppointmentStatus
): Promise<ActionState> {
  const supabase = await createClient()

  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'No autorizado. Por favor inicie sesion.' }
  }

  // Validate input
  const validated = appointmentStatusSchema.safeParse({
    id: appointmentId,
    estado: newStatus,
  })

  if (!validated.success) {
    return {
      errors: validated.error.flatten().fieldErrors as Record<string, string[]>,
      error: 'Datos de estado invalidos',
    }
  }

  // Fetch current appointment status
  const { data: appointment, error: fetchError } = await supabase
    .from('appointments')
    .select('estado')
    .eq('id', appointmentId)
    .single()

  if (fetchError) {
    if (fetchError.code === 'PGRST116') {
      return { error: 'Cita no encontrada' }
    }
    console.error('Fetch appointment error:', fetchError)
    return { error: 'Error al obtener la cita' }
  }

  const currentStatus = appointment.estado as AppointmentStatus

  // Validate state machine transition
  if (!canTransition(currentStatus, newStatus)) {
    const currentLabel = STATUS_LABELS[currentStatus]
    const newLabel = STATUS_LABELS[newStatus]
    return {
      error: `No se puede cambiar de "${currentLabel}" a "${newLabel}". Transicion no permitida.`,
      errors: {
        estado: [`Transicion invalida: ${currentLabel} -> ${newLabel}`],
      },
    }
  }

  // Update status
  const { error: updateError } = await supabase
    .from('appointments')
    .update({ estado: newStatus })
    .eq('id', appointmentId)

  if (updateError) {
    console.error('Status update error:', updateError)
    return { error: 'Error al actualizar el estado de la cita' }
  }

  // Revalidate citas pages
  revalidatePath('/citas')

  return { success: true }
}

/**
 * Reschedule an appointment (drag-drop time changes)
 *
 * Only updates time fields, preserves patient and doctor
 * Handles overlap constraint (23P01)
 */
export async function rescheduleAppointment(
  appointmentId: string,
  newStart: string,
  newEnd: string
): Promise<ActionState> {
  const supabase = await createClient()

  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'No autorizado. Por favor inicie sesion.' }
  }

  // Validate input
  const validated = appointmentRescheduleSchema.safeParse({
    id: appointmentId,
    fecha_hora_inicio: newStart,
    fecha_hora_fin: newEnd,
  })

  if (!validated.success) {
    return {
      errors: validated.error.flatten().fieldErrors as Record<string, string[]>,
      error: 'Por favor corrija los errores en el formulario',
    }
  }

  // Update time fields only
  const { error } = await supabase
    .from('appointments')
    .update({
      fecha_hora_inicio: validated.data.fecha_hora_inicio,
      fecha_hora_fin: validated.data.fecha_hora_fin,
    })
    .eq('id', appointmentId)

  if (error) {
    // Handle exclusion constraint violation (overlapping appointments)
    if (error.code === '23P01') {
      return {
        error: 'El doctor ya tiene una cita programada en ese horario. Por favor seleccione otro horario.',
        errors: {
          fecha_hora_inicio: ['Horario no disponible - hay otra cita'],
        },
      }
    }

    console.error('Reschedule error:', error)
    return { error: 'Error al reprogramar la cita. Por favor intente de nuevo.' }
  }

  // Revalidate citas pages
  revalidatePath('/citas')

  return { success: true }
}

/**
 * Update an appointment (all fields except status)
 *
 * Validates with Zod schema and handles overlap constraint (23P01)
 * Returns Spanish error messages for user-friendly feedback
 */
export async function updateAppointment(
  appointmentId: string,
  prevState: ActionState | null,
  formData: FormData
): Promise<ActionState> {
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
    patient_id: formData.get('patient_id'),
    doctor_id: formData.get('doctor_id'),
    fecha_hora_inicio: formData.get('fecha_hora_inicio'),
    fecha_hora_fin: formData.get('fecha_hora_fin'),
    motivo_consulta: formData.get('motivo_consulta') || '',
    notas: formData.get('notas') || '',
  }

  // Validate with Zod
  const validated = appointmentSchema.safeParse(rawData)

  if (!validated.success) {
    return {
      errors: validated.error.flatten().fieldErrors as Record<string, string[]>,
      error: 'Por favor corrija los errores en el formulario',
    }
  }

  // Prepare data for update (handle empty strings -> null)
  const updateData = {
    patient_id: validated.data.patient_id,
    doctor_id: validated.data.doctor_id,
    fecha_hora_inicio: validated.data.fecha_hora_inicio,
    fecha_hora_fin: validated.data.fecha_hora_fin,
    motivo_consulta: validated.data.motivo_consulta || null,
    notas: validated.data.notas || null,
  }

  // Update in database
  const { error } = await supabase
    .from('appointments')
    .update(updateData)
    .eq('id', appointmentId)

  if (error) {
    // Handle exclusion constraint violation (overlapping appointments)
    if (error.code === '23P01') {
      return {
        error: 'El doctor ya tiene una cita programada en ese horario. Por favor seleccione otro horario.',
        errors: {
          fecha_hora_inicio: ['Horario no disponible - hay otra cita'],
        },
      }
    }

    // Handle foreign key violations
    if (error.code === '23503') {
      if (error.message?.includes('patient_id')) {
        return {
          error: 'El paciente seleccionado no existe',
          errors: { patient_id: ['Paciente no encontrado'] },
        }
      }
      if (error.message?.includes('doctor_id')) {
        return {
          error: 'El doctor seleccionado no existe',
          errors: { doctor_id: ['Doctor no encontrado'] },
        }
      }
    }

    console.error('Appointment update error:', error)
    return { error: 'Error al actualizar la cita. Por favor intente de nuevo.' }
  }

  // Revalidate citas pages
  revalidatePath('/citas')

  return { success: true, data: { id: appointmentId } }
}

/**
 * Delete an appointment
 *
 * Only admins can delete appointments (enforced by RLS)
 * Staff roles should cancel instead of delete
 */
export async function deleteAppointment(
  appointmentId: string
): Promise<ActionState> {
  const supabase = await createClient()

  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'No autorizado. Por favor inicie sesion.' }
  }

  // Validate appointment ID
  if (!appointmentId || typeof appointmentId !== 'string') {
    return { error: 'ID de cita invalido' }
  }

  // Attempt delete (RLS enforces admin-only)
  const { error } = await supabase
    .from('appointments')
    .delete()
    .eq('id', appointmentId)

  if (error) {
    // RLS violation (non-admin trying to delete)
    if (error.code === '42501' || error.message?.includes('permission denied')) {
      return { error: 'Solo los administradores pueden eliminar citas. Use "Cancelar" en su lugar.' }
    }

    // Not found
    if (error.code === 'PGRST116') {
      return { error: 'Cita no encontrada' }
    }

    console.error('Delete appointment error:', error)
    return { error: 'Error al eliminar la cita' }
  }

  // Revalidate citas pages
  revalidatePath('/citas')

  return { success: true }
}

/**
 * Create a new appointment with a new patient (inline creation)
 *
 * Creates the patient first, then the appointment
 * Returns Spanish error messages for user-friendly feedback
 */
export async function createAppointmentWithNewPatient(
  prevState: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient()

  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'No autorizado. Por favor inicie sesion.' }
  }

  // Parse patient data
  const patientRawData = {
    cedula: formData.get('cedula'),
    nombre: formData.get('nombre'),
    apellido: formData.get('apellido'),
    celular: formData.get('celular'),
    email: formData.get('email') || '',
    fecha_nacimiento: formData.get('fecha_nacimiento') || '',
    direccion: formData.get('direccion') || '',
    contacto_emergencia_nombre: formData.get('contacto_emergencia_nombre') || '',
    contacto_emergencia_telefono: formData.get('contacto_emergencia_telefono') || '',
    contacto_emergencia_parentesco: formData.get('contacto_emergencia_parentesco') || '',
  }

  // Validate patient with Zod
  const validatedPatient = patientSchema.safeParse(patientRawData)

  if (!validatedPatient.success) {
    return {
      errors: validatedPatient.error.flatten().fieldErrors as Record<string, string[]>,
      error: 'Por favor corrija los errores del paciente',
    }
  }

  // Prepare patient data for insert
  const patientInsertData = {
    ...validatedPatient.data,
    email: validatedPatient.data.email || null,
    fecha_nacimiento: validatedPatient.data.fecha_nacimiento || null,
    direccion: validatedPatient.data.direccion || null,
    contacto_emergencia_nombre: validatedPatient.data.contacto_emergencia_nombre || null,
    contacto_emergencia_telefono: validatedPatient.data.contacto_emergencia_telefono || null,
    contacto_emergencia_parentesco: validatedPatient.data.contacto_emergencia_parentesco || null,
    created_by: user.id,
  }

  // Create patient
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: patientData, error: patientError } = await (supabase as any)
    .from('patients')
    .insert(patientInsertData)
    .select('id')
    .single()

  if (patientError) {
    // Handle unique constraint violation (duplicate cedula)
    if (patientError.code === '23505') {
      return {
        error: 'Ya existe un paciente con esta cedula',
        errors: { cedula: ['Esta cedula ya esta registrada'] },
      }
    }
    console.error('Patient creation error:', patientError)
    return { error: `Error al crear paciente: ${patientError.message} (code: ${patientError.code})` }
  }

  // Parse appointment data
  const appointmentRawData = {
    patient_id: patientData.id,
    doctor_id: formData.get('doctor_id'),
    fecha_hora_inicio: formData.get('fecha_hora_inicio'),
    fecha_hora_fin: formData.get('fecha_hora_fin'),
    motivo_consulta: formData.get('motivo_consulta') || '',
    notas: formData.get('notas') || '',
  }

  // Validate appointment with Zod
  const validatedAppointment = appointmentSchema.safeParse(appointmentRawData)

  if (!validatedAppointment.success) {
    return {
      errors: validatedAppointment.error.flatten().fieldErrors as Record<string, string[]>,
      error: 'Por favor corrija los errores de la cita',
    }
  }

  // Prepare appointment data for insert
  const appointmentInsertData = {
    patient_id: patientData.id,
    doctor_id: validatedAppointment.data.doctor_id,
    fecha_hora_inicio: validatedAppointment.data.fecha_hora_inicio,
    fecha_hora_fin: validatedAppointment.data.fecha_hora_fin,
    motivo_consulta: validatedAppointment.data.motivo_consulta || null,
    notas: validatedAppointment.data.notas || null,
    created_by: user.id,
  }

  // Create appointment
  const { data: appointmentData, error: appointmentError } = await supabase
    .from('appointments')
    .insert(appointmentInsertData)
    .select('id')
    .single()

  if (appointmentError) {
    // Handle exclusion constraint violation (overlapping appointments)
    if (appointmentError.code === '23P01') {
      return {
        error: 'El doctor ya tiene una cita programada en ese horario. Por favor seleccione otro horario.',
        errors: {
          fecha_hora_inicio: ['Horario no disponible - hay otra cita'],
        },
      }
    }

    console.error('Appointment creation error:', appointmentError)
    return { error: 'Paciente creado pero error al crear la cita. Por favor intente de nuevo.' }
  }

  // Revalidate pages
  revalidatePath('/citas')
  revalidatePath('/pacientes')

  return { success: true, data: { id: appointmentData.id } }
}

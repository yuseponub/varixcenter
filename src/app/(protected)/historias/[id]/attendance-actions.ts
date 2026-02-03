'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { PatientAttendance } from '@/types'

interface ActionResult {
  success: boolean
  error?: string
  attendance?: PatientAttendance
}

/**
 * Mark a patient as attended for today
 * Only medico and admin can perform this action
 */
export async function markPatientAsAttended(patientId: string): Promise<ActionResult> {
  const supabase = await createClient()

  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'No autorizado. Por favor inicie sesion.' }
  }

  // Check user role
  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (!roleData || !['admin', 'medico'].includes(roleData.role)) {
    return { success: false, error: 'Solo el medico o admin puede marcar pacientes como atendidos.' }
  }

  // Check if already marked today
  const today = new Date().toISOString().split('T')[0]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabase as any)
    .from('patient_attendances')
    .select('id, hora')
    .eq('patient_id', patientId)
    .eq('fecha', today)
    .single()

  if (existing) {
    return {
      success: false,
      error: `Paciente ya fue marcado como atendido a las ${existing.hora.substring(0, 5)}`,
    }
  }

  // Insert attendance record
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('patient_attendances')
    .insert({
      patient_id: patientId,
      marked_by: user.id,
    })
    .select()
    .single()

  if (error) {
    console.error('Error marking patient as attended:', error)

    if (error.code === '23505') {
      return { success: false, error: 'Paciente ya fue marcado como atendido hoy.' }
    }

    return { success: false, error: 'Error al marcar paciente. Por favor intente de nuevo.' }
  }

  // Revalidate affected pages
  revalidatePath(`/historias`)
  revalidatePath(`/atendidos`)

  return { success: true, attendance: data as PatientAttendance }
}

/**
 * Check if patient was attended today
 * Returns the attendance record if exists
 */
export async function checkPatientAttendedToday(patientId: string): Promise<PatientAttendance | null> {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('patient_attendances')
    .select('*')
    .eq('patient_id', patientId)
    .eq('fecha', today)
    .single()

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('Error checking patient attendance:', error)
    }
    return null
  }

  return data as PatientAttendance
}

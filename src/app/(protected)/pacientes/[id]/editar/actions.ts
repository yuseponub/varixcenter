'use server'

import { createClient } from '@/lib/supabase/server'
import { patientUpdateSchema } from '@/lib/validations/patient'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export type ActionState = {
  error?: string
  errors?: Record<string, string[]>
  success?: boolean
}

/**
 * Server action to update an existing patient
 * NOTE: cedula cannot be updated (enforced by Zod schema AND database trigger)
 */
export async function updatePatient(
  patientId: string,
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

  // Parse form data (cedula intentionally omitted)
  const rawData = {
    nombre: formData.get('nombre'),
    apellido: formData.get('apellido'),
    celular: formData.get('celular'),
    email: formData.get('email') || '',
    fecha_nacimiento: formData.get('fecha_nacimiento') || '',
    direccion: formData.get('direccion') || '',
    contacto_emergencia_nombre: formData.get('contacto_emergencia_nombre'),
    contacto_emergencia_telefono: formData.get('contacto_emergencia_telefono'),
    contacto_emergencia_parentesco: formData.get('contacto_emergencia_parentesco'),
  }

  // Validate with update schema (no cedula)
  const validated = patientUpdateSchema.safeParse(rawData)

  if (!validated.success) {
    return {
      errors: validated.error.flatten().fieldErrors as Record<string, string[]>,
      error: 'Por favor corrija los errores en el formulario',
    }
  }

  // Prepare data for update (handle empty strings -> null)
  const updateData = {
    ...validated.data,
    email: validated.data.email || null,
    fecha_nacimiento: validated.data.fecha_nacimiento || null,
    direccion: validated.data.direccion || null,
  }

  // Update in database
  const { error } = await supabase
    .from('patients')
    .update(updateData)
    .eq('id', patientId)

  if (error) {
    console.error('Patient update error:', error)
    return { error: 'Error al actualizar paciente. Por favor intente de nuevo.' }
  }

  // Revalidate and redirect
  revalidatePath('/pacientes')
  revalidatePath(`/pacientes/${patientId}`)
  redirect(`/pacientes/${patientId}`)
}

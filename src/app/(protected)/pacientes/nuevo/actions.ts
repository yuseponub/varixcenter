'use server'

import { createClient } from '@/lib/supabase/server'
import { patientSchema } from '@/lib/validations/patient'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export type ActionState = {
  error?: string
  errors?: Record<string, string[]>
  success?: boolean
}

/**
 * Server action to create a new patient
 * Uses Zod validation on server side for security
 */
export async function createPatient(
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

  // Validate with Zod
  const validated = patientSchema.safeParse(rawData)

  if (!validated.success) {
    return {
      errors: validated.error.flatten().fieldErrors as Record<string, string[]>,
      error: 'Por favor corrija los errores en el formulario',
    }
  }

  // Prepare data for insert (handle empty strings -> null)
  const insertData = {
    ...validated.data,
    email: validated.data.email || null,
    fecha_nacimiento: validated.data.fecha_nacimiento || null,
    direccion: validated.data.direccion || null,
    contacto_emergencia_nombre: validated.data.contacto_emergencia_nombre || null,
    contacto_emergencia_telefono: validated.data.contacto_emergencia_telefono || null,
    contacto_emergencia_parentesco: validated.data.contacto_emergencia_parentesco || null,
    created_by: user.id,
  }

  // Insert into database
  const { data, error } = await supabase
    .from('patients')
    .insert(insertData)
    .select('id')
    .single()

  if (error) {
    // Handle unique constraint violation (duplicate cedula)
    if (error.code === '23505') {
      return {
        error: 'Ya existe un paciente con esta cedula',
        errors: { cedula: ['Esta cedula ya esta registrada'] },
      }
    }
    console.error('Patient creation error:', error)
    return { error: 'Error al crear paciente. Por favor intente de nuevo.' }
  }

  // Revalidate patient list and redirect to new patient
  revalidatePath('/pacientes')
  redirect(`/pacientes/${data.id}`)
}

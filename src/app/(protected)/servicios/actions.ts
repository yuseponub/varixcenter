'use server'

import { createClient } from '@/lib/supabase/server'
import { serviceSchema, serviceUpdateSchema } from '@/lib/validations/service'
import { revalidatePath } from 'next/cache'

export type ServiceActionState = {
  error?: string
  errors?: Record<string, string[]>
  success?: boolean
}

/**
 * Create a new service (Admin only)
 */
export async function createService(
  prevState: ServiceActionState | null,
  formData: FormData
): Promise<ServiceActionState> {
  const supabase = await createClient()

  // Verify user is authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autorizado' }
  }

  // Parse form data
  const precioVariable = formData.get('precio_variable') === 'true'
  const descripcionRaw = formData.get('descripcion') as string | null
  const rawData = {
    nombre: formData.get('nombre'),
    descripcion: descripcionRaw && descripcionRaw.trim() !== '' ? descripcionRaw.trim() : null,
    precio_base: parseFloat(formData.get('precio_base') as string || '0'),
    precio_variable: precioVariable,
    precio_minimo: precioVariable && formData.get('precio_minimo')
      ? parseFloat(formData.get('precio_minimo') as string)
      : null,
    precio_maximo: precioVariable && formData.get('precio_maximo')
      ? parseFloat(formData.get('precio_maximo') as string)
      : null,
    activo: formData.get('activo') !== 'false',
  }

  // Validate with Zod
  const validated = serviceSchema.safeParse(rawData)
  if (!validated.success) {
    return {
      errors: validated.error.flatten().fieldErrors as Record<string, string[]>,
      error: 'Por favor corrija los errores'
    }
  }

  // Insert into database
  const { error } = await supabase
    .from('services')
    .insert({
      ...validated.data,
      descripcion: validated.data.descripcion || null,
      created_by: user.id
    })

  if (error) {
    // Handle unique constraint violation (duplicate nombre)
    if (error.code === '23505') {
      return { error: 'Ya existe un servicio con ese nombre' }
    }
    console.error('Service creation error:', error)
    return { error: `Error al crear el servicio: ${error.message} (code: ${error.code})` }
  }

  revalidatePath('/servicios')
  return { success: true }
}

/**
 * Update an existing service (Admin only)
 */
export async function updateService(
  id: string,
  prevState: ServiceActionState | null,
  formData: FormData
): Promise<ServiceActionState> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autorizado' }
  }

  const precioVariable = formData.get('precio_variable') === 'true'
  const descripcionRaw2 = formData.get('descripcion') as string | null
  const rawData = {
    nombre: formData.get('nombre'),
    descripcion: descripcionRaw2 && descripcionRaw2.trim() !== '' ? descripcionRaw2.trim() : null,
    precio_base: parseFloat(formData.get('precio_base') as string || '0'),
    precio_variable: precioVariable,
    precio_minimo: precioVariable && formData.get('precio_minimo')
      ? parseFloat(formData.get('precio_minimo') as string)
      : null,
    precio_maximo: precioVariable && formData.get('precio_maximo')
      ? parseFloat(formData.get('precio_maximo') as string)
      : null,
    activo: formData.get('activo') !== 'false',
  }

  const validated = serviceUpdateSchema.safeParse(rawData)
  if (!validated.success) {
    return {
      errors: validated.error.flatten().fieldErrors as Record<string, string[]>,
      error: 'Por favor corrija los errores'
    }
  }

  const { error } = await supabase
    .from('services')
    .update({
      ...validated.data,
      descripcion: validated.data.descripcion || null,
    })
    .eq('id', id)

  if (error) {
    if (error.code === '23505') {
      return { error: 'Ya existe un servicio con ese nombre' }
    }
    console.error('Service update error:', error)
    return { error: 'Error al actualizar el servicio' }
  }

  revalidatePath('/servicios')
  return { success: true }
}

/**
 * Toggle service active status (soft delete/restore)
 */
export async function toggleServiceActive(
  id: string,
  activo: boolean
): Promise<ServiceActionState> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autorizado' }
  }

  const { error } = await supabase
    .from('services')
    .update({ activo })
    .eq('id', id)

  if (error) {
    console.error('Service toggle error:', error)
    return { error: 'Error al actualizar el servicio' }
  }

  revalidatePath('/servicios')
  return { success: true }
}

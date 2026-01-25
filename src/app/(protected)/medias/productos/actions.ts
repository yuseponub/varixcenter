'use server'

import { createClient } from '@/lib/supabase/server'
import { mediasProductSchema, mediasProductUpdateSchema } from '@/lib/validations/medias/product'
import { revalidatePath } from 'next/cache'

export type ProductActionState = {
  error?: string
  errors?: Record<string, string[]>
  success?: boolean
}

/**
 * Create a new product (Admin only)
 */
export async function createProduct(
  prevState: ProductActionState | null,
  formData: FormData
): Promise<ProductActionState> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autorizado' }
  }

  const rawData = {
    tipo: formData.get('tipo'),
    talla: formData.get('talla'),
    codigo: formData.get('codigo'),
    precio: parseFloat(formData.get('precio') as string || '0'),
    activo: formData.get('activo') !== 'false',
  }

  const validated = mediasProductSchema.safeParse(rawData)
  if (!validated.success) {
    return {
      errors: validated.error.flatten().fieldErrors as Record<string, string[]>,
      error: 'Por favor corrija los errores'
    }
  }

  const { error } = await supabase
    .from('medias_products')
    .insert(validated.data)

  if (error) {
    if (error.code === '23505') {
      // Unique constraint violation
      if (error.message.includes('codigo')) {
        return { error: 'Ya existe un producto con ese codigo' }
      }
      return { error: 'Ya existe un producto con ese tipo y talla' }
    }
    console.error('Product creation error:', error)
    return { error: 'Error al crear el producto' }
  }

  revalidatePath('/medias/productos')
  return { success: true }
}

/**
 * Update an existing product (Admin only)
 * Only precio and activo can be updated
 */
export async function updateProduct(
  id: string,
  prevState: ProductActionState | null,
  formData: FormData
): Promise<ProductActionState> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autorizado' }
  }

  const rawData = {
    precio: parseFloat(formData.get('precio') as string || '0'),
    activo: formData.get('activo') !== 'false',
  }

  const validated = mediasProductUpdateSchema.safeParse(rawData)
  if (!validated.success) {
    return {
      errors: validated.error.flatten().fieldErrors as Record<string, string[]>,
      error: 'Por favor corrija los errores'
    }
  }

  const { error } = await supabase
    .from('medias_products')
    .update(validated.data)
    .eq('id', id)

  if (error) {
    console.error('Product update error:', error)
    return { error: 'Error al actualizar el producto' }
  }

  revalidatePath('/medias/productos')
  return { success: true }
}

/**
 * Toggle product active status (soft delete/restore)
 */
export async function toggleProductActive(
  id: string,
  activo: boolean
): Promise<ProductActionState> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autorizado' }
  }

  const { error } = await supabase
    .from('medias_products')
    .update({ activo })
    .eq('id', id)

  if (error) {
    console.error('Product toggle error:', error)
    return { error: 'Error al actualizar el producto' }
  }

  revalidatePath('/medias/productos')
  return { success: true }
}

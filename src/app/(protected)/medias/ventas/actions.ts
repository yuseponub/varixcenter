'use server'

import { createClient } from '@/lib/supabase/server'
import { mediasSaleSchema, deleteSaleSchema } from '@/lib/validations/medias/sale'
import { revalidatePath } from 'next/cache'

/**
 * Action state for sale server actions
 */
export type SaleActionState = {
  error?: string
  errors?: Record<string, string[]>
  success?: boolean
  data?: { id: string; numero_venta: string; total: number }
}

/**
 * Create a new medias sale
 *
 * Uses RPC function for atomic transaction with stock decrement
 * Validates with Zod schema before calling database RPC
 */
export async function createMediasSale(
  prevState: SaleActionState | null,
  formData: FormData
): Promise<SaleActionState> {
  const supabase = await createClient()

  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autorizado. Por favor inicie sesion.' }
  }

  // Parse form data
  let items, methods
  try {
    items = JSON.parse((formData.get('items') as string) || '[]')
    methods = JSON.parse((formData.get('methods') as string) || '[]')
  } catch {
    return { error: 'Datos de formulario invalidos' }
  }

  const rawData = {
    items,
    methods,
    patient_id: (formData.get('patient_id') as string) || null,
    receptor_efectivo_id: (formData.get('receptor_efectivo_id') as string) || null,
  }

  // Validate with Zod
  const validated = mediasSaleSchema.safeParse(rawData)
  if (!validated.success) {
    return {
      errors: validated.error.flatten().fieldErrors as Record<string, string[]>,
      error: 'Por favor corrija los errores en el formulario',
    }
  }

  // Call RPC function for atomic creation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: saleData, error: saleError } = await (supabase as any).rpc('create_medias_sale', {
    p_items: validated.data.items,
    p_methods: validated.data.methods,
    p_patient_id: validated.data.patient_id || null,
    p_vendedor_id: user.id,
    p_receptor_efectivo_id: validated.data.receptor_efectivo_id || null,
  })

  if (saleError) {
    console.error('Sale creation error:', saleError)

    // Map database errors to Spanish messages
    if (saleError.message.includes('Stock insuficiente')) {
      return { error: saleError.message }
    }
    if (saleError.message.includes('comprobante')) {
      return { error: 'Los pagos electronicos requieren foto del comprobante' }
    }
    if (saleError.message.includes('no encontrado') || saleError.message.includes('no disponible')) {
      return { error: saleError.message }
    }

    return { error: 'Error al crear la venta. Por favor intente de nuevo.' }
  }

  // Revalidate affected pages
  revalidatePath('/medias/ventas')
  revalidatePath('/medias/productos')

  return {
    success: true,
    data: saleData as { id: string; numero_venta: string; total: number },
  }
}

/**
 * Delete (anular) a sale - Admin only
 *
 * Requires admin role (enforced by RPC)
 * Stock is reversed automatically
 */
export async function deleteMediasSale(
  prevState: SaleActionState | null,
  formData: FormData
): Promise<SaleActionState> {
  const supabase = await createClient()

  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autorizado. Por favor inicie sesion.' }
  }

  const rawData = {
    sale_id: formData.get('sale_id') as string,
    justificacion: formData.get('justificacion') as string,
  }

  // Validate with Zod
  const validated = deleteSaleSchema.safeParse(rawData)
  if (!validated.success) {
    return {
      errors: validated.error.flatten().fieldErrors as Record<string, string[]>,
      error: 'La justificacion debe tener al menos 10 caracteres',
    }
  }

  // Call RPC (validates admin role internally)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('eliminar_medias_sale', {
    p_sale_id: validated.data.sale_id,
    p_justificacion: validated.data.justificacion,
  })

  if (error) {
    console.error('Delete sale error:', error)

    if (error.message.includes('Solo Admin')) {
      return { error: 'Solo Admin puede eliminar ventas' }
    }
    if (error.message.includes('10 caracteres')) {
      return { error: 'La justificacion debe tener al menos 10 caracteres' }
    }
    if (error.message.includes('no encontrado')) {
      return { error: 'Venta no encontrada' }
    }

    return { error: 'Error al eliminar la venta' }
  }

  // Revalidate affected pages
  revalidatePath('/medias/ventas')
  revalidatePath('/medias/productos')

  return { success: true }
}

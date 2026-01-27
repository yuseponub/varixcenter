'use server'

import { createClient } from '@/lib/supabase/server'
import { adjustmentSchema } from '@/lib/validations/medias/adjustment'
import { revalidatePath } from 'next/cache'

/**
 * Action state for adjustment server actions
 */
export type AdjustmentActionState = {
  error?: string
  errors?: Record<string, string[]>
  success?: boolean
}

/**
 * Create an inventory adjustment
 *
 * Uses RPC function for atomic transaction with stock update and movement creation
 * Validates with Zod schema before calling database RPC
 * Only Admin and Medico can create adjustments (enforced by RPC)
 */
export async function createAdjustment(
  prevState: AdjustmentActionState | null,
  formData: FormData
): Promise<AdjustmentActionState> {
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
    product_id: formData.get('product_id') as string,
    cantidad: formData.get('cantidad') as string,
    tipo: formData.get('tipo') as string,
    stock_type: formData.get('stock_type') as string,
    razon: formData.get('razon') as string,
  }

  // Validate with Zod
  const validated = adjustmentSchema.safeParse(rawData)
  if (!validated.success) {
    return {
      errors: validated.error.flatten().fieldErrors as Record<string, string[]>,
      error: 'Por favor corrija los errores en el formulario',
    }
  }

  // Call RPC function for atomic adjustment
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: rpcError } = await (supabase as any).rpc('create_inventory_adjustment', {
    p_product_id: validated.data.product_id,
    p_cantidad: validated.data.cantidad,
    p_tipo: validated.data.tipo,
    p_stock_type: validated.data.stock_type,
    p_razon: validated.data.razon,
  })

  if (rpcError) {
    console.error('Adjustment creation error:', rpcError)

    // Map database errors to Spanish messages
    if (rpcError.message.includes('Solo Admin o Medico') || rpcError.message.includes('role')) {
      return { error: 'Solo Admin o Medico pueden realizar ajustes de inventario' }
    }
    if (rpcError.message.includes('Stock insuficiente') || rpcError.message.includes('negativo')) {
      return { error: 'Stock insuficiente para realizar esta salida' }
    }
    if (rpcError.message.includes('no encontrado') || rpcError.message.includes('not found')) {
      return { error: 'Producto no encontrado' }
    }

    return { error: 'Error al crear el ajuste. Por favor intente de nuevo.' }
  }

  // Revalidate affected pages
  revalidatePath('/medias')
  revalidatePath('/medias/movimientos')
  revalidatePath('/medias/productos')

  return { success: true }
}

'use server'

import { createClient } from '@/lib/supabase/server'
import {
  createReturnSchema,
  approveReturnSchema,
  rejectReturnSchema,
} from '@/lib/validations/medias/return'
import { revalidatePath } from 'next/cache'

/**
 * Action state for return server actions
 */
export type ReturnActionState = {
  error?: string
  errors?: Record<string, string[]>
  success?: boolean
  data?: { id: string; numero_devolucion: string; monto_devolucion: number }
}

/**
 * Create a new return request
 * Any authenticated user can create (employee requests)
 * Uses create_medias_return RPC
 */
export async function createReturn(
  prevState: ReturnActionState | null,
  formData: FormData
): Promise<ReturnActionState> {
  const supabase = await createClient()

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autorizado. Por favor inicie sesion.' }
  }

  // Parse form data
  const rawData = {
    sale_id: formData.get('sale_id') as string,
    sale_item_id: formData.get('sale_item_id') as string,
    cantidad: parseInt(formData.get('cantidad') as string, 10),
    motivo: formData.get('motivo') as string,
    metodo_reembolso: formData.get('metodo_reembolso') as string,
    foto_path: (formData.get('foto_path') as string) || null,
  }

  // Validate with Zod
  const validated = createReturnSchema.safeParse(rawData)
  if (!validated.success) {
    return {
      errors: validated.error.flatten().fieldErrors as Record<string, string[]>,
      error: 'Por favor corrija los errores en el formulario',
    }
  }

  // Call RPC
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('create_medias_return', {
    p_sale_id: validated.data.sale_id,
    p_sale_item_id: validated.data.sale_item_id,
    p_cantidad: validated.data.cantidad,
    p_motivo: validated.data.motivo,
    p_metodo_reembolso: validated.data.metodo_reembolso,
    p_foto_path: validated.data.foto_path,
  })

  if (error) {
    console.error('Create return error:', error)

    // Map DB errors to Spanish messages
    if (error.message.includes('excede') || error.message.includes('Cantidad excede')) {
      return { error: error.message }
    }
    if (error.message.includes('10 caracteres')) {
      return { error: 'El motivo debe tener al menos 10 caracteres' }
    }
    if (error.message.includes('Venta no encontrada')) {
      return { error: 'Venta no encontrada' }
    }
    if (error.message.includes('Item de venta no encontrado')) {
      return { error: 'Item de venta no encontrado' }
    }
    if (error.message.includes('ventas activas')) {
      return { error: 'Solo se pueden devolver productos de ventas activas' }
    }
    if (error.message.includes('mayor a 0')) {
      return { error: 'La cantidad debe ser mayor a 0' }
    }
    if (error.message.includes('metodo de reembolso')) {
      return { error: 'El metodo de reembolso es invalido' }
    }

    return { error: 'Error al crear la devolucion. Por favor intente de nuevo.' }
  }

  // Revalidate affected pages
  revalidatePath('/medias/devoluciones')
  revalidatePath('/medias/ventas')

  return {
    success: true,
    data: {
      id: data.id,
      numero_devolucion: data.numero_devolucion,
      monto_devolucion: data.monto_devolucion,
    },
  }
}

/**
 * Approve a return - Admin/Medico only
 * Uses approve_medias_return RPC
 * Increments stock_devoluciones, creates stock movement
 */
export async function approveReturn(
  prevState: ReturnActionState | null,
  formData: FormData
): Promise<ReturnActionState> {
  const supabase = await createClient()

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autorizado. Por favor inicie sesion.' }
  }

  // Parse form data
  const rawData = {
    return_id: formData.get('return_id') as string,
    notas: (formData.get('notas') as string) || null,
  }

  // Validate with Zod
  const validated = approveReturnSchema.safeParse(rawData)
  if (!validated.success) {
    return {
      errors: validated.error.flatten().fieldErrors as Record<string, string[]>,
      error: 'Datos invalidos',
    }
  }

  // Call RPC
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('approve_medias_return', {
    p_return_id: validated.data.return_id,
    p_notas: validated.data.notas,
  })

  if (error) {
    console.error('Approve return error:', error)

    // Map DB errors to Spanish messages
    if (error.message.includes('Solo Admin o Medico')) {
      return { error: 'Solo Admin o Medico pueden aprobar devoluciones' }
    }
    if (error.message.includes('Devolucion no encontrada')) {
      return { error: 'Devolucion no encontrada' }
    }
    if (error.message.includes('pendientes')) {
      return { error: 'Solo se pueden aprobar devoluciones pendientes' }
    }
    if (error.message.includes('Producto no encontrado')) {
      return { error: 'Producto no encontrado' }
    }

    return { error: 'Error al aprobar la devolucion. Por favor intente de nuevo.' }
  }

  // Revalidate affected pages
  revalidatePath('/medias/devoluciones')
  revalidatePath('/medias/ventas')
  revalidatePath('/medias/productos')

  return {
    success: true,
    data: {
      id: data.id,
      numero_devolucion: data.numero_devolucion,
      monto_devolucion: 0, // Not returned by approve RPC
    },
  }
}

/**
 * Reject a return - Admin/Medico only
 * Uses reject_medias_return RPC
 * Changes estado to rechazada WITHOUT affecting stock
 */
export async function rejectReturn(
  prevState: ReturnActionState | null,
  formData: FormData
): Promise<ReturnActionState> {
  const supabase = await createClient()

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autorizado. Por favor inicie sesion.' }
  }

  // Parse form data
  const rawData = {
    return_id: formData.get('return_id') as string,
    notas: (formData.get('notas') as string) || null,
  }

  // Validate with Zod
  const validated = rejectReturnSchema.safeParse(rawData)
  if (!validated.success) {
    return {
      errors: validated.error.flatten().fieldErrors as Record<string, string[]>,
      error: 'Datos invalidos',
    }
  }

  // Call RPC
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('reject_medias_return', {
    p_return_id: validated.data.return_id,
    p_notas: validated.data.notas,
  })

  if (error) {
    console.error('Reject return error:', error)

    // Map DB errors to Spanish messages
    if (error.message.includes('Solo Admin o Medico')) {
      return { error: 'Solo Admin o Medico pueden rechazar devoluciones' }
    }
    if (error.message.includes('Devolucion no encontrada')) {
      return { error: 'Devolucion no encontrada' }
    }
    if (error.message.includes('pendientes')) {
      return { error: 'Solo se pueden rechazar devoluciones pendientes' }
    }

    return { error: 'Error al rechazar la devolucion. Por favor intente de nuevo.' }
  }

  // Revalidate affected pages
  revalidatePath('/medias/devoluciones')
  revalidatePath('/medias/ventas')

  return {
    success: true,
    data: {
      id: data.id,
      numero_devolucion: data.numero_devolucion,
      monto_devolucion: 0, // Not returned by reject RPC
    },
  }
}

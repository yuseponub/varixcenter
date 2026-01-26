'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import {
  createPurchaseSchema,
  confirmReceptionSchema,
  cancelPurchaseSchema,
  type CreatePurchaseFormData,
} from '@/lib/validations/medias/purchase'
import { parseInvoiceImage, type OCRResult } from '@/lib/services/invoice-ocr'

/**
 * Action state for purchase server actions
 */
export type PurchaseActionState = {
  error?: string
  errors?: Record<string, string[]>
  success?: boolean
  data?: { id: string; numero_compra: string; total: number }
}

/**
 * Create a new purchase with items
 *
 * Uses RPC function for atomic transaction with gapless numbering
 * Validates with Zod schema before calling database RPC
 * COM-04: factura_path (invoice photo) is REQUIRED
 */
export async function createPurchase(
  prevState: PurchaseActionState | null,
  formData: FormData
): Promise<PurchaseActionState> {
  const supabase = await createClient()

  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autorizado. Por favor inicie sesion.' }
  }

  // Parse form data
  let items
  try {
    items = JSON.parse((formData.get('items') as string) || '[]')
  } catch {
    return { error: 'Datos de formulario invalidos' }
  }

  const rawData = {
    proveedor: formData.get('proveedor') as string,
    fecha_factura: formData.get('fecha_factura') as string,
    numero_factura: (formData.get('numero_factura') as string) || null,
    total: parseFloat(formData.get('total') as string) || 0,
    factura_path: formData.get('factura_path') as string,
    notas: (formData.get('notas') as string) || null,
    items,
  }

  // Validate with Zod
  const validated = createPurchaseSchema.safeParse(rawData)
  if (!validated.success) {
    return {
      errors: validated.error.flatten().fieldErrors as Record<string, string[]>,
      error: 'Por favor corrija los errores en el formulario',
    }
  }

  // Call RPC function for atomic creation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: purchaseData, error: purchaseError } = await (supabase as any).rpc('create_purchase', {
    p_proveedor: validated.data.proveedor,
    p_fecha_factura: validated.data.fecha_factura,
    p_numero_factura: validated.data.numero_factura || null,
    p_total: validated.data.total,
    p_factura_path: validated.data.factura_path,
    p_notas: validated.data.notas || null,
    p_items: validated.data.items,
  })

  if (purchaseError) {
    console.error('Purchase creation error:', purchaseError)

    // Map database errors to Spanish messages
    if (purchaseError.message.includes('Proveedor')) {
      return { error: purchaseError.message }
    }
    if (purchaseError.message.includes('factura')) {
      return { error: purchaseError.message }
    }
    if (purchaseError.message.includes('Producto')) {
      return { error: purchaseError.message }
    }

    return { error: 'Error al crear la compra. Por favor intente de nuevo.' }
  }

  // Revalidate affected pages
  revalidatePath('/medias/compras')
  revalidatePath('/medias/productos')

  return {
    success: true,
    data: purchaseData as { id: string; numero_compra: string; total: number },
  }
}

/**
 * Confirm reception of a purchase
 *
 * Calls RPC function to atomically:
 * 1. Validate purchase is in pendiente_recepcion state
 * 2. Increment stock_normal for all items
 * 3. Log stock movements
 * 4. Update estado to recibido
 *
 * COM-05: Any authenticated user can confirm reception
 */
export async function confirmReception(
  purchaseId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'No autorizado. Por favor inicie sesion.' }
  }

  // Validate input
  const validated = confirmReceptionSchema.safeParse({ purchase_id: purchaseId })
  if (!validated.success) {
    return { success: false, error: 'ID de compra invalido' }
  }

  // Call RPC for atomic stock increment
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('confirm_purchase_reception', {
    p_purchase_id: purchaseId,
  })

  if (error) {
    console.error('Confirm reception error:', error)

    // Map database errors to Spanish messages
    if (error.message.includes('no encontrada')) {
      return { success: false, error: 'Compra no encontrada' }
    }
    if (error.message.includes('pendientes de recepcion')) {
      return { success: false, error: 'Solo compras pendientes de recepcion pueden ser confirmadas' }
    }

    return { success: false, error: 'Error al confirmar recepcion' }
  }

  // Revalidate affected pages
  revalidatePath('/medias/compras')
  revalidatePath('/medias/productos')

  return { success: true }
}

/**
 * Cancel (anular) a purchase
 *
 * Calls RPC function which:
 * 1. Validates user has admin/medico role
 * 2. If purchase was received, reverts stock
 * 3. Updates estado to anulado with justification
 *
 * COM-06: Only admin/medico can cancel, requires 10+ char justification
 */
export async function cancelPurchase(
  purchaseId: string,
  justificacion: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'No autorizado. Por favor inicie sesion.' }
  }

  // Validate input
  const validated = cancelPurchaseSchema.safeParse({ purchase_id: purchaseId, justificacion })
  if (!validated.success) {
    return {
      success: false,
      error: validated.error.issues[0]?.message || 'Datos invalidos',
    }
  }

  // Call RPC (validates admin/medico role internally)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('cancel_purchase', {
    p_purchase_id: purchaseId,
    p_justificacion: justificacion,
  })

  if (error) {
    console.error('Cancel purchase error:', error)

    // Map database errors to Spanish messages
    if (error.message.includes('administradores y medicos')) {
      return { success: false, error: 'Solo administradores y medicos pueden anular compras' }
    }
    if (error.message.includes('ya esta anulada')) {
      return { success: false, error: 'La compra ya esta anulada' }
    }
    if (error.message.includes('no encontrada')) {
      return { success: false, error: 'Compra no encontrada' }
    }
    if (error.message.includes('10 caracteres')) {
      return { success: false, error: 'La justificacion debe tener al menos 10 caracteres' }
    }
    if (error.message.includes('Stock insuficiente')) {
      return { success: false, error: error.message }
    }

    return { success: false, error: 'Error al anular compra' }
  }

  // Revalidate affected pages
  revalidatePath('/medias/compras')
  revalidatePath('/medias/productos')

  return { success: true }
}

/**
 * Parse an invoice image using OCR
 *
 * Calls OpenAI GPT-4o vision API to extract structured data.
 * Returns parsed data for form pre-fill, user confirms before saving.
 *
 * @param base64Image - Base64 encoded image (with or without data URI prefix)
 * @param mimeType - Image MIME type (default: image/jpeg)
 */
export async function parseInvoice(
  base64Image: string,
  mimeType: string = 'image/jpeg'
): Promise<OCRResult> {
  const supabase = await createClient()

  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'No autorizado. Por favor inicie sesion.' }
  }

  // Validate input
  if (!base64Image || base64Image.length < 100) {
    return { success: false, error: 'Imagen invalida' }
  }

  // Call OCR service
  return parseInvoiceImage(base64Image, mimeType)
}

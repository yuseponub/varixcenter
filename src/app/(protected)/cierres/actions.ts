'use server'

import { createClient } from '@/lib/supabase/server'
import { cashClosingSchema, reopenSchema, deleteClosingSchema } from '@/lib/validations/cash-closing'
import { revalidatePath } from 'next/cache'
import type { CreateClosingResult, ReopenClosingResult } from '@/types'

// Note: cash_closings RPC types not yet in generated types
// Using type assertions until migrations are applied and types regenerated

/**
 * Action state for cash closing server actions
 */
export type CashClosingActionState = {
  error?: string
  errors?: Record<string, string[]>
  success?: boolean
  data?: CreateClosingResult | ReopenClosingResult
}

/**
 * Create a new cash closing
 *
 * Uses RPC function for atomic transaction with gapless numbering
 * Validates with Zod schema before calling database RPC
 * Returns Spanish error messages for user-friendly feedback
 */
export async function closeCash(
  prevState: CashClosingActionState | null,
  formData: FormData
): Promise<CashClosingActionState> {
  const supabase = await createClient()

  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'No autorizado. Por favor inicie sesion.' }
  }

  const rawData = {
    fecha: formData.get('fecha') as string,
    conteo_fisico: parseFloat((formData.get('conteo_fisico') as string) || '0'),
    diferencia_justificacion: (formData.get('diferencia_justificacion') as string) || null,
    cierre_photo_path: formData.get('cierre_photo_path') as string,
    notas: (formData.get('notas') as string) || null,
  }

  // Validate with Zod
  const validated = cashClosingSchema.safeParse(rawData)

  if (!validated.success) {
    return {
      errors: validated.error.flatten().fieldErrors as Record<string, string[]>,
      error: 'Por favor corrija los errores en el formulario',
    }
  }

  // Call RPC function for atomic creation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: closingData, error: closingError } = await (supabase as any).rpc(
    'create_cash_closing',
    {
      p_fecha: validated.data.fecha,
      p_conteo_fisico: validated.data.conteo_fisico,
      p_diferencia_justificacion: validated.data.diferencia_justificacion ?? '',
      p_cierre_photo_path: validated.data.cierre_photo_path,
      p_notas: validated.data.notas ?? '',
    }
  )

  if (closingError) {
    console.error('Cash closing error:', closingError)

    // Map database errors to user-friendly Spanish messages
    if (closingError.message.includes('Solo Secretaria y Admin')) {
      return { error: 'Solo Secretaria y Admin pueden cerrar caja' }
    }
    if (closingError.message.includes('dia futuro')) {
      return { error: 'No se puede cerrar un dia futuro' }
    }
    if (closingError.message.includes('Ya existe un cierre')) {
      return { error: 'Ya existe un cierre para esta fecha' }
    }
    if (closingError.message.includes('foto del reporte')) {
      return { error: 'La foto del reporte firmado es obligatoria' }
    }
    if (closingError.message.includes('diferencia')) {
      return { error: closingError.message }
    }
    if (closingError.message.includes('conteo fisico')) {
      return { error: 'El conteo fisico no puede ser negativo' }
    }

    return { error: 'Error al crear el cierre. Por favor intente de nuevo.' }
  }

  // Revalidate affected pages
  revalidatePath('/cierres')
  revalidatePath('/pagos')
  revalidatePath('/dashboard')

  return {
    success: true,
    data: closingData as CreateClosingResult,
  }
}

/**
 * Reopen a cash closing
 *
 * Only admin can reopen (enforced by RPC)
 * Requires justification (10+ chars) for audit trail
 * Returns Spanish error messages
 */
export async function reopenCash(
  prevState: CashClosingActionState | null,
  formData: FormData
): Promise<CashClosingActionState> {
  const supabase = await createClient()

  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'No autorizado. Por favor inicie sesion.' }
  }

  const rawData = {
    cierre_id: formData.get('cierre_id') as string,
    justificacion: formData.get('justificacion') as string,
  }

  // Validate with Zod
  const validated = reopenSchema.safeParse(rawData)

  if (!validated.success) {
    return {
      errors: validated.error.flatten().fieldErrors as Record<string, string[]>,
      error: 'La justificacion debe tener al menos 10 caracteres',
    }
  }

  // Call RPC function
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: reopenData, error } = await (supabase as any).rpc('reopen_cash_closing', {
    p_cierre_id: validated.data.cierre_id,
    p_justificacion: validated.data.justificacion,
  })

  if (error) {
    console.error('Reopen closing error:', error)

    // Map database errors to user-friendly Spanish messages
    if (error.message.includes('Solo Admin')) {
      return { error: 'Solo Admin puede reabrir cierres de caja' }
    }
    if (error.message.includes('10 caracteres')) {
      return { error: 'La justificacion debe tener al menos 10 caracteres' }
    }
    if (error.message.includes('no encontrado')) {
      return { error: 'Cierre no encontrado' }
    }
    if (error.message.includes('ya esta reabierto')) {
      return { error: 'El cierre ya esta reabierto' }
    }

    return { error: 'Error al reabrir el cierre' }
  }

  // Revalidate affected pages
  revalidatePath('/cierres')
  revalidatePath('/pagos')
  revalidatePath('/dashboard')

  return {
    success: true,
    data: reopenData as ReopenClosingResult,
  }
}

/**
 * Delete/void a cash closing
 *
 * Only admin or medico can delete (enforced by this action)
 * Requires justification (10+ chars) for audit trail
 * Permanently deletes the closing record, re-enabling payments for that date
 */
export async function deleteCashClosing(
  prevState: CashClosingActionState | null,
  formData: FormData
): Promise<CashClosingActionState> {
  const supabase = await createClient()

  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'No autorizado. Por favor inicie sesion.' }
  }

  // Check if user is admin or medico (role comes from JWT)
  const { data: { session } } = await supabase.auth.getSession()
  let role = 'none'
  if (session?.access_token) {
    try {
      const payload = JSON.parse(Buffer.from(session.access_token.split('.')[1], 'base64').toString())
      role = payload.app_metadata?.role ?? 'none'
    } catch {
      role = 'none'
    }
  }
  if (role !== 'admin' && role !== 'medico') {
    return { error: 'Solo Admin o Medico pueden eliminar cierres de caja' }
  }

  const rawData = {
    cierre_id: formData.get('cierre_id') as string,
    justificacion: formData.get('justificacion') as string,
  }

  // Validate with Zod
  const validated = deleteClosingSchema.safeParse(rawData)

  if (!validated.success) {
    return {
      errors: validated.error.flatten().fieldErrors as Record<string, string[]>,
      error: 'La justificacion debe tener al menos 10 caracteres',
    }
  }

  // Log the deletion for audit purposes (before actually deleting)
  console.log('Cash closing deletion:', {
    cierre_id: validated.data.cierre_id,
    deleted_by: user.id,
    justificacion: validated.data.justificacion,
    timestamp: new Date().toISOString(),
  })

  // Delete the cash closing
  const { error } = await supabase
    .from('cash_closings')
    .delete()
    .eq('id', validated.data.cierre_id)

  if (error) {
    console.error('Delete closing error:', error)
    return { error: 'Error al eliminar el cierre. Por favor intente de nuevo.' }
  }

  // Revalidate affected pages
  revalidatePath('/cierres')
  revalidatePath('/pagos')
  revalidatePath('/dashboard')

  return {
    success: true,
  }
}

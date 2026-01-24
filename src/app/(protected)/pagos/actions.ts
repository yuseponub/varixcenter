'use server'

import { createClient } from '@/lib/supabase/server'
import { paymentSchema, anulacionSchema } from '@/lib/validations/payment'
import { revalidatePath } from 'next/cache'

/**
 * Action state for payment server actions
 * Extends base pattern with payment-specific data field
 */
export type PaymentActionState = {
  error?: string
  errors?: Record<string, string[]>
  success?: boolean
  data?: { id: string; numero_factura: string }
}

/**
 * Create a new payment
 *
 * Uses RPC function for atomic transaction with gapless invoice
 * Validates with Zod schema before calling database RPC
 * Returns Spanish error messages for user-friendly feedback
 */
export async function createPayment(
  prevState: PaymentActionState | null,
  formData: FormData
): Promise<PaymentActionState> {
  const supabase = await createClient()

  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'No autorizado. Por favor inicie sesion.' }
  }

  // Parse form data (items and methods are JSON strings from form)
  let items, methods
  try {
    items = JSON.parse((formData.get('items') as string) || '[]')
    methods = JSON.parse((formData.get('methods') as string) || '[]')
  } catch {
    return { error: 'Datos de formulario invalidos' }
  }

  const rawData = {
    patient_id: formData.get('patient_id') as string,
    items,
    methods,
    descuento: parseFloat((formData.get('descuento') as string) || '0'),
    descuento_justificacion:
      (formData.get('descuento_justificacion') as string) || null,
  }

  // Validate with Zod
  const validated = paymentSchema.safeParse(rawData)

  if (!validated.success) {
    return {
      errors: validated.error.flatten().fieldErrors as Record<string, string[]>,
      error: 'Por favor corrija los errores en el formulario',
    }
  }

  // Calculate totals
  const subtotal = validated.data.items.reduce(
    (sum, item) => sum + item.unit_price * item.quantity,
    0
  )
  const total = subtotal - validated.data.descuento

  // Call RPC function for atomic creation with gapless invoice
  const { data: paymentData, error: paymentError } = await supabase.rpc(
    'create_payment_with_invoice',
    {
      p_patient_id: validated.data.patient_id,
      p_subtotal: subtotal,
      p_descuento: validated.data.descuento,
      p_descuento_justificacion: validated.data.descuento_justificacion ?? null,
      p_total: total,
      p_created_by: user.id,
      p_items: validated.data.items,
      p_methods: validated.data.methods,
    }
  )

  if (paymentError) {
    console.error('Payment creation error:', paymentError)

    // Map database errors to user-friendly Spanish messages
    if (paymentError.message.includes('comprobante')) {
      return { error: 'Los pagos electronicos requieren foto del comprobante' }
    }
    if (paymentError.message.includes('justificacion')) {
      return { error: 'Los descuentos requieren justificacion' }
    }
    if (paymentError.message.includes('no coincide')) {
      return { error: paymentError.message }
    }
    if (paymentError.message.includes('paciente no existe')) {
      return { error: 'El paciente seleccionado no existe' }
    }

    return { error: 'Error al crear el pago. Por favor intente de nuevo.' }
  }

  // Revalidate affected pages
  revalidatePath('/pagos')
  revalidatePath('/pacientes')

  return {
    success: true,
    data: paymentData as { id: string; numero_factura: string },
  }
}

/**
 * Anular (void) a payment
 *
 * Requires admin or medico role (enforced by RPC)
 * Validates justificacion (10+ chars) for audit trail
 * Returns Spanish error messages
 */
export async function anularPayment(
  prevState: PaymentActionState | null,
  formData: FormData
): Promise<PaymentActionState> {
  const supabase = await createClient()

  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'No autorizado. Por favor inicie sesion.' }
  }

  const rawData = {
    payment_id: formData.get('payment_id') as string,
    justificacion: formData.get('justificacion') as string,
  }

  // Validate with Zod
  const validated = anulacionSchema.safeParse(rawData)

  if (!validated.success) {
    return {
      errors: validated.error.flatten().fieldErrors as Record<string, string[]>,
      error: 'La justificacion debe tener al menos 10 caracteres',
    }
  }

  // Call anular_pago RPC (validates role internally)
  const { error } = await supabase.rpc('anular_pago', {
    p_payment_id: validated.data.payment_id,
    p_justificacion: validated.data.justificacion,
  })

  if (error) {
    console.error('Anulacion error:', error)

    // Map database errors to user-friendly Spanish messages
    if (error.message.includes('Solo Admin y Medico')) {
      return { error: 'Solo Admin y Medico pueden anular pagos' }
    }
    if (error.message.includes('ya fue anulado')) {
      return { error: 'El pago ya fue anulado' }
    }
    if (error.message.includes('10 caracteres')) {
      return { error: 'La justificacion debe tener al menos 10 caracteres' }
    }
    if (error.message.includes('no encontrado')) {
      return { error: 'Pago no encontrado' }
    }

    return { error: 'Error al anular el pago' }
  }

  // Revalidate affected pages
  revalidatePath('/pagos')
  revalidatePath('/pacientes')

  return { success: true }
}

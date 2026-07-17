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

  // Parse form data (items, methods, and appointment_service_ids are JSON strings from form)
  let items, methods, appointmentServiceIds: string[]
  try {
    items = JSON.parse((formData.get('items') as string) || '[]')
    methods = JSON.parse((formData.get('methods') as string) || '[]')
    appointmentServiceIds = JSON.parse((formData.get('appointment_service_ids') as string) || '[]')
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
    nota: (formData.get('nota') as string) || null,
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
  // Pass appointment_service_ids if any services are from appointments
  const { data: paymentData, error: paymentError } = await supabase.rpc(
    'create_payment_with_invoice',
    {
      p_patient_id: validated.data.patient_id,
      p_subtotal: subtotal,
      p_descuento: validated.data.descuento,
      p_descuento_justificacion: validated.data.descuento_justificacion ?? '',
      p_total: total,
      p_created_by: user.id,
      p_items: validated.data.items,
      p_methods: validated.data.methods,
      p_appointment_service_ids: appointmentServiceIds,
      p_appointment_id: undefined,
      p_nota: validated.data.nota ?? undefined,
    }
  )

  if (paymentError) {
    console.error('Payment creation error:', {
      message: paymentError.message,
      code: paymentError.code,
      details: paymentError.details,
      hint: paymentError.hint,
    })

    const msg = paymentError.message || ''

    // Match exact RPC exception phrases (anchored to the start of the message
    // raised by RAISE EXCEPTION) — NOT broad keyword matching, which used to
    // misclassify unrelated errors that happened to contain words like
    // "justificacion" (e.g. PostgREST overload errors include parameter names
    // such as p_descuento_justificacion).
    if (msg.startsWith('Los pagos electronicos requieren')) {
      return { error: 'Los pagos electronicos requieren foto del comprobante' }
    }
    if (msg.startsWith('Los descuentos requieren justificacion')) {
      return { error: 'Los descuentos requieren justificacion (minimo 5 caracteres)' }
    }
    if (msg.startsWith('La suma de items') || msg.startsWith('La suma de metodos')) {
      return { error: msg }
    }
    if (msg.startsWith('El paciente no existe')) {
      return { error: 'El paciente seleccionado no existe' }
    }
    if (msg.startsWith('Servicio de cita')) {
      return { error: 'Uno de los servicios de cita ya fue pagado o no existe' }
    }
    if (msg.startsWith('La cita especificada no existe')) {
      return { error: 'La cita especificada no existe' }
    }
    if (msg.startsWith('No se pueden crear pagos en un dia cerrado')) {
      return { error: msg }
    }

    // Fallback: surface the real DB error so the user (and devs) can see it
    // instead of getting a misleading generic message.
    return { error: `Error al crear el pago: ${msg || 'error desconocido'}` }
  }

  // Revalidate affected pages
  revalidatePath('/pagos')
  revalidatePath('/pacientes')
  revalidatePath('/citas')

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

/**
 * Update the nota of an existing payment
 */
export async function updatePaymentNota(
  paymentId: string,
  nota: string | null
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado.' }

  // Solo admin y medico pueden editar la nota de un pago (el rol viene del JWT)
  const { data: { session } } = await supabase.auth.getSession()
  let role = 'none'
  if (session?.access_token) {
    try {
      const payload = JSON.parse(
        Buffer.from(session.access_token.split('.')[1], 'base64').toString()
      )
      role = payload.app_metadata?.role ?? 'none'
    } catch {
      role = 'none'
    }
  }
  if (role !== 'admin' && role !== 'medico') {
    return { success: false, error: 'Solo Admin y Medico pueden editar la nota de un pago.' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('payments')
    .update({ nota: nota?.trim() || null })
    .eq('id', paymentId)

  if (error) {
    console.error('Update payment nota error:', error)
    return { success: false, error: 'Error al guardar la nota.' }
  }

  revalidatePath(`/pagos/${paymentId}`)
  return { success: true }
}

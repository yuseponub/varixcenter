'use server'

import { createClient } from '@/lib/supabase/server'
import { paymentSchema, anulacionSchema } from '@/lib/validations/payment'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { WimaxExecutionMode } from '@/types/invoicing'
import { bogotaDayBounds, bogotaToday } from '@/lib/bogota-date'

/**
 * Action state for payment server actions
 * Extends base pattern with payment-specific data field
 */
export type PaymentActionState = {
  error?: string
  errors?: Record<string, string[]>
  success?: boolean
  data?: { id: string; numero_factura: string }
  invoicingWarning?: string
}

export type WimaxActionResult =
  | {
      success: true
      jobId: string
      estado: string
      candidates?: Array<{ numero: string; emision: string; total: number }>
      modoEjecucion?: WimaxExecutionMode
    }
  | { success: false; error: string }

const wimaxItemSchema = z.object({
  referencia: z.string().trim().min(1).max(40),
  cantidad: z.number().int().min(1).max(99),
  precio_unitario: z.number().positive().max(9_999_999_999.99),
})


const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Resuelve la cita a la que pertenece un pago, para que la conciliación
 * diaria pueda cruzar pago y cita sin depender solo del nombre del paciente.
 *
 * Prioridad:
 * 1. Cita explícita (viene del botón "Ir a cobrar" de la agenda), si es del paciente.
 * 2. La cita de los servicios pendientes seleccionados, si todos son de una misma cita.
 * 3. La única cita viva del paciente hoy (Bogotá); si tiene varias, la primera
 *    que aún no tenga un pago activo enlazado.
 * Devuelve null si no hay una cita inequívoca: nunca adivina.
 */
async function resolvePaymentAppointmentId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  patientId: string,
  explicitAppointmentId: string | null,
  appointmentServiceIds: string[]
): Promise<string | null> {
  if (explicitAppointmentId && UUID_RE.test(explicitAppointmentId)) {
    const { data } = await supabase
      .from('appointments')
      .select('id')
      .eq('id', explicitAppointmentId)
      .eq('patient_id', patientId)
      .maybeSingle()
    if (data?.id) return data.id
  }

  if (appointmentServiceIds.length > 0) {
    const { data } = await supabase
      .from('appointment_services')
      .select('appointment_id')
      .in('id', appointmentServiceIds)
    const ids = new Set((data ?? []).map((row) => row.appointment_id))
    if (ids.size === 1) return [...ids][0]
    if (ids.size > 1) return null
  }

  const { start, end } = bogotaDayBounds(bogotaToday())
  const { data: citas } = await supabase
    .from('appointments')
    .select('id')
    .eq('patient_id', patientId)
    .gte('fecha_hora_inicio', start)
    .lte('fecha_hora_inicio', end)
    .not('estado', 'in', '(cancelada,no_asistio)')
    .order('fecha_hora_inicio', { ascending: true })

  if (!citas || citas.length === 0) return null
  if (citas.length === 1) return citas[0].id

  const { data: pagados } = await supabase
    .from('payments')
    .select('appointment_id')
    .in('appointment_id', citas.map((c) => c.id))
    .eq('estado', 'activo')
  const conPago = new Set((pagados ?? []).map((p) => p.appointment_id))
  return citas.find((c) => !conPago.has(c.id))?.id ?? null
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
  const pidioFactura = formData.get('pidio_factura') === 'true'
  const explicitAppointmentId = ((formData.get('appointment_id') as string) || '').trim() || null

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

  const appointmentId = await resolvePaymentAppointmentId(
    supabase,
    validated.data.patient_id,
    explicitAppointmentId,
    appointmentServiceIds
  )

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
      p_appointment_id: appointmentId ?? undefined,
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

  const createdPayment = paymentData as { id: string; numero_factura: string }
  let invoicingWarning: string | undefined

  if (pidioFactura) {
    const { error: invoicingError } = await supabase.rpc(
      'encolar_pago_facturacion',
      { p_payment_id: createdPayment.id }
    )

    if (invoicingError) {
      console.error('Payment invoicing queue error:', invoicingError)
      // The payment already exists and must never be submitted twice. Surface a
      // warning while preserving the successful payment result.
      invoicingWarning =
        'El pago se registro, pero no pudo marcarse para factura. Avise al administrador.'
    }
  }

  // Revalidate affected pages
  revalidatePath('/pagos')
  revalidatePath('/pacientes')
  revalidatePath('/citas')
  revalidatePath('/facturacion')
  revalidatePath('/dashboard')

  return {
    success: true,
    data: createdPayment,
    invoicingWarning,
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

/**
 * Corregir el METODO de pago de un pago ya registrado (ej. se registro como
 * efectivo pero fue tarjeta). NO cambia el total ni elimina el pago: la suma
 * de los metodos debe seguir siendo igual al total.
 *
 * El control real de rol (admin/medico/secretaria), el estado del pago y la
 * auditoria los hace el RPC `editar_metodos_pago` (migracion 074).
 */
const editMethodsSchema = z.object({
  payment_id: z.string().uuid('Pago invalido'),
  methods: z
    .array(
      z.object({
        metodo: z.enum(['efectivo', 'tarjeta', 'transferencia', 'nequi']),
        monto: z.number().positive('El monto debe ser mayor a cero'),
        comprobante_path: z.string().nullable().optional(),
      })
    )
    .min(1, 'Debe incluir al menos un metodo de pago'),
})

export async function editPaymentMethods(input: {
  payment_id: string
  methods: { metodo: string; monto: number; comprobante_path?: string | null }[]
}): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado. Por favor inicie sesion.' }

  const validated = editMethodsSchema.safeParse(input)
  if (!validated.success) {
    return { error: validated.error.issues[0]?.message ?? 'Datos invalidos' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('editar_metodos_pago', {
    p_payment_id: validated.data.payment_id,
    p_methods: validated.data.methods,
  })

  if (error) {
    console.error('Editar metodos de pago error:', error)
    // Los mensajes del RPC ya vienen en espanol y son seguros de mostrar.
    return { error: error.message?.replace(/^.*?:\s*/, '') || 'Error al editar el metodo de pago' }
  }

  revalidatePath(`/pagos/${validated.data.payment_id}`)
  revalidatePath('/pagos')
  revalidatePath('/cierres')
  return { success: true }
}

/**
 * Corregir el VALOR de un pago ya registrado (precio/cantidad de servicios,
 * total y montos por metodo). Caso real: se registro con un cero de menos.
 * El pago no se anula: queda marcado como "Valor editado por error" con
 * quien, cuando y los valores anteriores.
 *
 * El control real de rol (todo el personal), el estado del pago, el bloqueo
 * por facturacion WiMAX, el historial y la auditoria los hace el RPC
 * `corregir_valor_pago` (migracion 081).
 */
const correctValuesSchema = z.object({
  payment_id: z.string().uuid('Pago invalido'),
  items: z
    .array(
      z.object({
        item_id: z.string().uuid('Servicio invalido'),
        unit_price: z.number().min(0, 'El precio no puede ser negativo').max(9_999_999_999.99),
        quantity: z.number().int().min(1, 'La cantidad debe ser al menos 1').max(99),
      })
    )
    .min(1, 'Debe incluir al menos un servicio')
    .max(50),
  total: z.number().positive('El total debe ser mayor a 0').max(9_999_999_999.99),
  methods: z
    .array(
      z.object({
        metodo: z.enum(['efectivo', 'tarjeta', 'transferencia', 'nequi']),
        monto: z.number().positive('El monto debe ser mayor a cero'),
        comprobante_path: z.string().nullable().optional(),
      })
    )
    .min(1, 'Debe incluir al menos un metodo de pago'),
  nota: z.string().max(300, 'La nota es muy larga (maximo 300 caracteres)').nullable().optional(),
})

export type CorrectPaymentValuesInput = z.infer<typeof correctValuesSchema>

export async function correctPaymentValues(
  input: CorrectPaymentValuesInput
): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado. Por favor inicie sesion.' }

  const validated = correctValuesSchema.safeParse(input)
  if (!validated.success) {
    return { error: validated.error.issues[0]?.message ?? 'Datos invalidos' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('corregir_valor_pago', {
    p_payment_id: validated.data.payment_id,
    p_items: validated.data.items,
    p_total: validated.data.total,
    p_methods: validated.data.methods,
    p_nota: validated.data.nota ?? null,
  })

  if (error) {
    console.error('Corregir valor de pago error:', { code: error.code, message: error.message })
    // Los mensajes del RPC ya vienen en espanol y son seguros de mostrar.
    return { error: error.message?.replace(/^.*?:\s*/, '') || 'Error al corregir el valor del pago' }
  }

  revalidatePath(`/pagos/${validated.data.payment_id}`)
  revalidatePath('/pagos')
  revalidatePath('/cierres')
  revalidatePath('/reportes')
  return { success: true }
}

/**
 * Canonicalize and enqueue the editable WiMAX invoice lines. PostgreSQL owns
 * the final catalog/total/dedup validation; this validation only gives the UI
 * fast, readable errors.
 */
export async function prepararFacturaWimaxAction(
  paymentId: string,
  items: Array<{
    referencia: string
    cantidad: number
    precio_unitario: number
  }>,
  modoEjecucion: Extract<WimaxExecutionMode, 'urgente' | 'cierre'>
): Promise<WimaxActionResult> {
  const parsed = z
    .object({
      paymentId: z.string().uuid(),
      items: z.array(wimaxItemSchema).min(1).max(20),
      modoEjecucion: z.enum(['urgente', 'cierre']),
    })
    .safeParse({ paymentId, items, modoEjecucion })

  if (!parsed.success) {
    return { success: false, error: 'Revise tratamientos, cantidades y precios.' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado.' }

  const { data, error } = await supabase.rpc('preparar_factura_wimax_programada', {
    p_payment_id: parsed.data.paymentId,
    p_items: parsed.data.items,
    p_modo: parsed.data.modoEjecucion,
  })

  if (error) {
    console.error('prepararFacturaWimaxAction error:', {
      code: error.code,
      message: error.message,
    })
    return { success: false, error: error.message || 'No fue posible crear el trabajo WiMAX.' }
  }

  const result = data as unknown as {
    job_id: string
    estado: string
    modo_ejecucion: WimaxExecutionMode
    candidatas?: Array<{ numero: string; emision: string; total: number }>
  }
  revalidatePath('/pagos')
  revalidatePath(`/pagos/${paymentId}`)
  revalidatePath('/facturacion')

  return {
    success: true,
    jobId: result.job_id,
    estado: result.estado,
    modoEjecucion: result.modo_ejecucion,
    candidates: result.candidatas,
  }
}

export async function autorizarFacturaWimaxAction(
  jobId: string
): Promise<WimaxActionResult> {
  if (!z.string().uuid().safeParse(jobId).success) {
    return { success: false, error: 'Trabajo WiMAX invalido.' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado.' }

  const { data, error } = await supabase.rpc('autorizar_factura_wimax', {
    p_job_id: jobId,
  })
  if (error) {
    console.error('autorizarFacturaWimaxAction error:', {
      code: error.code,
      message: error.message,
    })
    return { success: false, error: error.message || 'No fue posible autorizar la emision.' }
  }

  const result = data as unknown as { job_id: string; estado: string }
  revalidatePath('/pagos')
  revalidatePath('/facturacion')
  return { success: true, jobId: result.job_id, estado: result.estado }
}

export async function registrarCufeFacturaWimaxAction(
  jobId: string,
  cufe: string
): Promise<WimaxActionResult> {
  const normalizedCufe = cufe.trim().toLowerCase()
  if (
    !z.string().uuid().safeParse(jobId).success ||
    !/^[0-9a-f]{64,128}$/.test(normalizedCufe)
  ) {
    return { success: false, error: 'Ingrese un CUFE valido.' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado.' }

  const { data, error } = await supabase.rpc('registrar_cufe_factura_wimax', {
    p_job_id: jobId,
    p_cufe: normalizedCufe,
  })
  if (error) {
    console.error('registrarCufeFacturaWimaxAction error:', {
      code: error.code,
      message: error.message,
    })
    return { success: false, error: error.message || 'No fue posible registrar el CUFE.' }
  }

  const result = data as unknown as { estado: string; numero: string }
  revalidatePath('/pagos')
  revalidatePath('/facturacion')
  return { success: true, jobId, estado: result.estado }
}

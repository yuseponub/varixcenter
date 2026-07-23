'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { InvoicingCrossResult } from '@/types/invoicing'

type BasicActionResult = { success: true } | { success: false; error: string }
type CrossActionResult =
  | { success: true; data: InvoicingCrossResult }
  | { success: false; error: string }

async function getAuthorizedClient() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: false as const, error: 'No autorizado' }

  const { data: role, error } = await supabase.rpc('get_user_role')
  if (error || (role !== 'admin' && role !== 'secretaria')) {
    return {
      ok: false as const,
      error: 'Solo Admin y Secretaria pueden gestionar facturacion',
    }
  }

  return { ok: true as const, supabase, user }
}

export async function actualizarMontoFacturarAction(
  paymentId: string,
  amount: number
): Promise<BasicActionResult> {
  const auth = await getAuthorizedClient()
  if (!auth.ok) return { success: false, error: auth.error }

  const normalizedAmount = Math.round(Number(amount) * 100) / 100
  if (
    !paymentId ||
    !Number.isFinite(normalizedAmount) ||
    normalizedAmount <= 0 ||
    normalizedAmount > 9_999_999_999.99
  ) {
    return { success: false, error: 'Ingrese un monto valido mayor que cero' }
  }

  const { data, error } = await auth.supabase
    .from('payment_invoicing')
    .update({ monto_a_facturar: normalizedAmount })
    .eq('payment_id', paymentId)
    .eq('estado', 'pendiente')
    .select('payment_id')
    .maybeSingle()

  if (error) {
    console.error('actualizarMontoFacturarAction error:', error)
    return { success: false, error: 'No fue posible guardar el monto' }
  }
  if (!data) {
    return { success: false, error: 'El pago ya no esta pendiente' }
  }

  revalidatePath('/facturacion')
  return { success: true }
}

export async function descartarFacturacionAction(
  paymentId: string,
  reason: string
): Promise<BasicActionResult> {
  const auth = await getAuthorizedClient()
  if (!auth.ok) return { success: false, error: auth.error }

  const normalizedReason = reason.trim()
  if (!paymentId || normalizedReason.length < 5) {
    return {
      success: false,
      error: 'El motivo de descarte debe tener al menos 5 caracteres',
    }
  }

  const { data: activeJob, error: jobError } = await auth.supabase
    .from('wimax_invoice_jobs')
    .select('estado')
    .eq('payment_id', paymentId)
    .in('estado', [
      'en_cola',
      'preparando',
      'esperando_aprobacion',
      'aprobada',
      'verificando',
      'emitida_sin_cufe',
      'requiere_revision',
    ])
    .maybeSingle()
  if (jobError) {
    console.error('descartarFacturacionAction job check error:', jobError)
    return { success: false, error: 'No fue posible verificar el estado del robot' }
  }
  if (activeJob) {
    return { success: false, error: 'Detenga o termine el trabajo del robot antes de descartar' }
  }

  const { data, error } = await auth.supabase
    .from('payment_invoicing')
    .update({
      estado: 'descartada',
      motivo_descarte: normalizedReason,
      descartada_por: auth.user.id,
      descartada_at: new Date().toISOString(),
    })
    .eq('payment_id', paymentId)
    .eq('estado', 'pendiente')
    .select('payment_id')
    .maybeSingle()

  if (error) {
    console.error('descartarFacturacionAction error:', error)
    return { success: false, error: 'No fue posible descartar el pago' }
  }
  if (!data) {
    return { success: false, error: 'El pago ya no esta pendiente' }
  }

  revalidatePath('/facturacion')
  revalidatePath('/dashboard')
  return { success: true }
}

export async function cruzarFacturacionAction(): Promise<CrossActionResult> {
  const auth = await getAuthorizedClient()
  if (!auth.ok) return { success: false, error: auth.error }

  const { data, error } = await auth.supabase.rpc('cruzar_facturacion_wimax')
  if (error) {
    console.error('cruzarFacturacionAction error:', error)
    return { success: false, error: 'No fue posible cruzar las facturas WiMAX' }
  }

  revalidatePath('/facturacion')
  revalidatePath('/dashboard')
  return {
    success: true,
    data: data as unknown as InvoicingCrossResult,
  }
}

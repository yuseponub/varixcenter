'use server'

import { createClient } from '@/lib/supabase/server'
import { getDailyReconciliation, isValidIsoDate } from '@/lib/queries/reconciliation'
import { getReconciliationEmailConfig, sendReconciliationEmail } from '@/lib/reconciliation/email'

export type SendReconciliationState = {
  success?: boolean
  message?: string
  error?: string
}

async function getUserRole(): Promise<string> {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) return 'none'
  try {
    const payload = JSON.parse(Buffer.from(session.access_token.split('.')[1], 'base64').toString())
    return payload.app_metadata?.role ?? 'none'
  } catch {
    return 'none'
  }
}

/**
 * Envía por correo la conciliación de un día. Solo admin.
 * Usa el cliente SSR (RLS del usuario), no el service role.
 */
export async function sendReconciliationEmailAction(
  _prev: SendReconciliationState | null,
  formData: FormData
): Promise<SendReconciliationState> {
  if ((await getUserRole()) !== 'admin') {
    return { error: 'Solo el administrador puede enviar la conciliación.' }
  }

  const fecha = String(formData.get('fecha') ?? '')
  if (!isValidIsoDate(fecha)) {
    return { error: 'Fecha inválida.' }
  }

  const config = getReconciliationEmailConfig()
  if (!config) {
    return { error: 'El envío de correo no está configurado (falta RESEND_API_KEY en el servidor).' }
  }

  try {
    const report = await getDailyReconciliation(fecha)
    const result = await sendReconciliationEmail(report, config)
    if (!result.sent) {
      return { error: `No se pudo enviar: ${result.error}` }
    }
    return { success: true, message: `Enviado a ${config.to.join(', ')}.` }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Error al generar la conciliación.' }
  }
}

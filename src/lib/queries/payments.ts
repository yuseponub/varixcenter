import { createClient } from '@/lib/supabase/server'
import type { Payment, PaymentWithDetails } from '@/types'

/**
 * Get paginated list of payments for display
 * Most recent first, includes patient name
 */
export async function getPayments(options: {
  page?: number
  limit?: number
  patientId?: string
  estado?: 'activo' | 'anulado'
} = {}): Promise<{ payments: PaymentWithDetails[]; total: number }> {
  const { page = 1, limit = 20, patientId, estado } = options
  const offset = (page - 1) * limit

  const supabase = await createClient()

  let query = supabase
    .from('payments')
    .select(`
      *,
      patients!inner(id, cedula, nombre, apellido),
      payment_items(*),
      payment_methods(*)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (patientId) {
    query = query.eq('patient_id', patientId)
  }

  if (estado) {
    query = query.eq('estado', estado)
  }

  const { data, error, count } = await query

  if (error) {
    console.error('Error fetching payments:', error)
    return { payments: [], total: 0 }
  }

  return {
    payments: (data as unknown as PaymentWithDetails[]) || [],
    total: count || 0
  }
}

/**
 * Get single payment with all details for display
 */
export async function getPaymentWithDetails(id: string): Promise<PaymentWithDetails | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('payments')
    .select(`
      *,
      patients!inner(id, cedula, nombre, apellido),
      payment_items(*),
      payment_methods(*)
    `)
    .eq('id', id)
    .single()

  if (error) {
    console.error('Error fetching payment:', error)
    return null
  }

  return data as unknown as PaymentWithDetails
}

/**
 * Get payment by invoice number (for lookup)
 */
export async function getPaymentByInvoice(numeroFactura: string): Promise<Payment | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('numero_factura', numeroFactura)
    .single()

  if (error) {
    console.error('Error fetching payment by invoice:', error)
    return null
  }

  return data
}

/**
 * Get payments for a specific patient (for timeline)
 */
export async function getPatientPayments(patientId: string): Promise<Payment[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching patient payments:', error)
    return []
  }

  return data || []
}

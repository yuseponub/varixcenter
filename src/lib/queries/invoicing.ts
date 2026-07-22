import { createClient } from '@/lib/supabase/server'
import type {
  InvoicingQueueData,
  PendingInvoicingItem,
  PendingInvoicingSummary,
  RecentInvoicingItem,
} from '@/types/invoicing'

type PaymentRelation = {
  id: string
  numero_factura: string
  total: number
  created_at: string
  estado: string
  patients: {
    id: string
    cedula: string | null
    nombre: string
    apellido: string
  }
  payment_items: Array<{
    id: string
    service_name: string
    unit_price: number
    quantity: number
    subtotal: number
  }>
}

type PendingRow = {
  id: string
  payment_id: string
  estado: string
  monto_a_facturar: number | null
  pidio_factura: boolean
  created_at: string
  updated_at: string
  payments: PaymentRelation
}

type RecentRow = PendingRow & {
  wimax_factura_numero: string | null
  wimax_facturas: {
    numero: string
    emision: string
    total: number
  } | null
}

function mapPayment(payment: PaymentRelation) {
  return {
    id: payment.id,
    numero_factura: payment.numero_factura,
    total: Number(payment.total),
    created_at: payment.created_at,
    patient: payment.patients,
    services: (payment.payment_items ?? []).map((item) => ({
      ...item,
      unit_price: Number(item.unit_price),
      subtotal: Number(item.subtotal),
    })),
  }
}

export async function getInvoicingQueue(): Promise<InvoicingQueueData> {
  const supabase = await createClient()

  const [pendingResult, recentResult] = await Promise.all([
    supabase
      .from('payment_invoicing')
      .select(`
        id,
        payment_id,
        estado,
        monto_a_facturar,
        pidio_factura,
        created_at,
        updated_at,
        payments!inner(
          id,
          numero_factura,
          total,
          created_at,
          estado,
          patients!inner(id, cedula, nombre, apellido),
          payment_items(id, service_name, unit_price, quantity, subtotal)
        )
      `)
      .eq('estado', 'pendiente')
      .eq('payments.estado', 'activo'),
    supabase
      .from('payment_invoicing')
      .select(`
        id,
        payment_id,
        estado,
        monto_a_facturar,
        pidio_factura,
        created_at,
        updated_at,
        wimax_factura_numero,
        payments!inner(
          id,
          numero_factura,
          total,
          created_at,
          estado,
          patients!inner(id, cedula, nombre, apellido),
          payment_items(id, service_name, unit_price, quantity, subtotal)
        ),
        wimax_facturas(numero, emision, total)
      `)
      .in('estado', ['facturada_total', 'facturada_parcial'])
      .order('updated_at', { ascending: false })
      .limit(50),
  ])

  if (pendingResult.error) {
    console.error('getInvoicingQueue pending error:', pendingResult.error)
  }
  if (recentResult.error) {
    console.error('getInvoicingQueue recent error:', recentResult.error)
  }

  const pendingRows = (pendingResult.data ?? []) as unknown as PendingRow[]
  const recentRows = (recentResult.data ?? []) as unknown as RecentRow[]

  const pending = pendingRows
    .map((row): PendingInvoicingItem => ({
      id: row.id,
      payment_id: row.payment_id,
      estado: 'pendiente',
      monto_a_facturar:
        row.monto_a_facturar === null ? null : Number(row.monto_a_facturar),
      pidio_factura: row.pidio_factura,
      created_at: row.created_at,
      updated_at: row.updated_at,
      payment: mapPayment(row.payments),
    }))
    .sort(
      (a, b) =>
        new Date(a.payment.created_at).getTime() -
        new Date(b.payment.created_at).getTime()
    )

  const recent = recentRows
    .filter(
      (row) =>
        row.wimax_factura_numero &&
        (row.estado === 'facturada_total' || row.estado === 'facturada_parcial')
    )
    .map((row): RecentInvoicingItem => ({
      id: row.id,
      payment_id: row.payment_id,
      estado: row.estado as RecentInvoicingItem['estado'],
      monto_a_facturar:
        row.monto_a_facturar === null ? null : Number(row.monto_a_facturar),
      wimax_factura_numero: row.wimax_factura_numero as string,
      updated_at: row.updated_at,
      payment: mapPayment(row.payments),
      wimax_factura: row.wimax_facturas
        ? {
            ...row.wimax_facturas,
            total: Number(row.wimax_facturas.total),
          }
        : null,
    }))

  return { pending, recent }
}

export async function getPendingInvoicingSummary(): Promise<PendingInvoicingSummary> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('payment_invoicing')
    .select('payment_id, payments!inner(created_at, estado)')
    .eq('estado', 'pendiente')
    .eq('payments.estado', 'activo')

  if (error) {
    console.error('getPendingInvoicingSummary error:', error)
    return { count: 0, oldestDays: null }
  }

  const rows = (data ?? []) as unknown as Array<{
    payments: { created_at: string }
  }>
  if (rows.length === 0) return { count: 0, oldestDays: null }

  const oldestTimestamp = Math.min(
    ...rows.map((row) => new Date(row.payments.created_at).getTime())
  )
  const oldestDays = Math.max(
    0,
    Math.floor((Date.now() - oldestTimestamp) / 86_400_000)
  )

  return { count: rows.length, oldestDays }
}

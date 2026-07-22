export const INVOICING_STATES = [
  'pendiente',
  'facturada_total',
  'facturada_parcial',
  'descartada',
] as const

export type InvoicingState = (typeof INVOICING_STATES)[number]

export interface InvoicingService {
  id: string
  service_name: string
  unit_price: number
  quantity: number
  subtotal: number
}

export interface InvoicingPayment {
  id: string
  numero_factura: string
  total: number
  created_at: string
  patient: {
    id: string
    cedula: string | null
    nombre: string
    apellido: string
  }
  services: InvoicingService[]
}

export interface PendingInvoicingItem {
  id: string
  payment_id: string
  estado: 'pendiente'
  monto_a_facturar: number | null
  pidio_factura: boolean
  created_at: string
  updated_at: string
  payment: InvoicingPayment
}

export interface RecentInvoicingItem {
  id: string
  payment_id: string
  estado: 'facturada_total' | 'facturada_parcial'
  monto_a_facturar: number | null
  wimax_factura_numero: string
  updated_at: string
  payment: InvoicingPayment
  wimax_factura: {
    numero: string
    emision: string
    total: number
  } | null
}

export interface InvoicingQueueData {
  pending: PendingInvoicingItem[]
  recent: RecentInvoicingItem[]
}

export interface InvoicingCrossResult {
  success: boolean
  revisados: number
  facturadas_total: number
  facturadas_parcial: number
  pendientes: number
}

export interface PendingInvoicingSummary {
  count: number
  oldestDays: number | null
}

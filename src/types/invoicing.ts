export const INVOICING_STATES = [
  'pendiente',
  'facturada_total',
  'facturada_parcial',
  'descartada',
] as const

export type InvoicingState = (typeof INVOICING_STATES)[number]

export type ColfactReviewState =
  | 'no_revisada'
  | 'sin_coincidencia'
  | 'coincidencia_ambigua'
  | 'confirmada'

export const WIMAX_JOB_STATES = [
  'en_cola',
  'preparando',
  'esperando_aprobacion',
  'aprobada',
  'verificando',
  'completada',
  'bloqueada_duplicado',
  'emitida_sin_cufe',
  'requiere_revision',
  'error',
  'cancelada',
] as const

export type WimaxJobState = (typeof WIMAX_JOB_STATES)[number]

export const WIMAX_EXECUTION_MODES = ['supervisada', 'urgente', 'cierre'] as const
export type WimaxExecutionMode = (typeof WIMAX_EXECUTION_MODES)[number]

export interface WimaxInvoiceJobSummary {
  id: string
  estado: WimaxJobState
  monto: number
  items: Array<{
    referencia: string
    descripcion: string
    cantidad: number
    precio_unitario: number
  }>
  supervisada: boolean
  modo_ejecucion: WimaxExecutionMode
  last_step: string | null
  wimax_factura_numero: string | null
  cufe: string | null
  error_code: string | null
  error_message: string | null
  dedup_evidence: Record<string, unknown>
  approved_at: string | null
  updated_at: string
}

export interface PaymentInvoicingSummary {
  estado: InvoicingState
  monto_a_facturar: number | null
  pidio_factura: boolean
  wimax_factura_numero: string | null
  colfact_revision_estado: ColfactReviewState
  colfact_evidence: Record<string, unknown>
  wimax_facturas: {
    pdf_storage_path: string | null
  } | null
}

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
  colfact_revision_estado: ColfactReviewState
  colfact_evidence: Record<string, unknown>
  created_at: string
  updated_at: string
  payment: InvoicingPayment
  job: WimaxInvoiceJobSummary | null
}

export interface RecentInvoicingItem {
  id: string
  payment_id: string
  estado: 'facturada_total' | 'facturada_parcial'
  monto_a_facturar: number | null
  wimax_factura_numero: string
  colfact_revision_estado: ColfactReviewState
  updated_at: string
  payment: InvoicingPayment
  wimax_factura: {
    numero: string
    emision: string
    total: number
    pdf_storage_path: string | null
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

/**
 * Medias Returns Type Definitions
 *
 * Types matching medias_returns table
 * Used by: Return creation, approval workflow, returns list
 */

/**
 * Return status (matches devolucion_estado ENUM)
 */
export const DEVOLUCION_ESTADOS = ['pendiente', 'aprobada', 'rechazada'] as const
export type DevolucionEstado = (typeof DEVOLUCION_ESTADOS)[number]

export const DEVOLUCION_ESTADO_LABELS: Record<DevolucionEstado, string> = {
  pendiente: 'Pendiente',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
}

export const DEVOLUCION_ESTADO_COLORS: Record<DevolucionEstado, string> = {
  pendiente: 'bg-yellow-100 text-yellow-800',
  aprobada: 'bg-green-100 text-green-800',
  rechazada: 'bg-red-100 text-red-800',
}

/**
 * Refund method (matches reembolso_metodo ENUM)
 */
export const REEMBOLSO_METODOS = ['efectivo', 'cambio_producto'] as const
export type ReembolsoMetodo = (typeof REEMBOLSO_METODOS)[number]

export const REEMBOLSO_METODO_LABELS: Record<ReembolsoMetodo, string> = {
  efectivo: 'Efectivo',
  cambio_producto: 'Cambio de producto',
}

/**
 * Return record (medias_returns table)
 */
export interface MediasReturn {
  id: string
  numero_devolucion: string
  sale_id: string
  sale_item_id: string
  cantidad: number
  product_codigo: string
  product_tipo: string
  product_talla: string
  monto_devolucion: number
  motivo: string
  foto_path: string | null
  metodo_reembolso: ReembolsoMetodo
  estado: DevolucionEstado
  solicitante_id: string
  aprobador_id: string | null
  aprobado_at: string | null
  notas_aprobador: string | null
  created_at: string
  updated_at: string
}

/**
 * Return with related data for detail/list views
 */
export interface MediasReturnWithDetails extends MediasReturn {
  sale?: {
    id: string
    numero_venta: string
    patient?: {
      id: string
      nombre: string
      apellido: string
    } | null
  }
  solicitante?: {
    id: string
    email: string
  }
  aprobador?: {
    id: string
    email: string
  } | null
}

/**
 * Return creation input (for RPC call)
 */
export interface CreateReturnInput {
  sale_id: string
  sale_item_id: string
  cantidad: number
  motivo: string
  metodo_reembolso: ReembolsoMetodo
  foto_path?: string | null
}

/**
 * Approval/rejection input
 */
export interface ApproveReturnInput {
  return_id: string
  notas?: string | null
}

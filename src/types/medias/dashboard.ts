/**
 * Medias Dashboard Type Definitions
 *
 * Types for dashboard metrics, stock alerts, and inventory adjustments
 * Used by: Dashboard page, stock alerts, adjustment form
 */

import { MediasProductType, MediasProductSize } from './products'

/**
 * Dashboard metrics for Medias module
 * All monetary values in COP
 */
export interface DashboardMetrics {
  efectivo_en_caja: number // Cash from today's open cierre or 0
  ventas_hoy_count: number
  ventas_hoy_total: number
  ventas_mes_count: number
  ventas_mes_total: number
  devoluciones_pendientes: number
}

/**
 * Product with low stock alert data
 * Based on stock_normal < umbral_alerta (ignores stock_devoluciones)
 */
export interface LowStockProduct {
  id: string
  codigo: string
  tipo: MediasProductType
  talla: MediasProductSize
  stock_normal: number
  umbral_alerta: number
}

/**
 * Summary of stock alerts for dashboard display
 */
export interface StockAlertsSummary {
  critical_count: number
  products: LowStockProduct[]
}

/**
 * Adjustment direction: entrada adds stock, salida removes stock
 */
export const ADJUSTMENT_TYPES = ['entrada', 'salida'] as const
export type AdjustmentType = (typeof ADJUSTMENT_TYPES)[number]

/**
 * Stock type to adjust: normal or devoluciones
 */
export const STOCK_TYPES = ['normal', 'devoluciones'] as const
export type StockType = (typeof STOCK_TYPES)[number]

/**
 * Result from create_inventory_adjustment RPC
 */
export interface AdjustmentResult {
  success: boolean
  movement_id: string
  stock_normal: number
  stock_devoluciones: number
}

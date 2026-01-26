/**
 * Report Type Definitions
 *
 * Types for income reports and financial data visualization.
 * Used by: Report pages, charts, data export
 */

/**
 * Report filter parameters for date range queries.
 * Both dates in YYYY-MM-DD format.
 */
export interface ReportFilters {
  startDate: string
  endDate: string
}

/**
 * Income report data returned by get_income_report RPC.
 * Matches the report aggregation structure.
 */
export interface IncomeReport {
  total_efectivo: number
  total_tarjeta: number
  total_transferencia: number
  total_nequi: number
  total_descuentos: number
  total_anulaciones: number
  grand_total: number
  payment_count: number
  citas_atendidas: number
}

/**
 * Chart data point for Recharts visualizations.
 * Used for stacked bar/area charts by payment method.
 */
export interface ChartDataPoint {
  date: string // Display label (e.g., "Ene 15" or "Enero")
  efectivo: number
  tarjeta: number
  transferencia: number
  nequi: number
}

/**
 * Daily income breakdown for detailed reports.
 * Used for daily summary tables.
 */
export interface DailyIncomeData {
  fecha: string // YYYY-MM-DD format
  efectivo: number
  tarjeta: number
  transferencia: number
  nequi: number
  total: number
}

/**
 * Report period type for filtering.
 * Controls report aggregation granularity.
 */
export type ReportPeriod = 'diario' | 'mensual' | 'rango'

/**
 * Format a number as Colombian Peso (COP) currency string.
 *
 * @param amount - The numeric amount to format
 * @returns Formatted currency string (e.g., "$50.000")
 *
 * @example
 * formatCurrency(50000) // "$50.000"
 * formatCurrency(1234567) // "$1.234.567"
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

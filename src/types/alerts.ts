/**
 * Alert Type Definitions
 *
 * Types matching the alerts database schema (027_reports_alerts.sql)
 * Used by: Alert display, resolution forms, admin dashboard
 */

/**
 * Alert severity values matching the database enum.
 * Uses const assertion for literal type inference.
 */
export const ALERT_SEVERIDADES = ['info', 'advertencia', 'critico'] as const

/**
 * Alert type values matching the database enum.
 * Uses const assertion for literal type inference.
 */
export const ALERT_TIPOS = ['pago_anulado', 'diferencia_cierre'] as const

/**
 * Alert severity type derived from ALERT_SEVERIDADES array.
 * Ensures compile-time type safety for severity values.
 */
export type AlertSeveridad = (typeof ALERT_SEVERIDADES)[number]

/**
 * Alert type derived from ALERT_TIPOS array.
 * Ensures compile-time type safety for alert type values.
 */
export type AlertTipo = (typeof ALERT_TIPOS)[number]

/**
 * Base alert type from database Row.
 * Matches the alerts table schema exactly.
 */
export interface Alert {
  id: string
  tipo: AlertTipo
  severidad: AlertSeveridad
  titulo: string
  descripcion: string
  referencia_tipo: string | null
  referencia_id: string | null
  resuelta: boolean
  resuelta_por: string | null
  resuelta_at: string | null
  resuelta_notas: string | null
  created_at: string
}

/**
 * Configuration for alert severity UI styling.
 * Provides variant, icon, and background color for each severity level.
 */
export const ALERT_SEVERIDAD_CONFIG: Record<
  AlertSeveridad,
  {
    label: string
    variant: 'secondary' | 'outline' | 'destructive'
    icon: 'Info' | 'AlertTriangle' | 'AlertCircle'
    bgColor: string
  }
> = {
  info: {
    label: 'Informativo',
    variant: 'secondary',
    icon: 'Info',
    bgColor: 'bg-blue-50',
  },
  advertencia: {
    label: 'Advertencia',
    variant: 'outline',
    icon: 'AlertTriangle',
    bgColor: 'bg-yellow-50',
  },
  critico: {
    label: 'Critico',
    variant: 'destructive',
    icon: 'AlertCircle',
    bgColor: 'bg-red-50',
  },
}

/**
 * Human-readable labels for alert types (Spanish).
 */
export const ALERT_TIPO_LABELS: Record<AlertTipo, string> = {
  pago_anulado: 'Pago Anulado',
  diferencia_cierre: 'Diferencia en Cierre',
}

/**
 * Type guard to check if a value is a valid AlertSeveridad.
 *
 * @param value - The value to check
 * @returns True if value is a valid AlertSeveridad
 */
export function isValidAlertSeveridad(value: unknown): value is AlertSeveridad {
  return (
    typeof value === 'string' &&
    ALERT_SEVERIDADES.includes(value as AlertSeveridad)
  )
}

/**
 * Type guard to check if a value is a valid AlertTipo.
 *
 * @param value - The value to check
 * @returns True if value is a valid AlertTipo
 */
export function isValidAlertTipo(value: unknown): value is AlertTipo {
  return (
    typeof value === 'string' && ALERT_TIPOS.includes(value as AlertTipo)
  )
}

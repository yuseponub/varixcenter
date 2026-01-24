/**
 * Service Type Definitions
 *
 * Types matching the services database schema (008_services.sql)
 * Used by: Payment forms, service management, pricing calculations
 */

/**
 * Base service type from database Row.
 * Matches the services table schema exactly.
 */
export interface Service {
  id: string
  nombre: string
  descripcion: string | null
  precio_base: number
  precio_variable: boolean
  precio_minimo: number | null
  precio_maximo: number | null
  activo: boolean
  created_at: string
  updated_at: string
  created_by: string | null
}

/**
 * Service insert type (for creating new services)
 */
export interface ServiceInsert {
  nombre: string
  descripcion?: string | null
  precio_base: number
  precio_variable?: boolean
  precio_minimo?: number | null
  precio_maximo?: number | null
  activo?: boolean
}

/**
 * Service update type (for editing existing services)
 */
export interface ServiceUpdate {
  nombre?: string
  descripcion?: string | null
  precio_base?: number
  precio_variable?: boolean
  precio_minimo?: number | null
  precio_maximo?: number | null
  activo?: boolean
}

/**
 * Helper type for service selection in payment form.
 * Contains only fields needed for service dropdown and price calculation.
 */
export interface ServiceOption {
  id: string
  nombre: string
  precio_base: number
  precio_variable: boolean
  precio_minimo: number | null
  precio_maximo: number | null
}

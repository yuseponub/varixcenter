/**
 * Application Type Definitions
 *
 * Re-exports Supabase generated types and defines application-specific types.
 */

// Re-export Supabase database types
export * from './supabase'

// Re-export appointment types
export * from './appointments'

// Re-export service types
export * from './services'

// Re-export payment types
export * from './payments'

// Re-export appointment services types
export * from './appointment-services'

// Re-export cash closing types
export * from './cash-closing'

// Re-export medical records types
export * from './medical-records'

// NOTE: Medias types (products, sales, cierres) are NOT re-exported here
// to avoid conflicts with clinic types (PAYMENT_METHODS, CierreEstado, etc.)
// Import directly from @/types/medias/products, @/types/medias/sales, @/types/medias/cierres

/**
 * User roles for the VarixClinic system.
 * Matches the roles defined in the Custom Access Token Hook.
 *
 * - admin: Full system access, can manage users and view audit logs
 * - medico: Can manage patients and medical records
 * - enfermera: Can view patients and assist with procedures
 * - secretaria: Can manage appointments and payments
 * - none: Authenticated but no role assigned (restricted access)
 */
export type UserRole = 'admin' | 'medico' | 'enfermera' | 'secretaria' | 'none'

/**
 * Type guard to check if a string is a valid UserRole
 */
export function isValidRole(role: unknown): role is UserRole {
  return (
    typeof role === 'string' &&
    ['admin', 'medico', 'enfermera', 'secretaria', 'none'].includes(role)
  )
}

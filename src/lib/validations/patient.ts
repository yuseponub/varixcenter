import { z } from 'zod'

/**
 * Colombian cedula format: 6-10 digits only
 * No check digit algorithm exists for CC (unlike NIT)
 */
const cedulaRegex = /^\d{6,10}$/

/**
 * Colombian phone: 10 digits (includes area code)
 * Example: 3001234567
 */
const phoneRegex = /^\d{10}$/

/**
 * Patient creation schema
 * Used by: Patient form, createPatient server action
 *
 * All messages in Spanish for Colombian users
 */
export const patientSchema = z.object({
  // Identification
  cedula: z
    .string()
    .min(1, 'La cedula es requerida')
    .regex(cedulaRegex, 'La cedula debe tener entre 6 y 10 digitos'),

  // Personal info
  nombre: z
    .string()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(100, 'El nombre es muy largo'),

  apellido: z
    .string()
    .min(2, 'El apellido debe tener al menos 2 caracteres')
    .max(100, 'El apellido es muy largo'),

  celular: z
    .string()
    .min(1, 'El celular es requerido')
    .regex(phoneRegex, 'El celular debe tener 10 digitos'),

  email: z
    .string()
    .email('El email no es valido')
    .max(255, 'El email es muy largo')
    .optional()
    .or(z.literal('')),

  fecha_nacimiento: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato debe ser YYYY-MM-DD')
    .optional()
    .or(z.literal('')),

  direccion: z
    .string()
    .max(200, 'La direccion es muy larga')
    .optional()
    .or(z.literal('')),

  // Emergency contact (OPTIONAL)
  contacto_emergencia_nombre: z
    .string()
    .max(100, 'El nombre es muy largo')
    .optional()
    .or(z.literal('')),

  contacto_emergencia_telefono: z
    .string()
    .regex(phoneRegex, 'El telefono debe tener 10 digitos')
    .optional()
    .or(z.literal('')),

  contacto_emergencia_parentesco: z
    .string()
    .max(50, 'El parentesco es muy largo')
    .optional()
    .or(z.literal('')),
})

/**
 * Patient update schema
 * IMPORTANT: cedula is intentionally OMITTED - it cannot be modified after creation
 * The database trigger will also reject cedula changes as a second layer of protection
 */
export const patientUpdateSchema = patientSchema.omit({ cedula: true })

/**
 * TypeScript types inferred from schemas
 */
export type PatientFormData = z.infer<typeof patientSchema>
export type PatientUpdateData = z.infer<typeof patientUpdateSchema>

/**
 * Search query validation (for URL params)
 */
export const patientSearchSchema = z.object({
  q: z.string().max(100).optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
})

export type PatientSearchParams = z.infer<typeof patientSearchSchema>

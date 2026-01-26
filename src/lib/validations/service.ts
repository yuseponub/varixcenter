import { z } from 'zod'

/**
 * Base service schema without refinements
 * Used as foundation for both create and update schemas
 */
const serviceBaseSchema = z.object({
  nombre: z
    .string()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(100, 'El nombre es muy largo'),

  descripcion: z.any().optional(),

  precio_base: z
    .number({ message: 'El precio base es requerido' })
    .min(0, 'El precio no puede ser negativo')
    .max(100000000, 'El precio es muy alto'),  // 100 million COP max

  precio_variable: z
    .boolean()
    .default(false),

  precio_minimo: z
    .number()
    .min(0, 'El precio minimo no puede ser negativo')
    .nullable()
    .optional(),

  precio_maximo: z
    .number()
    .min(0, 'El precio maximo no puede ser negativo')
    .nullable()
    .optional(),

  activo: z
    .boolean()
    .default(true),
})

/**
 * Service creation schema with refinements
 * Used by: Service form, createService server action
 */
export const serviceSchema = serviceBaseSchema
  .refine(
    data => !data.precio_variable || (data.precio_minimo !== null && data.precio_maximo !== null),
    { message: 'Servicios de precio variable requieren precio minimo y maximo', path: ['precio_variable'] }
  )
  .refine(
    data => !data.precio_variable || (data.precio_minimo! <= data.precio_base && data.precio_base <= data.precio_maximo!),
    { message: 'El precio base debe estar entre el minimo y maximo', path: ['precio_base'] }
  )

/**
 * Service update schema - partial fields without refinements
 * Refinements are checked at the server action level for updates
 */
export const serviceUpdateSchema = serviceBaseSchema.partial()

/**
 * TypeScript types inferred from schemas
 * Note: We use z.input for form types because .default() makes input/output types differ
 */
export type ServiceFormData = z.input<typeof serviceSchema>
export type ServiceFormOutput = z.output<typeof serviceSchema>
export type ServiceUpdateData = z.infer<typeof serviceUpdateSchema>

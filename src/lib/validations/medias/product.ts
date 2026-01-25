import { z } from 'zod'
import { PRODUCT_TYPES, PRODUCT_SIZES } from '@/types/medias/products'

/**
 * Schema for creating a new product
 * Note: tipo, talla, codigo are only editable on create
 */
export const mediasProductSchema = z.object({
  tipo: z.enum(PRODUCT_TYPES, { error: 'El tipo es requerido' }),
  talla: z.enum(PRODUCT_SIZES, { error: 'La talla es requerida' }),
  codigo: z
    .string()
    .min(1, 'El codigo es requerido')
    .max(20, 'El codigo es muy largo')
    .regex(/^[A-Za-z0-9-]+$/, 'El codigo solo puede contener letras, numeros y guiones'),
  precio: z
    .number({ message: 'El precio es requerido' })
    .min(1, 'El precio debe ser mayor a 0')
    .max(10000000, 'El precio es muy alto'),
  activo: z.boolean().default(true),
})

/**
 * Schema for updating an existing product
 * Only precio and activo can be updated (tipo, talla, codigo are immutable)
 */
export const mediasProductUpdateSchema = z.object({
  precio: z
    .number({ message: 'El precio es requerido' })
    .min(1, 'El precio debe ser mayor a 0')
    .max(10000000, 'El precio es muy alto')
    .optional(),
  activo: z.boolean().optional(),
})

/**
 * TypeScript types inferred from schemas
 */
export type MediasProductFormData = z.infer<typeof mediasProductSchema>
export type MediasProductUpdateData = z.infer<typeof mediasProductUpdateSchema>

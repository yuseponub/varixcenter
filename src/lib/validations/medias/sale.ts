import { z } from 'zod'
import { PAYMENT_METHODS } from '@/types/medias/sales'

/**
 * Sale item input schema
 */
export const mediasSaleItemSchema = z.object({
  product_id: z.string().uuid('ID de producto invalido'),
  quantity: z.number().int().min(1, 'La cantidad debe ser al menos 1'),
})

/**
 * Payment method schema with comprobante validation (VTA-05)
 * ANTI-FRAUD: Electronic payments require photo proof
 */
export const mediasSaleMethodSchema = z.object({
  metodo: z.enum(PAYMENT_METHODS, { error: 'Metodo de pago invalido' }),
  monto: z.number().positive('El monto debe ser positivo'),
  comprobante_path: z.string().nullable(),
})
.refine(
  data => data.metodo === 'efectivo' || (data.comprobante_path !== null && data.comprobante_path !== ''),
  { message: 'Los pagos electronicos requieren foto del comprobante', path: ['comprobante_path'] }
)

/**
 * Full sale creation schema
 * Used by: Sale form, createMediasSale server action
 */
export const mediasSaleSchema = z.object({
  items: z
    .array(mediasSaleItemSchema)
    .min(1, 'Debe seleccionar al menos un producto'),

  methods: z
    .array(mediasSaleMethodSchema)
    .min(1, 'Debe especificar metodo de pago'),

  patient_id: z.string().uuid().nullable().optional(),

  receptor_efectivo_id: z.string().uuid().nullable().optional(),
})

/**
 * Delete sale schema (admin only)
 * Requires 10+ character justification for audit trail
 */
export const deleteSaleSchema = z.object({
  sale_id: z.string().uuid('ID de venta invalido'),
  justificacion: z
    .string()
    .min(10, 'La justificacion debe tener al menos 10 caracteres')
    .max(500, 'La justificacion es muy larga'),
})

/**
 * TypeScript types inferred from schemas
 */
export type MediasSaleFormData = z.infer<typeof mediasSaleSchema>
export type MediasSaleItemInput = z.infer<typeof mediasSaleItemSchema>
export type MediasSaleMethodInput = z.infer<typeof mediasSaleMethodSchema>
export type DeleteSaleFormData = z.infer<typeof deleteSaleSchema>

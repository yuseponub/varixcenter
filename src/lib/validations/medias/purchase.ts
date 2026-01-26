import { z } from 'zod'
import { PURCHASE_STATES } from '@/types/medias/purchases'

/**
 * Purchase item input schema
 * Captures product_id, cantidad, and costo_unitario for margin analysis
 */
export const purchaseItemSchema = z.object({
  product_id: z.string().uuid('ID de producto invalido'),
  cantidad: z.number().int().min(1, 'La cantidad debe ser al menos 1'),
  costo_unitario: z
    .number()
    .min(0, 'El costo unitario no puede ser negativo')
    .max(100000000, 'El costo unitario es muy alto'),
})

/**
 * Full purchase creation schema
 * Used by: Purchase form, createPurchase server action
 *
 * COM-04: factura_path is REQUIRED (invoice photo/PDF)
 */
export const createPurchaseSchema = z.object({
  proveedor: z
    .string()
    .min(1, 'El proveedor es requerido')
    .max(200, 'El nombre del proveedor es muy largo'),

  fecha_factura: z
    .string()
    .min(1, 'La fecha de factura es requerida')
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha invalido'),

  numero_factura: z
    .string()
    .max(100, 'El numero de factura es muy largo')
    .nullable()
    .optional(),

  total: z
    .number({ error: 'El total es requerido' })
    .positive('El total debe ser mayor a 0')
    .max(1000000000, 'El total es muy alto'),

  items: z
    .array(purchaseItemSchema)
    .min(1, 'Debe agregar al menos un producto'),

  factura_path: z
    .string()
    .min(1, 'La foto/PDF de factura es obligatoria'),

  notas: z
    .string()
    .max(500, 'Las notas son muy largas')
    .nullable()
    .optional(),
})

/**
 * Confirm reception schema
 * Used by: confirmPurchaseReception server action
 * COM-05: Triggers stock increment
 */
export const confirmReceptionSchema = z.object({
  purchase_id: z.string().uuid('ID de compra invalido'),
})

/**
 * Cancel purchase schema (admin/medico only)
 * Requires 10+ character justification for audit trail
 * COM-06: Anulacion with justification
 */
export const cancelPurchaseSchema = z.object({
  purchase_id: z.string().uuid('ID de compra invalido'),
  justificacion: z
    .string()
    .min(10, 'La justificacion debe tener al menos 10 caracteres')
    .max(500, 'La justificacion es muy larga'),
})

/**
 * TypeScript types inferred from schemas
 */
export type PurchaseItemInput = z.infer<typeof purchaseItemSchema>
export type CreatePurchaseFormData = z.infer<typeof createPurchaseSchema>
export type ConfirmReceptionFormData = z.infer<typeof confirmReceptionSchema>
export type CancelPurchaseFormData = z.infer<typeof cancelPurchaseSchema>

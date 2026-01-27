import { z } from 'zod'
import { ADJUSTMENT_TYPES, STOCK_TYPES } from '@/types/medias/dashboard'

/**
 * Schema for inventory adjustment form
 * Used by: Adjustment form, createAdjustment server action
 *
 * Validates parameters for create_inventory_adjustment RPC:
 * - p_product_id: UUID of product to adjust
 * - p_cantidad: Positive integer quantity
 * - p_tipo: 'entrada' (add) or 'salida' (remove)
 * - p_stock_type: 'normal' or 'devoluciones'
 * - p_razon: Minimum 10 characters justification
 */
export const adjustmentSchema = z.object({
  product_id: z.string().uuid('ID de producto invalido'),
  cantidad: z.coerce.number().int().positive('La cantidad debe ser mayor a 0'),
  tipo: z.enum(ADJUSTMENT_TYPES, { error: 'Tipo de ajuste invalido' }),
  stock_type: z.enum(STOCK_TYPES, { error: 'Tipo de stock invalido' }),
  razon: z.string().min(10, 'La razon debe tener al menos 10 caracteres'),
})

/**
 * TypeScript type inferred from schema
 */
export type AdjustmentFormData = z.infer<typeof adjustmentSchema>

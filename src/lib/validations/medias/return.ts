import { z } from 'zod'
import { REEMBOLSO_METODOS } from '@/types/medias/returns'

/**
 * Create return request schema
 * Used by: Return form, createMediasReturn server action
 */
export const createReturnSchema = z.object({
  sale_id: z.string().uuid('ID de venta invalido'),
  sale_item_id: z.string().uuid('ID de item invalido'),
  cantidad: z
    .number()
    .int('Cantidad debe ser un numero entero')
    .min(1, 'La cantidad debe ser al menos 1'),
  motivo: z
    .string()
    .min(10, 'El motivo debe tener al menos 10 caracteres')
    .max(500, 'El motivo es muy largo'),
  metodo_reembolso: z.enum(REEMBOLSO_METODOS, {
    error: 'Metodo de reembolso invalido',
  }),
  foto_path: z.string().nullable().optional(),
})

/**
 * Approve return schema (admin/medico only)
 */
export const approveReturnSchema = z.object({
  return_id: z.string().uuid('ID de devolucion invalido'),
  notas: z
    .string()
    .max(500, 'Las notas son muy largas')
    .nullable()
    .optional(),
})

/**
 * Reject return schema (admin/medico only)
 */
export const rejectReturnSchema = z.object({
  return_id: z.string().uuid('ID de devolucion invalido'),
  notas: z
    .string()
    .max(500, 'Las notas son muy largas')
    .nullable()
    .optional(),
})

/**
 * TypeScript types inferred from schemas
 */
export type CreateReturnFormData = z.infer<typeof createReturnSchema>
export type ApproveReturnFormData = z.infer<typeof approveReturnSchema>
export type RejectReturnFormData = z.infer<typeof rejectReturnSchema>

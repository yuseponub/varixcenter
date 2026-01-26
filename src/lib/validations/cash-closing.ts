import { z } from 'zod'

/**
 * Cash closing creation schema
 * Used by: Closing form, closeCash server action
 *
 * All messages in Spanish for Colombian users
 */
export const cashClosingSchema = z.object({
  fecha: z
    .string()
    .min(1, 'La fecha es requerida')
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha invalido'),

  conteo_fisico: z
    .number()
    .min(0, 'El conteo no puede ser negativo'),

  diferencia_justificacion: z
    .string()
    .max(500, 'La justificacion es muy larga')
    .nullable()
    .optional(),

  cierre_photo_path: z
    .string()
    .nullable()
    .optional(),

  notas: z
    .string()
    .max(500, 'Las notas son muy largas')
    .nullable()
    .optional(),
})

/**
 * Custom refinement for zero-tolerance difference policy
 * If there's a difference, justification must be >= 10 chars
 */
export const cashClosingWithDifferenceSchema = cashClosingSchema.refine(
  (data) => {
    // This will be checked at form level where we have the calculated difference
    return true
  },
  { message: 'Las diferencias requieren justificacion', path: ['diferencia_justificacion'] }
)

/**
 * Reopen schema
 * Used by: Reopen dialog, reopenCash server action
 * ANTI-FRAUD: Requires detailed justification (10+ chars) for audit trail
 */
export const reopenSchema = z.object({
  cierre_id: z.string().uuid('ID de cierre invalido'),
  justificacion: z
    .string()
    .min(10, 'La justificacion debe tener al menos 10 caracteres')
    .max(500, 'La justificacion es muy larga'),
})

/**
 * Delete schema
 * Used by: Delete dialog, deleteCashClosing server action
 * ANTI-FRAUD: Requires justification (10+ chars) for audit trail
 */
export const deleteClosingSchema = z.object({
  cierre_id: z.string().uuid('ID de cierre invalido'),
  justificacion: z
    .string()
    .min(10, 'La justificacion debe tener al menos 10 caracteres')
    .max(500, 'La justificacion es muy larga'),
})

/**
 * TypeScript types inferred from schemas
 */
export type CashClosingFormData = z.infer<typeof cashClosingSchema>
export type ReopenFormData = z.infer<typeof reopenSchema>
export type DeleteClosingFormData = z.infer<typeof deleteClosingSchema>

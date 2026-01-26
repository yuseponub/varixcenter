import { z } from 'zod'

/**
 * Medias cash closing creation schema
 * Used by: Closing form, createMediasCierre server action
 *
 * All messages in Spanish for Colombian users
 *
 * NOTE: CIE-04 - Zero tolerance for differences (no $10k threshold like clinic)
 */
export const mediasCierreSchema = z.object({
  fecha: z
    .string()
    .min(1, { error: 'La fecha es requerida' })
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Formato de fecha invalido' }),

  conteo_fisico: z
    .number()
    .min(0, { error: 'El conteo no puede ser negativo' }),

  diferencia_justificacion: z
    .string()
    .max(500, { message: 'La justificacion es muy larga' })
    .nullable()
    .optional(),

  // Photo is optional for medias
  cierre_photo_path: z
    .string()
    .nullable()
    .optional(),

  notas: z
    .string()
    .max(500, { error: 'Las notas son muy largas' })
    .nullable()
    .optional(),
})

/**
 * Schema with zero-tolerance difference validation
 * CRITICAL: ANY difference requires justification (CIE-04)
 */
export const mediasCierreWithDifferenceSchema = (diferencia: number) =>
  mediasCierreSchema.refine(
    (data) => {
      // If there's any difference, justification must be >= 10 chars
      if (diferencia !== 0) {
        return (
          data.diferencia_justificacion !== null &&
          data.diferencia_justificacion !== undefined &&
          data.diferencia_justificacion.trim().length >= 10
        )
      }
      return true
    },
    {
      message: 'Las diferencias requieren justificacion de al menos 10 caracteres',
      path: ['diferencia_justificacion'],
    }
  )

/**
 * Reopen schema
 * Used by: Reopen dialog, reopenMediasCierre server action
 * ANTI-FRAUD: Requires detailed justification (10+ chars) for audit trail
 * CIE-07: Only Admin can reopen
 */
export const reopenMediasCierreSchema = z.object({
  cierre_id: z.string().uuid({ error: 'ID de cierre invalido' }),
  justificacion: z
    .string()
    .min(10, { error: 'La justificacion debe tener al menos 10 caracteres' })
    .max(500, { error: 'La justificacion es muy larga' }),
})

/**
 * TypeScript types inferred from schemas
 */
export type MediasCierreFormData = z.infer<typeof mediasCierreSchema>
export type ReopenMediasCierreFormData = z.infer<typeof reopenMediasCierreSchema>

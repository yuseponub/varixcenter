import { z } from 'zod'
import { ALERT_SEVERIDADES, ALERT_TIPOS } from '@/types/alerts'

/**
 * Alert resolution schema
 * Used by: Alert resolution dialog, resolveAlert server action
 *
 * All messages in Spanish for Colombian users
 */
export const resolveAlertSchema = z.object({
  alertId: z.string().uuid('ID de alerta invalido'),

  notas: z
    .string()
    .min(1, { message: 'Las notas son requeridas' })
    .max(500, { message: 'Las notas son muy largas' }),
})

/**
 * Alert filter schema for query parameters
 * Used by: Alert list filtering, URL query params
 */
export const alertFilterSchema = z.object({
  resuelta: z.boolean().optional(),

  tipo: z.enum(ALERT_TIPOS, {
    message: 'Tipo de alerta invalido',
  }).optional(),

  severidad: z.enum(ALERT_SEVERIDADES, {
    message: 'Severidad de alerta invalida',
  }).optional(),
})

/**
 * TypeScript types inferred from schemas
 */
export type ResolveAlertInput = z.infer<typeof resolveAlertSchema>
export type AlertFilterInput = z.infer<typeof alertFilterSchema>

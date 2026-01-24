import { z } from 'zod'

/**
 * Payment item schema
 * Represents a single service line item in a payment
 */
export const paymentItemSchema = z.object({
  service_id: z.string().uuid('ID de servicio invalido'),
  service_name: z.string().min(1, 'Nombre de servicio requerido'),
  unit_price: z.number().min(0, 'El precio debe ser positivo o cero'),
  quantity: z.number().int().positive('La cantidad debe ser positiva'),
})

/**
 * Payment method schema with comprobante validation
 * ANTI-FRAUD: Electronic payments (tarjeta, transferencia, nequi) require photo proof
 */
export const paymentMethodSchema = z.object({
  metodo: z.enum(['efectivo', 'tarjeta', 'transferencia', 'nequi'], {
    error: 'Metodo de pago invalido'
  }),
  monto: z.number().positive('El monto debe ser positivo'),
  comprobante_path: z.string().nullable(),
})
.refine(
  data => data.metodo === 'efectivo' || (data.comprobante_path !== null && data.comprobante_path !== ''),
  { message: 'Los pagos electronicos requieren foto del comprobante', path: ['comprobante_path'] }
)

/**
 * Payment creation schema
 * Used by: Payment form, createPayment server action
 *
 * All messages in Spanish for Colombian users
 */
export const paymentSchema = z.object({
  patient_id: z.string().uuid('ID de paciente invalido'),

  items: z
    .array(paymentItemSchema)
    .min(1, 'Debe incluir al menos un servicio'),

  methods: z
    .array(paymentMethodSchema)
    .min(1, 'Debe incluir al menos un metodo de pago'),

  descuento: z
    .number()
    .min(0, 'El descuento no puede ser negativo')
    .default(0),

  descuento_justificacion: z
    .string()
    .max(500, 'La justificacion es muy larga')
    .nullable()
    .optional(),
})
.refine(
  data => data.descuento === 0 || (data.descuento_justificacion && data.descuento_justificacion.length >= 5),
  { message: 'Los descuentos requieren justificacion (minimo 5 caracteres)', path: ['descuento_justificacion'] }
)

/**
 * Anulacion schema
 * Used by: Anular payment action
 * ANTI-FRAUD: Requires detailed justification (10+ chars) for audit trail
 */
export const anulacionSchema = z.object({
  payment_id: z.string().uuid('ID de pago invalido'),
  justificacion: z
    .string()
    .min(10, 'La justificacion debe tener al menos 10 caracteres')
    .max(500, 'La justificacion es muy larga'),
})

/**
 * TypeScript types inferred from schemas
 */
export type PaymentFormData = z.infer<typeof paymentSchema>
export type PaymentItemFormData = z.infer<typeof paymentItemSchema>
export type PaymentMethodFormData = z.infer<typeof paymentMethodSchema>
export type AnulacionFormData = z.infer<typeof anulacionSchema>

import { z } from 'zod'
import { CEAP_CLASSIFICATIONS, MEDICAL_RECORD_STATUSES } from '@/types/medical-records'

/**
 * Medical Record Validation Schemas
 *
 * Used by: Medical record forms, server actions
 * All messages in Spanish for Colombian users
 */

// ============================================
// JSONB FIELD SCHEMAS
// ============================================

/**
 * Sintomas (symptoms) schema
 */
export const symptomsSchema = z.object({
  dolor: z.boolean().optional(),
  pesadez: z.boolean().optional(),
  calambres: z.boolean().optional(),
  prurito: z.boolean().optional(),
  ardor: z.boolean().optional(),
  cansancio: z.boolean().optional(),
  hinchazon: z.boolean().optional(),
  otros: z.string().max(500, 'Maximo 500 caracteres').optional(),
  tiempo_evolucion: z.string().max(100, 'Maximo 100 caracteres').optional(),
})

/**
 * Signos (signs) schema
 */
export const signsSchema = z.object({
  varices: z.boolean().optional(),
  telangiectasias: z.boolean().optional(),
  edema: z.boolean().optional(),
  hiperpigmentacion: z.boolean().optional(),
  ulcera_activa: z.boolean().optional(),
  ulcera_cicatrizada: z.boolean().optional(),
  lipodermatoesclerosis: z.boolean().optional(),
  otros: z.string().max(500, 'Maximo 500 caracteres').optional(),
})

/**
 * Inicio relacionado (onset) schema
 */
export const onsetSchema = z.object({
  embarazo: z.boolean().optional(),
  anticonceptivos: z.boolean().optional(),
  menopausia: z.boolean().optional(),
  trabajo_pie: z.boolean().optional(),
  trabajo_sentado: z.boolean().optional(),
  trauma: z.boolean().optional(),
  cirugia_previa: z.boolean().optional(),
  otros: z.string().max(500, 'Maximo 500 caracteres').optional(),
})

/**
 * Antecedentes (history) schema
 */
export const historySchema = z.object({
  hipertension: z.boolean().optional(),
  diabetes: z.boolean().optional(),
  cardiopatia: z.boolean().optional(),
  trombosis_venosa: z.boolean().optional(),
  alergias: z.boolean().optional(),
  cirugia_vascular: z.boolean().optional(),
  obesidad: z.boolean().optional(),
  tabaquismo: z.boolean().optional(),
  otros: z.string().max(500, 'Maximo 500 caracteres').optional(),
  observaciones: z.string().max(1000, 'Maximo 1000 caracteres').optional(),
})

/**
 * Laboratorio vascular schema
 */
export const vascularLabSchema = z.object({
  doppler_venoso: z.boolean().optional(),
  doppler_arterial: z.boolean().optional(),
  fotopletismografia: z.boolean().optional(),
  pletismografia: z.boolean().optional(),
  otros: z.string().max(500, 'Maximo 500 caracteres').optional(),
  hallazgos: z.string().max(2000, 'Maximo 2000 caracteres').optional(),
})

// ============================================
// ENUM SCHEMAS
// ============================================

/**
 * CEAP classification schema (nullable)
 */
export const ceapClassificationSchema = z
  .enum(CEAP_CLASSIFICATIONS)
  .nullable()
  .optional()

/**
 * Medical record status schema
 */
export const medicalRecordStatusSchema = z.enum(MEDICAL_RECORD_STATUSES)

// ============================================
// MAIN SCHEMAS
// ============================================

/**
 * Create medical record schema
 * Only patient_id, appointment_id, and doctor_id are required
 */
export const createMedicalRecordSchema = z.object({
  patient_id: z.string().uuid('ID de paciente invalido'),
  appointment_id: z.string().uuid('ID de cita invalido'),
  doctor_id: z.string().uuid('ID de medico invalido'),
  sintomas: symptomsSchema.optional().default({}),
  signos: signsSchema.optional().default({}),
  inicio_relacionado: onsetSchema.optional().default({}),
  antecedentes: historySchema.optional().default({}),
  laboratorio_vascular: vascularLabSchema.optional().default({}),
  diagnostico: z.string().max(5000, 'Maximo 5000 caracteres').nullable().optional(),
  ceap_pierna_izquierda: ceapClassificationSchema,
  ceap_pierna_derecha: ceapClassificationSchema,
  tratamiento_ids: z.array(z.string().uuid()).optional().default([]),
  diagrama_piernas: z.string().nullable().optional(),
  estado: medicalRecordStatusSchema.optional().default('borrador'),
})

/**
 * Update medical record schema
 * All fields optional for partial updates
 */
export const updateMedicalRecordSchema = z.object({
  sintomas: symptomsSchema.optional(),
  signos: signsSchema.optional(),
  inicio_relacionado: onsetSchema.optional(),
  antecedentes: historySchema.optional(),
  laboratorio_vascular: vascularLabSchema.optional(),
  diagnostico: z.string().max(5000, 'Maximo 5000 caracteres').nullable().optional(),
  ceap_pierna_izquierda: ceapClassificationSchema,
  ceap_pierna_derecha: ceapClassificationSchema,
  tratamiento_ids: z.array(z.string().uuid()).optional(),
  diagrama_piernas: z.string().nullable().optional(),
  estado: medicalRecordStatusSchema.optional(),
})

/**
 * Enfermera-only fields schema
 * Used when role is enfermera to validate only allowed fields
 */
export const enfermeraFieldsSchema = z.object({
  sintomas: symptomsSchema.optional(),
  signos: signsSchema.optional(),
  inicio_relacionado: onsetSchema.optional(),
  antecedentes: historySchema.optional(),
})

// ============================================
// QUOTATION SCHEMAS
// ============================================

/**
 * Quotation item schema
 */
export const quotationItemSchema = z.object({
  service_id: z.string().uuid('ID de servicio invalido'),
  nombre: z.string().min(1, 'El nombre es requerido'),
  precio: z.number().min(0, 'El precio no puede ser negativo'),
  cantidad: z.number().int().min(1, 'La cantidad minima es 1'),
})

/**
 * Create quotation schema
 */
export const createQuotationSchema = z.object({
  medical_record_id: z.string().uuid('ID de historia invalido'),
  items: z.array(quotationItemSchema).min(1, 'Debe incluir al menos un servicio'),
  notas: z.string().max(1000, 'Maximo 1000 caracteres').nullable().optional(),
})

/**
 * Update quotation schema
 */
export const updateQuotationSchema = z.object({
  items: z.array(quotationItemSchema).min(1, 'Debe incluir al menos un servicio').optional(),
  notas: z.string().max(1000, 'Maximo 1000 caracteres').nullable().optional(),
})

// ============================================
// PROGRESS NOTE SCHEMAS
// ============================================

/**
 * Create progress note schema
 */
export const createProgressNoteSchema = z.object({
  medical_record_id: z.string().uuid('ID de historia invalido'),
  appointment_id: z.string().uuid('ID de cita invalido').nullable().optional(),
  nota: z
    .string()
    .min(10, 'La nota debe tener al menos 10 caracteres')
    .max(5000, 'Maximo 5000 caracteres'),
})

// ============================================
// TYPE EXPORTS
// ============================================

export type SymptomsFormData = z.infer<typeof symptomsSchema>
export type SignsFormData = z.infer<typeof signsSchema>
export type OnsetFormData = z.infer<typeof onsetSchema>
export type HistoryFormData = z.infer<typeof historySchema>
export type VascularLabFormData = z.infer<typeof vascularLabSchema>
export type CreateMedicalRecordFormData = z.infer<typeof createMedicalRecordSchema>
export type UpdateMedicalRecordFormData = z.infer<typeof updateMedicalRecordSchema>
export type EnfermeraFieldsFormData = z.infer<typeof enfermeraFieldsSchema>
export type QuotationItemFormData = z.infer<typeof quotationItemSchema>
export type CreateQuotationFormData = z.infer<typeof createQuotationSchema>
export type UpdateQuotationFormData = z.infer<typeof updateQuotationSchema>
export type CreateProgressNoteFormData = z.infer<typeof createProgressNoteSchema>

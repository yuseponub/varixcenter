/**
 * Medical Records (Historias Clinicas) Type Definitions
 *
 * Types matching the medical_records database schema (018_medical_records.sql)
 * Used by: Medical record forms, patient history views, quotation generation
 */

// ============================================
// CEAP CLASSIFICATION
// ============================================

/**
 * CEAP Clinical Classification values (C0-C6)
 * Uses const assertion for literal type inference
 */
export const CEAP_CLASSIFICATIONS = ['C0', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6'] as const

/**
 * CEAP Classification type derived from array
 */
export type CeapClassification = (typeof CEAP_CLASSIFICATIONS)[number]

/**
 * Type guard for CEAP classification
 */
export function isValidCeapClassification(value: unknown): value is CeapClassification {
  return (
    typeof value === 'string' &&
    CEAP_CLASSIFICATIONS.includes(value as CeapClassification)
  )
}

/**
 * Human-readable labels for CEAP classification (Spanish)
 */
export const CEAP_LABELS: Record<CeapClassification, string> = {
  C0: 'C0 - Sin signos visibles',
  C1: 'C1 - Telangiectasias/Reticulares',
  C2: 'C2 - Varices',
  C3: 'C3 - Edema',
  C4: 'C4 - Cambios cutaneos',
  C5: 'C5 - Ulcera cicatrizada',
  C6: 'C6 - Ulcera activa',
}

/**
 * Short labels for compact display
 */
export const CEAP_SHORT_LABELS: Record<CeapClassification, string> = {
  C0: 'Sin signos',
  C1: 'Telangiectasias',
  C2: 'Varices',
  C3: 'Edema',
  C4: 'Cambios piel',
  C5: 'Ulcera cicatrizada',
  C6: 'Ulcera activa',
}

/**
 * Badge variants for CEAP severity
 */
export const CEAP_VARIANTS: Record<CeapClassification, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  C0: 'outline',
  C1: 'secondary',
  C2: 'secondary',
  C3: 'default',
  C4: 'default',
  C5: 'destructive',
  C6: 'destructive',
}

// ============================================
// MEDICAL RECORD STATUS
// ============================================

/**
 * Medical record status values
 */
export const MEDICAL_RECORD_STATUSES = ['borrador', 'completado'] as const

/**
 * Medical record status type
 */
export type MedicalRecordStatus = (typeof MEDICAL_RECORD_STATUSES)[number]

/**
 * Type guard for medical record status
 */
export function isValidMedicalRecordStatus(value: unknown): value is MedicalRecordStatus {
  return (
    typeof value === 'string' &&
    MEDICAL_RECORD_STATUSES.includes(value as MedicalRecordStatus)
  )
}

/**
 * Human-readable labels for status (Spanish)
 */
export const MEDICAL_RECORD_STATUS_LABELS: Record<MedicalRecordStatus, string> = {
  borrador: 'Borrador',
  completado: 'Completado',
}

/**
 * Badge variants for status
 */
export const MEDICAL_RECORD_STATUS_VARIANTS: Record<MedicalRecordStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  borrador: 'secondary',
  completado: 'default',
}

// ============================================
// JSONB FIELD INTERFACES
// ============================================

/**
 * Sintomas (symptoms) - Motivo de Consulta
 * Editable by enfermera
 */
export interface MedicalRecordSymptoms {
  dolor?: boolean
  pesadez?: boolean
  calambres?: boolean
  prurito?: boolean
  ardor?: boolean
  cansancio?: boolean
  hinchazon?: boolean
  otros?: string
  tiempo_evolucion?: string
}

/**
 * Labels for symptoms checkboxes
 */
export const SYMPTOM_LABELS: Record<keyof Omit<MedicalRecordSymptoms, 'otros' | 'tiempo_evolucion'>, string> = {
  dolor: 'Dolor',
  pesadez: 'Pesadez',
  calambres: 'Calambres',
  prurito: 'Prurito (picazon)',
  ardor: 'Ardor',
  cansancio: 'Cansancio',
  hinchazon: 'Hinchazon',
}

/**
 * Signos (signs) - Examen Fisico
 * Editable by enfermera
 */
export interface MedicalRecordSigns {
  varices?: boolean
  telangiectasias?: boolean
  edema?: boolean
  hiperpigmentacion?: boolean
  ulcera_activa?: boolean
  ulcera_cicatrizada?: boolean
  lipodermatoesclerosis?: boolean
  otros?: string
}

/**
 * Labels for signs checkboxes
 */
export const SIGN_LABELS: Record<keyof Omit<MedicalRecordSigns, 'otros'>, string> = {
  varices: 'Varices',
  telangiectasias: 'Telangiectasias',
  edema: 'Edema',
  hiperpigmentacion: 'Hiperpigmentacion',
  ulcera_activa: 'Ulcera activa',
  ulcera_cicatrizada: 'Ulcera cicatrizada',
  lipodermatoesclerosis: 'Lipodermatoesclerosis',
}

/**
 * Inicio relacionado con (onset factors)
 * Editable by enfermera
 */
export interface MedicalRecordOnset {
  embarazo?: boolean
  anticonceptivos?: boolean
  menopausia?: boolean
  trabajo_pie?: boolean
  trabajo_sentado?: boolean
  trauma?: boolean
  cirugia_previa?: boolean
  otros?: string
}

/**
 * Labels for onset checkboxes
 */
export const ONSET_LABELS: Record<keyof Omit<MedicalRecordOnset, 'otros'>, string> = {
  embarazo: 'Embarazo',
  anticonceptivos: 'Anticonceptivos',
  menopausia: 'Menopausia',
  trabajo_pie: 'Trabajo de pie',
  trabajo_sentado: 'Trabajo sentado',
  trauma: 'Trauma',
  cirugia_previa: 'Cirugia previa',
}

/**
 * Antecedentes patologicos (medical history)
 * Editable by enfermera
 */
export interface MedicalRecordHistory {
  hipertension?: boolean
  diabetes?: boolean
  cardiopatia?: boolean
  trombosis_venosa?: boolean
  alergias?: boolean
  cirugia_vascular?: boolean
  obesidad?: boolean
  tabaquismo?: boolean
  otros?: string
  observaciones?: string
}

/**
 * Labels for history checkboxes
 */
export const HISTORY_LABELS: Record<keyof Omit<MedicalRecordHistory, 'otros' | 'observaciones'>, string> = {
  hipertension: 'Hipertension',
  diabetes: 'Diabetes',
  cardiopatia: 'Cardiopatia',
  trombosis_venosa: 'Trombosis venosa',
  alergias: 'Alergias',
  cirugia_vascular: 'Cirugia vascular previa',
  obesidad: 'Obesidad',
  tabaquismo: 'Tabaquismo',
}

/**
 * Laboratorio vascular (vascular lab studies)
 * Medico only
 */
export interface MedicalRecordVascularLab {
  doppler_venoso?: boolean
  doppler_arterial?: boolean
  fotopletismografia?: boolean
  pletismografia?: boolean
  otros?: string
  hallazgos?: string
}

/**
 * Labels for vascular lab checkboxes
 */
export const VASCULAR_LAB_LABELS: Record<keyof Omit<MedicalRecordVascularLab, 'otros' | 'hallazgos'>, string> = {
  doppler_venoso: 'Doppler venoso',
  doppler_arterial: 'Doppler arterial',
  fotopletismografia: 'Fotopletismografia',
  pletismografia: 'Pletismografia',
}

// ============================================
// MAIN MEDICAL RECORD INTERFACE
// ============================================

/**
 * Base medical record type from database
 */
export interface MedicalRecord {
  id: string
  patient_id: string
  appointment_id: string
  doctor_id: string
  sintomas: MedicalRecordSymptoms
  signos: MedicalRecordSigns
  inicio_relacionado: MedicalRecordOnset
  antecedentes: MedicalRecordHistory
  laboratorio_vascular: MedicalRecordVascularLab
  diagnostico: string | null
  ceap_pierna_izquierda: CeapClassification | null
  ceap_pierna_derecha: CeapClassification | null
  tratamiento_ids: string[]
  diagrama_piernas: string | null // JSON string with fabric.js objects
  estado: MedicalRecordStatus
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

/**
 * Medical record with related data for display
 */
export interface MedicalRecordWithDetails extends MedicalRecord {
  patient?: {
    id: string
    nombre: string
    apellido: string
    cedula: string
    fecha_nacimiento: string | null
    celular: string | null
    email: string | null
    direccion: string | null
  }
  appointment?: {
    id: string
    fecha_hora_inicio: string
    fecha_hora_fin: string
    estado: string
    motivo_consulta: string | null
  }
  doctor?: {
    id: string
    email: string
    nombre?: string
    apellido?: string
  }
  treatments?: {
    id: string
    nombre: string
    precio_base: number
    precio_variable: boolean
    precio_minimo: number | null
    precio_maximo: number | null
  }[]
  created_by_user?: {
    id: string
    email?: string
    nombre?: string
    apellido?: string
    role?: string
  }
}

/**
 * Input type for creating a medical record
 */
export interface CreateMedicalRecordInput {
  patient_id: string
  appointment_id: string
  doctor_id: string
  sintomas?: MedicalRecordSymptoms
  signos?: MedicalRecordSigns
  inicio_relacionado?: MedicalRecordOnset
  antecedentes?: MedicalRecordHistory
  laboratorio_vascular?: MedicalRecordVascularLab
  diagnostico?: string
  ceap_pierna_izquierda?: CeapClassification | null
  ceap_pierna_derecha?: CeapClassification | null
  tratamiento_ids?: string[]
  estado?: MedicalRecordStatus
}

/**
 * Input type for updating a medical record
 */
export interface UpdateMedicalRecordInput {
  sintomas?: MedicalRecordSymptoms
  signos?: MedicalRecordSigns
  inicio_relacionado?: MedicalRecordOnset
  antecedentes?: MedicalRecordHistory
  laboratorio_vascular?: MedicalRecordVascularLab
  diagnostico?: string | null
  ceap_pierna_izquierda?: CeapClassification | null
  ceap_pierna_derecha?: CeapClassification | null
  tratamiento_ids?: string[]
  estado?: MedicalRecordStatus
}

// ============================================
// QUOTATION INTERFACES
// ============================================

/**
 * Single item in a quotation
 */
export interface QuotationItem {
  id?: string // unique line item id
  service_id: string
  nombre: string
  precio: number
  cantidad: number
  nota?: string // e.g., "Pierna izquierda"
  subtotal?: number // precio * cantidad (calculated)
}

/**
 * Quotation from database
 */
export interface Quotation {
  id: string
  medical_record_id: string
  items: QuotationItem[]
  total: number
  notas: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

/**
 * Quotation with related data
 */
export interface QuotationWithDetails extends Quotation {
  medical_record?: {
    id: string
    patient_id: string
  }
  patient?: {
    nombre: string
    apellido: string
    cedula: string
  }
}

/**
 * Input for creating a quotation
 */
export interface CreateQuotationInput {
  medical_record_id: string
  items: QuotationItem[]
  notas?: string
}

// ============================================
// PROGRESS NOTE INTERFACES
// ============================================

/**
 * Progress note from database
 */
export interface ProgressNote {
  id: string
  medical_record_id: string
  appointment_id: string | null
  nota: string
  created_by: string
  created_at: string
}

/**
 * Progress note with related data
 */
export interface ProgressNoteWithDetails extends ProgressNote {
  created_by_user?: {
    email: string
    nombre?: string
    apellido?: string
  }
  appointment?: {
    fecha_hora_inicio: string
    motivo_consulta: string | null
  }
}

/**
 * Input for creating a progress note
 */
export interface CreateProgressNoteInput {
  medical_record_id: string
  appointment_id?: string
  nota: string
}

// ============================================
// FIELDS BY ROLE
// ============================================

/**
 * Fields that enfermera can edit
 */
export const ENFERMERA_EDITABLE_FIELDS = [
  'sintomas',
  'signos',
  'inicio_relacionado',
  'antecedentes',
] as const

/**
 * Fields that only medico can edit
 */
export const MEDICO_ONLY_FIELDS = [
  'laboratorio_vascular',
  'diagnostico',
  'ceap_pierna_izquierda',
  'ceap_pierna_derecha',
  'tratamiento_ids',
  'estado',
] as const

# Phase 6: Medical Records - Research

**Researched:** 2026-01-24
**Domain:** Medical record forms, CEAP classification, quotation generation, role-based section permissions
**Confidence:** HIGH

## Summary

This research covers implementing a digital medical record (historia clinica) system for a phlebology clinic. The phase requires: (1) a long continuous form with multiple sections based on the existing Varix Center paper format, (2) optional CEAP clinical classification (C0-C6) by leg, (3) automatic quotation generation from the selected treatment plan, (4) role-based editing permissions where nurses can edit general sections and doctors can edit all sections, and (5) draft saving capability.

The core implementation strategy uses a single `medical_records` table with JSONB columns for flexible section data, plus a `progress_notes` table for evolution notes tied to appointments. The form architecture uses react-hook-form with a long continuous scroll pattern (matching the CONTEXT.md decision against tabs/wizards), with sections visually separated by Cards. CEAP classification is implemented as optional dropdown selects for left/right legs. Quotation generation leverages the existing services catalog and creates a preview that can be converted to a payment.

Key architectural decisions: JSONB columns for symptoms, signs, antecedents, and treatments (allows flexible checkbox data storage without rigid schemas); role-based section visibility enforced at both UI and database levels; medical_record created from appointment context (appointment_id required); quotation stored as a separate but linked entity for potential future payment conversion.

**Primary recommendation:** Use JSONB columns for checkbox-heavy sections to avoid complex relational schemas, implement role-based section editing through a combination of RLS policies and UI-level field disabling, and generate quotations as linked records that can be converted to payments.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react-hook-form | ^7.71.1 | Complex form management | Already in project, handles long forms efficiently with minimal re-renders |
| zod | ^4.3.6 | Schema validation | Already in project, validates complex nested form data |
| @hookform/resolvers | ^5.2.2 | Zod + react-hook-form integration | Already in project |
| @supabase/supabase-js | ^2.91.1 | Database operations | Already in project, handles JSONB columns natively |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @radix-ui/react-checkbox | ^1.3.3 | Checkbox components | Multiple symptom/sign checkboxes (already in project) |
| @radix-ui/react-select | ^2.2.6 | Select dropdowns | CEAP classification selects (already in project) |
| sonner | ^2.0.7 | Toast notifications | Save/draft feedback (already in project) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| JSONB for checkboxes | Normalized junction tables | JSONB is simpler for mostly-static checkbox lists; junction tables needed if checkboxes change frequently |
| Single long form | Multi-step wizard | CONTEXT.md explicitly chose continuous scroll; wizard adds navigation complexity |
| Separate quotation table | Embedded in medical record | Separate table allows quotation lifecycle (draft/sent/converted) |

**Installation:**
```bash
# No new packages needed - all dependencies already installed
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/(protected)/historias/
│   ├── page.tsx                    # Medical records list (by patient)
│   ├── actions.ts                  # Server actions for CRUD
│   ├── nueva/
│   │   └── page.tsx                # New record form (requires appointment_id)
│   └── [id]/
│       ├── page.tsx                # View medical record
│       ├── editar/
│       │   └── page.tsx            # Edit medical record form
│       └── cotizacion/
│           ├── page.tsx            # View/edit quotation
│           └── actions.ts          # Quotation server actions
├── components/medical-records/
│   ├── medical-record-form.tsx     # Main form component (all sections)
│   ├── section-patient-data.tsx    # Section 1: Patient data (from registration)
│   ├── section-symptoms.tsx        # Section 2: MC/EA symptoms + signs
│   ├── section-onset.tsx           # Section 3: Inicio relacionado
│   ├── section-history.tsx         # Section 4: Antecedentes patologicos
│   ├── section-diagnosis.tsx       # Section 5: Diagnostico (texto libre)
│   ├── section-ceap.tsx            # Section 6: CEAP classification (optional)
│   ├── section-vascular-lab.tsx    # Section 7: Laboratorio vascular
│   ├── section-treatment.tsx       # Section 8: Programa terapeutico
│   ├── quotation-panel.tsx         # Section 9: Quotation (separate panel/tab)
│   └── checkbox-group.tsx          # Reusable checkbox group component
├── lib/
│   ├── validations/
│   │   └── medical-record.ts       # Zod schemas for medical record
│   └── queries/
│       └── medical-records.ts      # Medical record queries
├── types/
│   └── medical-records.ts          # TypeScript types for medical records
└── supabase/
    └── migrations/
        └── 018_medical_records.sql # Tables + RLS + triggers
```

### Pattern 1: JSONB for Checkbox-Heavy Sections
**What:** Store checkbox selections as JSONB arrays/objects instead of normalized tables
**When to use:** Sections with many checkboxes where the options are mostly static
**Example:**
```typescript
// Source: PostgreSQL JSONB documentation + project requirements
// types/medical-records.ts

interface MedicalRecordSymptoms {
  dolor: boolean
  dolor_ciclo: boolean
  cansancio: boolean
  calambres: boolean
  adormecimiento: boolean
  prurito: boolean
  ardor: boolean
  tiempo_evolucion: string | null  // Free text
}

interface MedicalRecordSigns {
  lipodermatoesclerosis: boolean
  edema: boolean
  ulcera: boolean
  eczema: boolean
}

interface MedicalRecordOnset {
  adolescencia: boolean
  embarazo: boolean
  planificacion: boolean
  trauma: boolean
  posquirurgico: boolean
}

interface MedicalRecordHistory {
  familiares: boolean
  familiares_obs: string | null
  hepatitis: boolean
  hepatitis_obs: string | null
  hospitalizacion: boolean
  hospitalizacion_obs: string | null
  ginecologia: boolean
  ginecologia_obs: string | null
  diabetes: boolean
  diabetes_obs: string | null
  hipertension: boolean
  hipertension_obs: string | null
  alergia: boolean
  alergia_obs: string | null
  cirugia: boolean
  cirugia_obs: string | null
  transfusiones: boolean
  transfusiones_obs: string | null
  farmacologico: boolean
  farmacologico_obs: string | null
}

// Stored as JSONB in database
interface MedicalRecord {
  id: string
  patient_id: string
  appointment_id: string
  doctor_id: string

  // JSONB columns for flexible data
  sintomas: MedicalRecordSymptoms
  signos: MedicalRecordSigns
  inicio_relacionado: MedicalRecordOnset
  antecedentes: MedicalRecordHistory

  // Text fields
  diagnostico: string | null

  // CEAP Classification (optional)
  ceap_pierna_izquierda: 'C0' | 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6' | null
  ceap_pierna_derecha: 'C0' | 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6' | null

  // Laboratorio vascular (JSONB)
  laboratorio_vascular: {
    mapeo_dupplex: boolean
    escaneo_dupplex: boolean
    fotopletismografia: boolean
  }

  // Tratamiento (array of service IDs)
  tratamiento_ids: string[]

  // Status
  estado: 'borrador' | 'completado'

  // Audit
  created_by: string
  created_at: string
  updated_at: string
}
```

### Pattern 2: Long Form with Section Components
**What:** Split form into section components, all rendered in continuous scroll
**When to use:** CONTEXT.md specifies continuous scroll, not tabs/wizard
**Example:**
```typescript
// Source: React Hook Form advanced patterns + existing project patterns
// components/medical-records/medical-record-form.tsx
'use client'

import { useActionState } from 'react'
import { useForm, FormProvider } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { medicalRecordSchema, type MedicalRecordFormData } from '@/lib/validations/medical-record'
import { SectionPatientData } from './section-patient-data'
import { SectionSymptoms } from './section-symptoms'
import { SectionOnset } from './section-onset'
import { SectionHistory } from './section-history'
import { SectionDiagnosis } from './section-diagnosis'
import { SectionCeap } from './section-ceap'
import { SectionVascularLab } from './section-vascular-lab'
import { SectionTreatment } from './section-treatment'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface MedicalRecordFormProps {
  patientData: PatientData
  services: ServiceOption[]
  defaultValues?: Partial<MedicalRecordFormData>
  appointmentId: string
  userRole: 'medico' | 'enfermera'
  mode: 'create' | 'edit'
  recordId?: string
}

export function MedicalRecordForm({
  patientData,
  services,
  defaultValues,
  appointmentId,
  userRole,
  mode,
  recordId
}: MedicalRecordFormProps) {
  const methods = useForm<MedicalRecordFormData>({
    resolver: zodResolver(medicalRecordSchema),
    defaultValues: {
      appointment_id: appointmentId,
      // Initialize all checkbox sections with false values
      sintomas: {
        dolor: false,
        dolor_ciclo: false,
        cansancio: false,
        calambres: false,
        adormecimiento: false,
        prurito: false,
        ardor: false,
        tiempo_evolucion: '',
      },
      // ... other defaults
      ...defaultValues,
    },
  })

  // Determine which sections user can edit
  const nurseEditableSections = ['sintomas', 'signos', 'inicio_relacionado', 'antecedentes']
  const canEditSection = (section: string) => {
    if (userRole === 'medico') return true
    return nurseEditableSections.includes(section)
  }

  return (
    <FormProvider {...methods}>
      <form action={formAction} className="space-y-6">
        {/* Section 1: Patient Data (read-only, from registration) */}
        <Card>
          <CardHeader>
            <CardTitle>1. Datos del Paciente</CardTitle>
          </CardHeader>
          <CardContent>
            <SectionPatientData patient={patientData} />
          </CardContent>
        </Card>

        {/* Section 2: Symptoms and Signs */}
        <Card>
          <CardHeader>
            <CardTitle>2. MC y EA - Sintomas y Signos</CardTitle>
          </CardHeader>
          <CardContent>
            <SectionSymptoms disabled={!canEditSection('sintomas')} />
          </CardContent>
        </Card>

        {/* Section 3: Related Onset */}
        <Card>
          <CardHeader>
            <CardTitle>3. Inicio Relacionado</CardTitle>
          </CardHeader>
          <CardContent>
            <SectionOnset disabled={!canEditSection('inicio_relacionado')} />
          </CardContent>
        </Card>

        {/* Section 4: Medical History */}
        <Card>
          <CardHeader>
            <CardTitle>4. Antecedentes Patologicos</CardTitle>
          </CardHeader>
          <CardContent>
            <SectionHistory disabled={!canEditSection('antecedentes')} />
          </CardContent>
        </Card>

        {/* Section 5: Diagnosis (Doctor only) */}
        <Card>
          <CardHeader>
            <CardTitle>5. Diagnostico</CardTitle>
          </CardHeader>
          <CardContent>
            <SectionDiagnosis disabled={!canEditSection('diagnostico')} />
          </CardContent>
        </Card>

        {/* Section 6: CEAP Classification (Optional, Doctor only) */}
        <Card>
          <CardHeader>
            <CardTitle>6. Clasificacion CEAP (Opcional)</CardTitle>
          </CardHeader>
          <CardContent>
            <SectionCeap disabled={!canEditSection('ceap')} />
          </CardContent>
        </Card>

        {/* Section 7: Vascular Lab */}
        <Card>
          <CardHeader>
            <CardTitle>7. Laboratorio Vascular</CardTitle>
          </CardHeader>
          <CardContent>
            <SectionVascularLab disabled={!canEditSection('laboratorio_vascular')} />
          </CardContent>
        </Card>

        {/* Section 8: Treatment Plan (Doctor only) */}
        <Card>
          <CardHeader>
            <CardTitle>8. Programa Terapeutico</CardTitle>
          </CardHeader>
          <CardContent>
            <SectionTreatment
              services={services}
              disabled={!canEditSection('tratamiento')}
            />
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-4 sticky bottom-4 bg-background p-4 border rounded-lg shadow-lg">
          <Button type="button" variant="outline" onClick={handleSaveDraft}>
            Guardar Borrador
          </Button>
          <Button type="submit">
            {mode === 'create' ? 'Crear Historia' : 'Actualizar Historia'}
          </Button>
        </div>
      </form>
    </FormProvider>
  )
}
```

### Pattern 3: Reusable Checkbox Group Component
**What:** Component for rendering multiple related checkboxes with optional observation fields
**When to use:** Symptoms, signs, onset, and history sections
**Example:**
```typescript
// Source: Project patterns + accessibility best practices
// components/medical-records/checkbox-group.tsx
'use client'

import { useFormContext } from 'react-hook-form'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface CheckboxOption {
  name: string
  label: string
  hasObservation?: boolean
}

interface CheckboxGroupProps {
  fieldPrefix: string
  options: CheckboxOption[]
  disabled?: boolean
  columns?: 2 | 3 | 4
}

export function CheckboxGroup({
  fieldPrefix,
  options,
  disabled = false,
  columns = 3,
}: CheckboxGroupProps) {
  const { register, watch, setValue } = useFormContext()

  const gridClass = {
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
  }[columns]

  return (
    <div className={`grid ${gridClass} gap-4`}>
      {options.map((option) => {
        const fieldName = `${fieldPrefix}.${option.name}`
        const obsFieldName = `${fieldPrefix}.${option.name}_obs`
        const isChecked = watch(fieldName)

        return (
          <div key={option.name} className="space-y-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id={fieldName}
                checked={isChecked}
                onCheckedChange={(checked) => setValue(fieldName, checked)}
                disabled={disabled}
              />
              <Label htmlFor={fieldName} className="cursor-pointer">
                {option.label}
              </Label>
            </div>

            {option.hasObservation && isChecked && (
              <Input
                {...register(obsFieldName)}
                placeholder="Observaciones..."
                disabled={disabled}
                className="text-sm"
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
```

### Pattern 4: CEAP Classification Dropdown
**What:** Simple dropdown for CEAP clinical classification (C0-C6) per leg
**When to use:** Section 6 of the medical record form
**Example:**
```typescript
// Source: CEAP Classification standards + project patterns
// components/medical-records/section-ceap.tsx
'use client'

import { useFormContext } from 'react-hook-form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FormField, FormItem, FormLabel, FormControl } from '@/components/ui/form'

const CEAP_OPTIONS = [
  { value: 'C0', label: 'C0 - Sin signos visibles o palpables' },
  { value: 'C1', label: 'C1 - Telangiectasias o venas reticulares' },
  { value: 'C2', label: 'C2 - Varices' },
  { value: 'C3', label: 'C3 - Edema' },
  { value: 'C4', label: 'C4 - Cambios cutaneos (pigmentacion, eczema, lipodermatoesclerosis)' },
  { value: 'C5', label: 'C5 - Ulcera cicatrizada' },
  { value: 'C6', label: 'C6 - Ulcera activa' },
]

interface SectionCeapProps {
  disabled?: boolean
}

export function SectionCeap({ disabled = false }: SectionCeapProps) {
  const { control, setValue } = useFormContext()

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* Left Leg */}
      <FormField
        control={control}
        name="ceap_pierna_izquierda"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Pierna Izquierda</FormLabel>
            <Select
              onValueChange={field.onChange}
              value={field.value || ''}
              disabled={disabled}
            >
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Sin clasificar" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="">Sin clasificar</SelectItem>
                {CEAP_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormItem>
        )}
      />

      {/* Right Leg */}
      <FormField
        control={control}
        name="ceap_pierna_derecha"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Pierna Derecha</FormLabel>
            <Select
              onValueChange={field.onChange}
              value={field.value || ''}
              disabled={disabled}
            >
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Sin clasificar" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="">Sin clasificar</SelectItem>
                {CEAP_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormItem>
        )}
      />

      <p className="col-span-2 text-sm text-muted-foreground">
        Clasificacion CEAP simplificada (solo componente Clinico).
        Opcional: puede clasificar una pierna, ambas, o ninguna.
      </p>
    </div>
  )
}
```

### Pattern 5: Quotation Generation from Treatment Plan
**What:** Automatically generate quotation from selected treatments
**When to use:** After treatment selection, in separate tab/section
**Example:**
```typescript
// Source: Existing payment patterns + project requirements
// components/medical-records/quotation-panel.tsx
'use client'

import { useMemo } from 'react'
import { useFormContext } from 'react-hook-form'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ServiceOption } from '@/types/services'

interface QuotationPanelProps {
  services: ServiceOption[]
  patientName: string
  onSaveQuotation?: () => void
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(amount)

export function QuotationPanel({
  services,
  patientName,
  onSaveQuotation
}: QuotationPanelProps) {
  const { watch, setValue } = useFormContext()
  const selectedTreatmentIds = watch('tratamiento_ids') || []
  const quotationOverrides = watch('quotation_overrides') || {}

  // Build quotation items from selected treatments
  const quotationItems = useMemo(() => {
    return selectedTreatmentIds
      .map((id: string) => {
        const service = services.find(s => s.id === id)
        if (!service) return null

        const override = quotationOverrides[id]
        const price = override?.price ?? service.precio_base
        const quantity = override?.quantity ?? 1

        return {
          service_id: id,
          service_name: service.nombre,
          unit_price: price,
          quantity,
          subtotal: price * quantity,
          is_variable: service.precio_variable,
          precio_minimo: service.precio_minimo,
          precio_maximo: service.precio_maximo,
        }
      })
      .filter(Boolean)
  }, [selectedTreatmentIds, services, quotationOverrides])

  const total = quotationItems.reduce((sum, item) => sum + (item?.subtotal || 0), 0)

  const handlePriceChange = (serviceId: string, price: number) => {
    setValue('quotation_overrides', {
      ...quotationOverrides,
      [serviceId]: { ...quotationOverrides[serviceId], price }
    })
  }

  if (selectedTreatmentIds.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Cotizacion</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-4">
            Seleccione tratamientos en el Programa Terapeutico para generar cotizacion
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cotizacion para {patientName}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Quotation Items */}
        <div className="space-y-3">
          {quotationItems.map((item) => item && (
            <div
              key={item.service_id}
              className="flex items-center justify-between p-3 border rounded-lg"
            >
              <div className="flex-1">
                <p className="font-medium">{item.service_name}</p>
                {item.is_variable && (
                  <p className="text-xs text-muted-foreground">
                    Rango: {formatCurrency(item.precio_minimo || 0)} - {formatCurrency(item.precio_maximo || 0)}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-4">
                {item.is_variable ? (
                  <div className="w-32">
                    <Input
                      type="number"
                      value={item.unit_price}
                      onChange={(e) => handlePriceChange(item.service_id, parseFloat(e.target.value) || 0)}
                      min={item.precio_minimo || 0}
                      max={item.precio_maximo || undefined}
                    />
                  </div>
                ) : (
                  <span className="font-medium">{formatCurrency(item.unit_price)}</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Total */}
        <div className="border-t pt-4 flex justify-between items-center">
          <span className="text-lg font-medium">Total:</span>
          <span className="text-2xl font-bold">{formatCurrency(total)}</span>
        </div>

        {/* Note: No expiration date per CONTEXT.md */}
        <p className="text-sm text-muted-foreground">
          Esta cotizacion no tiene fecha de vencimiento.
        </p>

        {onSaveQuotation && (
          <Button onClick={onSaveQuotation} className="w-full">
            Guardar Cotizacion
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
```

### Pattern 6: Database Schema for Medical Records
**What:** Tables for medical records with JSONB columns and role-based RLS
**When to use:** Database migration
**Example:**
```sql
-- Source: Project patterns + PostgreSQL JSONB best practices
-- supabase/migrations/018_medical_records.sql

-- ============================================
-- 1. MEDICAL_RECORDS TABLE
-- ============================================

-- CEAP clinical classification enum (optional values)
CREATE TYPE public.ceap_classification AS ENUM ('C0', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6');

-- Medical record status
CREATE TYPE public.medical_record_status AS ENUM ('borrador', 'completado');

CREATE TABLE public.medical_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Required references
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE RESTRICT,
  doctor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,

  -- JSONB columns for flexible checkbox data
  sintomas JSONB NOT NULL DEFAULT '{}',
  signos JSONB NOT NULL DEFAULT '{}',
  inicio_relacionado JSONB NOT NULL DEFAULT '{}',
  antecedentes JSONB NOT NULL DEFAULT '{}',
  laboratorio_vascular JSONB NOT NULL DEFAULT '{}',

  -- Text fields
  diagnostico TEXT,

  -- CEAP Classification (optional)
  ceap_pierna_izquierda public.ceap_classification,
  ceap_pierna_derecha public.ceap_classification,

  -- Treatment plan (array of service IDs for reference)
  tratamiento_ids UUID[] DEFAULT '{}',

  -- Status
  estado public.medical_record_status NOT NULL DEFAULT 'borrador',

  -- Audit
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Ensure one record per appointment (base record)
  UNIQUE (appointment_id)
);

-- Indexes
CREATE INDEX idx_medical_records_patient ON public.medical_records(patient_id);
CREATE INDEX idx_medical_records_appointment ON public.medical_records(appointment_id);
CREATE INDEX idx_medical_records_doctor ON public.medical_records(doctor_id);
CREATE INDEX idx_medical_records_estado ON public.medical_records(estado);

-- ============================================
-- 2. QUOTATIONS TABLE
-- ============================================

CREATE TABLE public.quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Reference to medical record
  medical_record_id UUID NOT NULL REFERENCES public.medical_records(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,

  -- Snapshot of items at quotation time (immutable)
  items JSONB NOT NULL,  -- Array of {service_id, service_name, unit_price, quantity}

  -- Total
  total DECIMAL(12,2) NOT NULL,

  -- No expiration date per CONTEXT.md

  -- Audit
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index
CREATE INDEX idx_quotations_medical_record ON public.quotations(medical_record_id);
CREATE INDEX idx_quotations_patient ON public.quotations(patient_id);

-- ============================================
-- 3. PROGRESS NOTES TABLE (Evolution notes)
-- ============================================

CREATE TABLE public.progress_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  medical_record_id UUID NOT NULL REFERENCES public.medical_records(id) ON DELETE CASCADE,
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE RESTRICT,

  -- Note content
  nota TEXT NOT NULL,

  -- Audit
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for chronological display
CREATE INDEX idx_progress_notes_medical_record ON public.progress_notes(medical_record_id, created_at);

-- ============================================
-- 4. UPDATED_AT TRIGGER
-- ============================================

CREATE TRIGGER tr_medical_records_updated_at
  BEFORE UPDATE ON public.medical_records
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER tr_quotations_updated_at
  BEFORE UPDATE ON public.quotations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- ============================================
-- 5. ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.medical_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progress_notes ENABLE ROW LEVEL SECURITY;

-- Medical Records: All staff can view
CREATE POLICY "Staff can view medical records"
  ON public.medical_records FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'medico', 'enfermera', 'secretaria')
    )
  );

-- Medical Records: Medico and Enfermera can create
CREATE POLICY "Medical staff can create medical records"
  ON public.medical_records FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'medico', 'enfermera')
    )
  );

-- Medical Records: Role-based update
-- Medicos can update all fields
-- Enfermeras can only update nursing sections (enforced at trigger level)
CREATE POLICY "Medical staff can update medical records"
  ON public.medical_records FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'medico', 'enfermera')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'medico', 'enfermera')
    )
  );

-- Quotations policies (similar pattern)
CREATE POLICY "Staff can view quotations"
  ON public.quotations FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'medico', 'enfermera', 'secretaria')
  ));

CREATE POLICY "Medicos can manage quotations"
  ON public.quotations FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'medico')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'medico')
  ));

-- Progress notes policies
CREATE POLICY "Staff can view progress notes"
  ON public.progress_notes FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'medico', 'enfermera', 'secretaria')
  ));

CREATE POLICY "Medical staff can create progress notes"
  ON public.progress_notes FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'medico', 'enfermera')
  ));

-- ============================================
-- 6. TRIGGER FOR ROLE-BASED FIELD UPDATES
-- ============================================

-- Enforce that enfermeras can only update nursing sections
CREATE OR REPLACE FUNCTION public.enforce_medical_record_permissions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role TEXT;
BEGIN
  -- Get current user's role
  SELECT role INTO v_role
  FROM public.user_roles
  WHERE user_id = auth.uid();

  -- Admins and medicos can update everything
  IF v_role IN ('admin', 'medico') THEN
    RETURN NEW;
  END IF;

  -- Enfermeras: check that doctor-only fields haven't changed
  IF v_role = 'enfermera' THEN
    IF OLD.diagnostico IS DISTINCT FROM NEW.diagnostico
       OR OLD.ceap_pierna_izquierda IS DISTINCT FROM NEW.ceap_pierna_izquierda
       OR OLD.ceap_pierna_derecha IS DISTINCT FROM NEW.ceap_pierna_derecha
       OR OLD.tratamiento_ids IS DISTINCT FROM NEW.tratamiento_ids
    THEN
      RAISE EXCEPTION 'Las enfermeras no pueden modificar diagnostico, CEAP, o tratamiento';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_medical_record_permissions
  BEFORE UPDATE ON public.medical_records
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_medical_record_permissions();

-- ============================================
-- 7. AUDIT LOGGING
-- ============================================

SELECT enable_audit_for_table('public.medical_records');
SELECT enable_audit_for_table('public.quotations');
SELECT enable_audit_for_table('public.progress_notes');

-- ============================================
-- 8. GRANTS
-- ============================================

GRANT SELECT, INSERT, UPDATE ON public.medical_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotations TO authenticated;
GRANT SELECT, INSERT ON public.progress_notes TO authenticated;
```

### Anti-Patterns to Avoid
- **Using normalized tables for static checkboxes:** JSONB is simpler when checkbox options rarely change
- **Storing CEAP as free text:** Enum enforces valid values; free text allows typos
- **Multi-step wizard for form:** CONTEXT.md explicitly chose continuous scroll
- **Allowing direct quotation editing after creation:** Snapshot prices at creation time for consistency
- **Role checks only at UI level:** Database trigger ensures enfermeras cannot modify doctor fields
- **Quotation stored inside medical record:** Separate table allows quotation lifecycle management

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Checkbox state management | Manual state tracking | react-hook-form + FormProvider | Handles complex nested state, validation |
| Form section visibility | Custom permission logic | useFormContext + role prop | Existing pattern in project |
| Autosave/draft | Custom debounce logic | Server action with estado='borrador' | Simpler, uses existing action pattern |
| CEAP validation | Custom dropdown validation | PostgreSQL enum type | Database enforces valid values |
| Quotation price snapshot | Price lookup at view time | Snapshot at creation in items JSONB | Ensures historical accuracy |
| Role-based field protection | UI-only disabling | Database trigger + UI disabling | Defense in depth |

**Key insight:** The checkbox-heavy nature of medical forms makes JSONB columns ideal. Trying to normalize symptoms, signs, and antecedentes into junction tables would create unnecessary complexity for data that's essentially static.

## Common Pitfalls

### Pitfall 1: Form Re-renders on Every Checkbox Change
**What goes wrong:** Form becomes laggy with 50+ checkboxes
**Why it happens:** Improper use of watch() causes full form re-render
**How to avoid:** Use FormProvider with isolated components; each section only watches its own fields
**Warning signs:** Noticeable delay between click and checkbox state change

### Pitfall 2: Enfermera Updates Doctor Fields via API
**What goes wrong:** Nurse modifies diagnosis through direct API call
**Why it happens:** RLS only checks role for table access, not field-level
**How to avoid:** Database trigger validates that doctor-only fields unchanged when role=enfermera
**Warning signs:** Audit log shows enfermera updating diagnostico

### Pitfall 3: Quotation Prices Don't Match Service Catalog
**What goes wrong:** Quotation total differs from expected after service price change
**Why it happens:** Quotation only stores service_id, looks up current price
**How to avoid:** Snapshot service_name and unit_price in quotation items JSONB
**Warning signs:** Sum of quotation items doesn't match stored total

### Pitfall 4: Lost Draft When Navigating Away
**What goes wrong:** User loses 20 minutes of form entry
**Why it happens:** No autosave, no navigation warning
**How to avoid:** Implement draft saving; consider beforeunload warning
**Warning signs:** Support tickets about lost work

### Pitfall 5: CEAP Stored as String Allows Invalid Values
**What goes wrong:** Database contains "C7" or "c1" (lowercase)
**Why it happens:** Text column doesn't enforce valid CEAP values
**How to avoid:** Use PostgreSQL enum type for ceap_classification
**Warning signs:** Invalid CEAP values in reports

### Pitfall 6: Multiple Medical Records for Same Appointment
**What goes wrong:** Duplicate records cause confusion, incorrect history
**Why it happens:** No unique constraint on appointment_id
**How to avoid:** UNIQUE constraint on (appointment_id) for base record; progress_notes for followup
**Warning signs:** Patient timeline shows duplicate entries

### Pitfall 7: Quotation Without Medical Record
**What goes wrong:** Orphan quotation with no clinical context
**Why it happens:** Direct quotation creation without medical record link
**How to avoid:** quotations.medical_record_id is NOT NULL and required
**Warning signs:** Quotations appearing without associated clinical documentation

## Code Examples

Verified patterns from official sources:

### Zod Schema for Medical Record
```typescript
// Source: Existing project patterns + Zod documentation
// lib/validations/medical-record.ts
import { z } from 'zod'

const symptomsSchema = z.object({
  dolor: z.boolean().default(false),
  dolor_ciclo: z.boolean().default(false),
  cansancio: z.boolean().default(false),
  calambres: z.boolean().default(false),
  adormecimiento: z.boolean().default(false),
  prurito: z.boolean().default(false),
  ardor: z.boolean().default(false),
  tiempo_evolucion: z.string().optional().default(''),
})

const signsSchema = z.object({
  lipodermatoesclerosis: z.boolean().default(false),
  edema: z.boolean().default(false),
  ulcera: z.boolean().default(false),
  eczema: z.boolean().default(false),
})

const onsetSchema = z.object({
  adolescencia: z.boolean().default(false),
  embarazo: z.boolean().default(false),
  planificacion: z.boolean().default(false),
  trauma: z.boolean().default(false),
  posquirurgico: z.boolean().default(false),
})

// History items with optional observations
const historyItemSchema = (name: string) => z.object({
  [name]: z.boolean().default(false),
  [`${name}_obs`]: z.string().optional().default(''),
})

const historySchema = z.object({
  familiares: z.boolean().default(false),
  familiares_obs: z.string().optional().default(''),
  hepatitis: z.boolean().default(false),
  hepatitis_obs: z.string().optional().default(''),
  hospitalizacion: z.boolean().default(false),
  hospitalizacion_obs: z.string().optional().default(''),
  ginecologia: z.boolean().default(false),
  ginecologia_obs: z.string().optional().default(''),
  diabetes: z.boolean().default(false),
  diabetes_obs: z.string().optional().default(''),
  hipertension: z.boolean().default(false),
  hipertension_obs: z.string().optional().default(''),
  alergia: z.boolean().default(false),
  alergia_obs: z.string().optional().default(''),
  cirugia: z.boolean().default(false),
  cirugia_obs: z.string().optional().default(''),
  transfusiones: z.boolean().default(false),
  transfusiones_obs: z.string().optional().default(''),
  farmacologico: z.boolean().default(false),
  farmacologico_obs: z.string().optional().default(''),
})

const vascularLabSchema = z.object({
  mapeo_dupplex: z.boolean().default(false),
  escaneo_dupplex: z.boolean().default(false),
  fotopletismografia: z.boolean().default(false),
})

const ceapClassificationSchema = z.enum(['C0', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6']).nullable()

export const medicalRecordSchema = z.object({
  appointment_id: z.string().uuid('ID de cita invalido'),

  // JSONB sections
  sintomas: symptomsSchema,
  signos: signsSchema,
  inicio_relacionado: onsetSchema,
  antecedentes: historySchema,
  laboratorio_vascular: vascularLabSchema,

  // Text fields
  diagnostico: z.string().optional().default(''),

  // CEAP (optional)
  ceap_pierna_izquierda: ceapClassificationSchema.optional().default(null),
  ceap_pierna_derecha: ceapClassificationSchema.optional().default(null),

  // Treatment IDs
  tratamiento_ids: z.array(z.string().uuid()).default([]),

  // Quotation overrides (for variable price services)
  quotation_overrides: z.record(z.object({
    price: z.number().positive().optional(),
    quantity: z.number().int().positive().optional(),
  })).optional().default({}),
})

export type MedicalRecordFormData = z.infer<typeof medicalRecordSchema>
```

### Server Action for Creating Medical Record
```typescript
// Source: Existing project patterns + requirements
// app/(protected)/historias/actions.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { medicalRecordSchema } from '@/lib/validations/medical-record'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export type ActionState = {
  error?: string
  errors?: Record<string, string[]>
  success?: boolean
  recordId?: string
}

export async function createMedicalRecord(
  prevState: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient()

  // Verify user is authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autorizado. Por favor inicie sesion.' }
  }

  // Check user role
  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (!roleData || !['admin', 'medico', 'enfermera'].includes(roleData.role)) {
    return { error: 'No tiene permisos para crear historias clinicas.' }
  }

  // Parse form data (JSONB fields are stringified)
  const rawData = {
    appointment_id: formData.get('appointment_id'),
    sintomas: JSON.parse(formData.get('sintomas') as string || '{}'),
    signos: JSON.parse(formData.get('signos') as string || '{}'),
    inicio_relacionado: JSON.parse(formData.get('inicio_relacionado') as string || '{}'),
    antecedentes: JSON.parse(formData.get('antecedentes') as string || '{}'),
    laboratorio_vascular: JSON.parse(formData.get('laboratorio_vascular') as string || '{}'),
    diagnostico: formData.get('diagnostico') || '',
    ceap_pierna_izquierda: formData.get('ceap_pierna_izquierda') || null,
    ceap_pierna_derecha: formData.get('ceap_pierna_derecha') || null,
    tratamiento_ids: JSON.parse(formData.get('tratamiento_ids') as string || '[]'),
  }

  // Validate with Zod
  const validated = medicalRecordSchema.safeParse(rawData)
  if (!validated.success) {
    return {
      errors: validated.error.flatten().fieldErrors as Record<string, string[]>,
      error: 'Por favor corrija los errores en el formulario',
    }
  }

  // Get appointment info to get patient_id
  const { data: appointment, error: appointmentError } = await supabase
    .from('appointments')
    .select('patient_id, doctor_id')
    .eq('id', validated.data.appointment_id)
    .single()

  if (appointmentError || !appointment) {
    return { error: 'Cita no encontrada.' }
  }

  // Determine status based on what was filled
  const isDraft = formData.get('save_as_draft') === 'true'
  const estado = isDraft ? 'borrador' : 'completado'

  // Insert medical record
  const { data: record, error: insertError } = await supabase
    .from('medical_records')
    .insert({
      patient_id: appointment.patient_id,
      appointment_id: validated.data.appointment_id,
      doctor_id: appointment.doctor_id,
      sintomas: validated.data.sintomas,
      signos: validated.data.signos,
      inicio_relacionado: validated.data.inicio_relacionado,
      antecedentes: validated.data.antecedentes,
      laboratorio_vascular: validated.data.laboratorio_vascular,
      diagnostico: validated.data.diagnostico || null,
      ceap_pierna_izquierda: validated.data.ceap_pierna_izquierda,
      ceap_pierna_derecha: validated.data.ceap_pierna_derecha,
      tratamiento_ids: validated.data.tratamiento_ids,
      estado,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (insertError) {
    console.error('Medical record creation error:', insertError)
    if (insertError.code === '23505') {
      return { error: 'Ya existe una historia clinica para esta cita.' }
    }
    return { error: 'Error al crear historia clinica. Por favor intente de nuevo.' }
  }

  revalidatePath('/historias')
  revalidatePath(`/pacientes/${appointment.patient_id}`)

  return { success: true, recordId: record.id }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Paper forms scanned to PDF | Digital structured data (JSONB) | Digital transformation | Searchable, analyzable data |
| Single form for all visits | Base record + progress notes | EHR best practices | Clean history, clear evolution |
| Free text classification | Enum-constrained CEAP | CEAP 2020 update | Standardized reporting |
| Quotation in Word doc | Linked to treatment plan | System integration | Automatic pricing, no manual errors |

**Deprecated/outdated:**
- Paper-based medical records (being digitized)
- Free-text CEAP entry (standardized to enum)
- Manual quotation price lookups (automated from service catalog)

## Open Questions

Things that couldn't be fully resolved:

1. **Progress notes editing**
   - What we know: Progress notes are tied to appointments
   - What's unclear: Should progress notes be editable after creation? For how long?
   - Recommendation: Allow editing for 24 hours, then lock (like audit-sensitive data)

2. **Medical record version history**
   - What we know: Audit log captures changes
   - What's unclear: Should users see a diff view of changes?
   - Recommendation: Start with audit log; add user-facing diff view if requested

3. **Quotation to Payment conversion**
   - What we know: Quotation has items JSONB similar to payment_items
   - What's unclear: Should quotation auto-populate payment form? Direct conversion?
   - Recommendation: Quotation can be "sent to payment" which pre-fills payment form

4. **Autosave frequency**
   - What we know: User wants to save drafts
   - What's unclear: How often should autosave trigger?
   - Recommendation: Save draft on section blur or every 30 seconds of inactivity

## Sources

### Primary (HIGH confidence)
- [React Hook Form Advanced Usage](https://react-hook-form.com/advanced-usage) - FormProvider, useFormContext patterns
- [PostgreSQL JSONB Documentation](https://www.postgresql.org/docs/current/datatype-json.html) - JSONB column usage
- [CEAP Classification - NCBI](https://www.ncbi.nlm.nih.gov/books/NBK557410/) - CEAP standard classification
- [CEAP 2020 Update](https://www.jvsvenous.org/article/S2213-333X(20)30063-9/fulltext) - Current CEAP classification standard
- [Supabase RLS Documentation](https://supabase.com/docs/guides/database/postgres/row-level-security) - Row level security patterns
- [Supabase Custom Claims RBAC](https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac) - Role-based access control

### Secondary (MEDIUM confidence)
- [Next.js Forms Guide](https://nextjs.org/docs/app/guides/forms) - Server actions for forms
- [React Form Best Practices 2025](https://medium.com/@farzanekazemi8517/best-practices-for-handling-forms-in-react-2025-edition-62572b14452f) - Long form patterns
- [JSONB for Flexible Schema](https://medium.com/@richardhightower/jsonb-postgresqls-secret-weapon-for-flexible-data-modeling-cf2f5087168f) - JSONB design patterns

### Tertiary (LOW confidence)
- Existing project patterns (appointment-form.tsx, patient-form.tsx) - Verified in codebase
- WebSearch results on medical record database design - General patterns confirmed

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All components verified in existing project
- Architecture: HIGH - Patterns from official docs and existing project patterns
- Pitfalls: HIGH - Common issues verified through multiple sources
- CEAP: HIGH - Standard classification verified against official medical sources

**Research date:** 2026-01-24
**Valid until:** 2026-02-24 (30 days - stable patterns, no rapidly evolving libraries)

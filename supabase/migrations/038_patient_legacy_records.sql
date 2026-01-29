-- Migration: 038_patient_legacy_records.sql
-- Purpose: Store legacy data from Access database migration
-- Created: 2026-01-28

-- ============================================
-- 1. PATIENT LEGACY RECORDS TABLE
-- ============================================

CREATE TABLE public.patient_legacy_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to patient (by cedula, resolved during migration)
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,

  -- Original Access IDs for reference
  access_cedula TEXT,
  access_historia_id BIGINT,

  -- ============================================
  -- RAW DATA FROM ACCESS (preserves everything)
  -- ============================================

  -- Complete original record from PACIENTES table
  raw_paciente JSONB NOT NULL DEFAULT '{}',

  -- All records from PLAN CIRUGIA for this patient
  raw_plan_cirugia JSONB NOT NULL DEFAULT '[]',

  -- All records from PLAN COSTOS for this patient
  raw_plan_costos JSONB NOT NULL DEFAULT '[]',

  -- ============================================
  -- PARSED/STRUCTURED DATA (for easier querying)
  -- ============================================

  -- Antecedentes médicos (checkboxes parsed to booleans)
  antecedentes JSONB NOT NULL DEFAULT '{}',

  -- Síntomas (checkboxes parsed to booleans)
  sintomas JSONB NOT NULL DEFAULT '{}',

  -- Exámenes realizados (checkboxes + valores)
  examenes JSONB NOT NULL DEFAULT '{}',

  -- Tratamientos aplicados
  tratamientos JSONB NOT NULL DEFAULT '{}',

  -- Diagnósticos (array from PLAN CIRUGIA + PLAN COSTOS)
  diagnosticos JSONB NOT NULL DEFAULT '[]',

  -- ============================================
  -- KEY TEXT FIELDS (for easy access)
  -- ============================================

  nombre_medico TEXT,
  observaciones TEXT,
  observaciones_alerta TEXT,
  medicamentos TEXT,
  grado_varices TEXT,
  tiempo_evolucion TEXT,
  numero_visitas TEXT,
  publicidad TEXT,  -- cómo conoció la clínica

  -- ============================================
  -- METADATA
  -- ============================================

  fecha_ingreso_original TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'access_migration',
  migrated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Comments
COMMENT ON TABLE public.patient_legacy_records IS 'Datos históricos migrados de Access - antecedentes y diagnósticos';
COMMENT ON COLUMN public.patient_legacy_records.access_id IS 'Cédula/ID original en Access';
COMMENT ON COLUMN public.patient_legacy_records.access_historia_id IS 'Número de historia clínica en Access';
COMMENT ON COLUMN public.patient_legacy_records.antecedentes IS 'Antecedentes médicos del paciente (checkboxes de Access)';
COMMENT ON COLUMN public.patient_legacy_records.diagnosticos IS 'Array de diagnósticos históricos de PLAN CIRUGIA';

-- ============================================
-- 2. INDEXES
-- ============================================

CREATE INDEX idx_legacy_records_patient ON public.patient_legacy_records(patient_id);
CREATE INDEX idx_legacy_records_access_id ON public.patient_legacy_records(access_id);

-- ============================================
-- 3. ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.patient_legacy_records ENABLE ROW LEVEL SECURITY;

-- All staff can view legacy records
CREATE POLICY "Staff can view legacy records"
  ON public.patient_legacy_records FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'medico', 'enfermera', 'secretaria')
    )
  );

-- Only admin can modify legacy records (for corrections)
CREATE POLICY "Admin can modify legacy records"
  ON public.patient_legacy_records FOR ALL
  TO authenticated
  USING (public.get_user_role() = 'admin')
  WITH CHECK (public.get_user_role() = 'admin');

-- ============================================
-- 4. GRANTS
-- ============================================

GRANT SELECT ON public.patient_legacy_records TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.patient_legacy_records TO authenticated;

-- Migration: 018_medical_records.sql
-- Purpose: Medical records (Historias Clinicas) for phlebology with CEAP classification
-- Phase: 06-medical-records
-- Created: 2026-01-24
-- NOTE: Historia clinica digital basada en formato fisico de Varix Center

-- ============================================
-- 1. ENUM TYPES
-- ============================================

-- CEAP Classification (Clinical component only: C0-C6)
-- Used for venous disease severity classification
CREATE TYPE public.ceap_classification AS ENUM (
  'C0',  -- No visible or palpable signs of venous disease
  'C1',  -- Telangiectasias or reticular veins
  'C2',  -- Varicose veins
  'C3',  -- Edema
  'C4',  -- Skin changes (C4a: pigmentation/eczema, C4b: lipodermatosclerosis/atrophie blanche)
  'C5',  -- Healed venous ulcer
  'C6'   -- Active venous ulcer
);

COMMENT ON TYPE public.ceap_classification IS 'Clasificacion CEAP componente C (C0-C6) para enfermedad venosa';

-- Medical record status
CREATE TYPE public.medical_record_status AS ENUM (
  'borrador',    -- Draft, can be edited by enfermera/medico
  'completado'   -- Completed, only medico can edit
);

COMMENT ON TYPE public.medical_record_status IS 'Estado de la historia clinica: borrador permite edicion, completado es final';

-- ============================================
-- 2. MEDICAL_RECORDS TABLE
-- ============================================

CREATE TABLE public.medical_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core relationships
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  appointment_id UUID NOT NULL UNIQUE REFERENCES public.appointments(id) ON DELETE RESTRICT,
  doctor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,

  -- ============================================
  -- CLINICAL DATA (JSONB for checkbox groups)
  -- ============================================

  -- Sintomas (Motivo de Consulta) - Enfermera editable
  -- { dolor: boolean, pesadez: boolean, calambres: boolean, prurito: boolean,
  --   ardor: boolean, cansancio: boolean, hinchazon: boolean, otros: string,
  --   tiempo_evolucion: string }
  sintomas JSONB NOT NULL DEFAULT '{}',

  -- Signos (Examen Fisico) - Enfermera editable
  -- { varices: boolean, telangiectasias: boolean, edema: boolean,
  --   hiperpigmentacion: boolean, ulcera_activa: boolean, ulcera_cicatrizada: boolean,
  --   lipodermatoesclerosis: boolean, otros: string }
  signos JSONB NOT NULL DEFAULT '{}',

  -- Inicio relacionado con - Enfermera editable
  -- { embarazo: boolean, anticonceptivos: boolean, menopausia: boolean,
  --   trabajo_pie: boolean, trabajo_sentado: boolean, trauma: boolean,
  --   cirugia_previa: boolean, otros: string }
  inicio_relacionado JSONB NOT NULL DEFAULT '{}',

  -- Antecedentes patologicos - Enfermera editable
  -- { hipertension: boolean, diabetes: boolean, cardiopatia: boolean,
  --   trombosis_venosa: boolean, alergias: boolean, cirugia_vascular: boolean,
  --   obesidad: boolean, tabaquismo: boolean, otros: string,
  --   observaciones: string }
  antecedentes JSONB NOT NULL DEFAULT '{}',

  -- Laboratorio vascular - Medico only
  -- { doppler_venoso: boolean, doppler_arterial: boolean,
  --   fotopletismografia: boolean, pletismografia: boolean,
  --   otros: string, hallazgos: string }
  laboratorio_vascular JSONB NOT NULL DEFAULT '{}',

  -- ============================================
  -- DIAGNOSIS AND TREATMENT (Medico only)
  -- ============================================

  -- Diagnostico (texto libre)
  diagnostico TEXT,

  -- CEAP Classification per leg (optional)
  ceap_pierna_izquierda public.ceap_classification,
  ceap_pierna_derecha public.ceap_classification,

  -- Selected treatment services (array of service IDs)
  tratamiento_ids UUID[] NOT NULL DEFAULT '{}',

  -- ============================================
  -- STATUS AND AUDIT
  -- ============================================

  estado public.medical_record_status NOT NULL DEFAULT 'borrador',

  -- Who created/edited
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table comments
COMMENT ON TABLE public.medical_records IS 'Historias clinicas de flebologia - una por cita, origen siempre desde cita';
COMMENT ON COLUMN public.medical_records.sintomas IS 'Sintomas reportados por paciente (checkboxes + tiempo evolucion)';
COMMENT ON COLUMN public.medical_records.signos IS 'Signos del examen fisico (checkboxes)';
COMMENT ON COLUMN public.medical_records.inicio_relacionado IS 'Factores relacionados con el inicio de sintomas';
COMMENT ON COLUMN public.medical_records.antecedentes IS 'Antecedentes patologicos del paciente';
COMMENT ON COLUMN public.medical_records.laboratorio_vascular IS 'Estudios de laboratorio vascular realizados';
COMMENT ON COLUMN public.medical_records.diagnostico IS 'Diagnostico medico (texto libre)';
COMMENT ON COLUMN public.medical_records.ceap_pierna_izquierda IS 'Clasificacion CEAP pierna izquierda (opcional)';
COMMENT ON COLUMN public.medical_records.ceap_pierna_derecha IS 'Clasificacion CEAP pierna derecha (opcional)';
COMMENT ON COLUMN public.medical_records.tratamiento_ids IS 'IDs de servicios seleccionados para el programa terapeutico';
COMMENT ON COLUMN public.medical_records.estado IS 'borrador = editable, completado = finalizado';

-- ============================================
-- 3. QUOTATIONS TABLE
-- ============================================

CREATE TABLE public.quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to medical record
  medical_record_id UUID NOT NULL REFERENCES public.medical_records(id) ON DELETE CASCADE,

  -- Snapshot of services and prices at quotation time
  -- Array of: { service_id: uuid, nombre: string, precio: number, cantidad: number }
  items JSONB NOT NULL DEFAULT '[]',

  -- Calculated total
  total DECIMAL(12,2) NOT NULL DEFAULT 0,

  -- Optional notes
  notas TEXT,

  -- Audit
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT total_non_negative CHECK (total >= 0)
);

COMMENT ON TABLE public.quotations IS 'Cotizaciones generadas automaticamente desde el programa terapeutico';
COMMENT ON COLUMN public.quotations.items IS 'Snapshot de servicios y precios al momento de la cotizacion';
COMMENT ON COLUMN public.quotations.total IS 'Total calculado de la cotizacion';

-- ============================================
-- 4. PROGRESS_NOTES TABLE
-- ============================================

CREATE TABLE public.progress_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to medical record (base record)
  medical_record_id UUID NOT NULL REFERENCES public.medical_records(id) ON DELETE CASCADE,

  -- Optional link to follow-up appointment
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,

  -- Note content
  nota TEXT NOT NULL,

  -- Audit
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.progress_notes IS 'Notas de evolucion vinculadas a la historia clinica base';
COMMENT ON COLUMN public.progress_notes.nota IS 'Contenido de la nota de evolucion';
COMMENT ON COLUMN public.progress_notes.appointment_id IS 'Cita de control asociada (opcional)';

-- ============================================
-- 5. INDEXES
-- ============================================

-- Medical records indexes
CREATE INDEX idx_medical_records_patient ON public.medical_records(patient_id);
CREATE INDEX idx_medical_records_appointment ON public.medical_records(appointment_id);
CREATE INDEX idx_medical_records_doctor ON public.medical_records(doctor_id);
CREATE INDEX idx_medical_records_estado ON public.medical_records(estado);
CREATE INDEX idx_medical_records_created_at ON public.medical_records(created_at DESC);

-- Quotations indexes
CREATE INDEX idx_quotations_medical_record ON public.quotations(medical_record_id);
CREATE INDEX idx_quotations_created_at ON public.quotations(created_at DESC);

-- Progress notes indexes
CREATE INDEX idx_progress_notes_medical_record ON public.progress_notes(medical_record_id);
CREATE INDEX idx_progress_notes_appointment ON public.progress_notes(appointment_id);
CREATE INDEX idx_progress_notes_created_at ON public.progress_notes(created_at DESC);

-- ============================================
-- 6. UPDATED_AT TRIGGERS
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
-- 7. ENFERMERA PERMISSION TRIGGER
-- ============================================

-- CRITICAL: Enfermeras cannot modify diagnostico, CEAP, tratamiento, or laboratorio_vascular
-- This is defense-in-depth; UI also disables these fields
CREATE OR REPLACE FUNCTION public.enforce_medical_record_permissions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_role TEXT;
BEGIN
  -- Get current user's role
  SELECT role INTO v_user_role
  FROM public.user_roles
  WHERE user_id = auth.uid();

  -- If user is enfermera, check restricted fields
  IF v_user_role = 'enfermera' THEN
    -- Cannot modify diagnostico
    IF OLD.diagnostico IS DISTINCT FROM NEW.diagnostico THEN
      RAISE EXCEPTION 'Enfermera no puede modificar el diagnostico';
    END IF;

    -- Cannot modify CEAP classifications
    IF OLD.ceap_pierna_izquierda IS DISTINCT FROM NEW.ceap_pierna_izquierda THEN
      RAISE EXCEPTION 'Enfermera no puede modificar la clasificacion CEAP';
    END IF;
    IF OLD.ceap_pierna_derecha IS DISTINCT FROM NEW.ceap_pierna_derecha THEN
      RAISE EXCEPTION 'Enfermera no puede modificar la clasificacion CEAP';
    END IF;

    -- Cannot modify tratamiento_ids
    IF OLD.tratamiento_ids IS DISTINCT FROM NEW.tratamiento_ids THEN
      RAISE EXCEPTION 'Enfermera no puede modificar el programa terapeutico';
    END IF;

    -- Cannot modify laboratorio_vascular
    IF OLD.laboratorio_vascular IS DISTINCT FROM NEW.laboratorio_vascular THEN
      RAISE EXCEPTION 'Enfermera no puede modificar el laboratorio vascular';
    END IF;

    -- Cannot change estado to completado (only medico can complete)
    IF OLD.estado = 'borrador' AND NEW.estado = 'completado' THEN
      RAISE EXCEPTION 'Solo el medico puede completar la historia clinica';
    END IF;
  END IF;

  -- Track who updated
  NEW.updated_by := auth.uid();

  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_medical_record_permissions
  BEFORE UPDATE ON public.medical_records
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_medical_record_permissions();

-- ============================================
-- 8. ROW LEVEL SECURITY
-- ============================================

-- Medical records RLS
ALTER TABLE public.medical_records ENABLE ROW LEVEL SECURITY;

-- All staff can view medical records
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

-- Medico and enfermera can create medical records
CREATE POLICY "Clinical staff can create medical records"
  ON public.medical_records FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'medico', 'enfermera')
    )
  );

-- Medico and enfermera can update medical records (trigger enforces field restrictions)
CREATE POLICY "Clinical staff can update medical records"
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

-- NO DELETE policy - medical records cannot be deleted

-- Quotations RLS
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;

-- All staff can view quotations
CREATE POLICY "Staff can view quotations"
  ON public.quotations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'medico', 'enfermera', 'secretaria')
    )
  );

-- Medico can create quotations
CREATE POLICY "Medico can create quotations"
  ON public.quotations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'medico')
    )
  );

-- Medico can update quotations
CREATE POLICY "Medico can update quotations"
  ON public.quotations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'medico')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'medico')
    )
  );

-- Progress notes RLS
ALTER TABLE public.progress_notes ENABLE ROW LEVEL SECURITY;

-- All staff can view progress notes
CREATE POLICY "Staff can view progress notes"
  ON public.progress_notes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'medico', 'enfermera', 'secretaria')
    )
  );

-- Clinical staff can create progress notes
CREATE POLICY "Clinical staff can create progress notes"
  ON public.progress_notes FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'medico', 'enfermera')
    )
  );

-- ============================================
-- 9. AUDIT LOGGING
-- ============================================

SELECT enable_audit_for_table('public.medical_records');
SELECT enable_audit_for_table('public.quotations');
SELECT enable_audit_for_table('public.progress_notes');

-- ============================================
-- 10. GRANT PERMISSIONS
-- ============================================

GRANT SELECT, INSERT, UPDATE ON public.medical_records TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.quotations TO authenticated;
GRANT SELECT, INSERT ON public.progress_notes TO authenticated;

-- ============================================
-- 11. VERIFICATION
-- ============================================

DO $$
BEGIN
  -- Check medical_records table exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'medical_records'
  ) THEN
    RAISE EXCEPTION 'medical_records table not created';
  END IF;

  -- Check RLS is enabled on medical_records
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'medical_records' AND rowsecurity = true
  ) THEN
    RAISE EXCEPTION 'RLS not enabled on medical_records table';
  END IF;

  -- Check quotations table exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'quotations'
  ) THEN
    RAISE EXCEPTION 'quotations table not created';
  END IF;

  -- Check progress_notes table exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'progress_notes'
  ) THEN
    RAISE EXCEPTION 'progress_notes table not created';
  END IF;

  RAISE NOTICE 'Medical records migration verified successfully';
END;
$$;

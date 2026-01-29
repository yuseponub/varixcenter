-- ============================================
-- MIGRATION COMBINADA: Access → Supabase
-- Ejecutar en Supabase Dashboard → SQL Editor
-- ============================================

-- ============================================
-- 037: Make emergency contact fields optional
-- ============================================

ALTER TABLE public.patients
  ALTER COLUMN contacto_emergencia_nombre DROP NOT NULL,
  ALTER COLUMN contacto_emergencia_telefono DROP NOT NULL,
  ALTER COLUMN contacto_emergencia_parentesco DROP NOT NULL;

COMMENT ON COLUMN public.patients.contacto_emergencia_nombre IS 'Nombre del contacto de emergencia. Opcional para datos migrados de Access.';
COMMENT ON COLUMN public.patients.contacto_emergencia_telefono IS 'Telefono del contacto de emergencia. Opcional para datos migrados de Access.';
COMMENT ON COLUMN public.patients.contacto_emergencia_parentesco IS 'Parentesco del contacto de emergencia. Opcional para datos migrados de Access.';

-- ============================================
-- 038: Create patient_legacy_records table
-- ============================================

CREATE TABLE public.patient_legacy_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  access_cedula TEXT,
  access_historia_id BIGINT,
  raw_paciente JSONB NOT NULL DEFAULT '{}',
  raw_plan_cirugia JSONB NOT NULL DEFAULT '[]',
  raw_plan_costos JSONB NOT NULL DEFAULT '[]',
  antecedentes JSONB NOT NULL DEFAULT '{}',
  sintomas JSONB NOT NULL DEFAULT '{}',
  examenes JSONB NOT NULL DEFAULT '{}',
  tratamientos JSONB NOT NULL DEFAULT '{}',
  diagnosticos JSONB NOT NULL DEFAULT '[]',
  nombre_medico TEXT,
  observaciones TEXT,
  observaciones_alerta TEXT,
  medicamentos TEXT,
  grado_varices TEXT,
  tiempo_evolucion TEXT,
  numero_visitas TEXT,
  publicidad TEXT,
  fecha_ingreso_original TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'access_migration',
  migrated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.patient_legacy_records IS 'Datos históricos migrados de Access - antecedentes y diagnósticos';

CREATE INDEX idx_legacy_records_patient ON public.patient_legacy_records(patient_id);
CREATE INDEX idx_legacy_records_cedula ON public.patient_legacy_records(access_cedula);

ALTER TABLE public.patient_legacy_records ENABLE ROW LEVEL SECURITY;

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

CREATE POLICY "Admin can modify legacy records"
  ON public.patient_legacy_records FOR ALL
  TO authenticated
  USING (public.get_user_role() = 'admin')
  WITH CHECK (public.get_user_role() = 'admin');

GRANT SELECT ON public.patient_legacy_records TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.patient_legacy_records TO authenticated;

-- ============================================
-- 039: Add new patient fields
-- ============================================

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS ocupacion VARCHAR(100),
  ADD COLUMN IF NOT EXISTS estado_civil VARCHAR(50),
  ADD COLUMN IF NOT EXISTS ciudad VARCHAR(100),
  ADD COLUMN IF NOT EXISTS pais VARCHAR(50) DEFAULT 'Colombia',
  ADD COLUMN IF NOT EXISTS fecha_registro DATE DEFAULT CURRENT_DATE;

COMMENT ON COLUMN public.patients.ocupacion IS 'Ocupación o profesión del paciente';
COMMENT ON COLUMN public.patients.estado_civil IS 'Estado civil';
COMMENT ON COLUMN public.patients.ciudad IS 'Ciudad de residencia';
COMMENT ON COLUMN public.patients.pais IS 'País de residencia';
COMMENT ON COLUMN public.patients.fecha_registro IS 'Fecha de primera visita/registro del paciente';

CREATE INDEX IF NOT EXISTS idx_patients_ciudad ON public.patients(ciudad);

-- ============================================
-- DONE!
-- ============================================
SELECT 'Migraciones aplicadas correctamente' as resultado;

-- Migration: 040_appointments_legacy.sql
-- Purpose: Store historical appointments from Outlook calendar
-- Created: 2026-01-28

CREATE TABLE public.appointments_legacy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Patient link (may be null if patient not found)
  patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,

  -- Original data from Outlook
  patient_name_original TEXT NOT NULL,
  doctor_name_original TEXT,

  -- Time
  fecha_hora_inicio TIMESTAMPTZ NOT NULL,
  fecha_hora_fin TIMESTAMPTZ,

  -- Details from SUMMARY
  descripcion TEXT,
  telefono_extraido TEXT,
  sesiones_extraidas TEXT,

  -- Raw data
  raw_summary TEXT,
  raw_ics TEXT,

  -- Metadata
  source TEXT NOT NULL DEFAULT 'outlook_calendar',
  migrated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.appointments_legacy IS 'Citas históricas migradas de Outlook - anteriores a 2026-01-29';

CREATE INDEX idx_appointments_legacy_patient ON public.appointments_legacy(patient_id);
CREATE INDEX idx_appointments_legacy_fecha ON public.appointments_legacy(fecha_hora_inicio);
CREATE INDEX idx_appointments_legacy_patient_name ON public.appointments_legacy(patient_name_original);

ALTER TABLE public.appointments_legacy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view legacy appointments"
  ON public.appointments_legacy FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'medico', 'enfermera', 'secretaria')
    )
  );

CREATE POLICY "Admin can modify legacy appointments"
  ON public.appointments_legacy FOR ALL
  TO authenticated
  USING (public.get_user_role() = 'admin')
  WITH CHECK (public.get_user_role() = 'admin');

GRANT SELECT ON public.appointments_legacy TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.appointments_legacy TO authenticated;

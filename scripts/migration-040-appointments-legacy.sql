-- Migration 040: appointments_legacy table
-- Ejecutar en Supabase Dashboard → SQL Editor

CREATE TABLE public.appointments_legacy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  patient_name_original TEXT NOT NULL,
  doctor_name_original TEXT,
  fecha_hora_inicio TIMESTAMPTZ NOT NULL,
  fecha_hora_fin TIMESTAMPTZ,
  descripcion TEXT,
  telefono_extraido TEXT,
  sesiones_extraidas TEXT,
  raw_summary TEXT,
  raw_ics TEXT,
  source TEXT NOT NULL DEFAULT 'outlook_calendar',
  migrated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

SELECT 'Migration 040 completada' as resultado;

-- Migration: 007_appointments.sql
-- Purpose: Appointments table with PostgreSQL exclusion constraint for overlap prevention
-- Phase: 03-appointments, Plan: 01
-- Created: 2026-01-23

-- ============================================
-- 1. ENABLE BTREE_GIST EXTENSION
-- ============================================

-- Required for exclusion constraint with range overlap
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ============================================
-- 2. APPOINTMENT STATUS ENUM
-- ============================================

-- 7 states matching the appointment workflow
CREATE TYPE public.appointment_status AS ENUM (
  'programada',    -- Initial state when created
  'confirmada',    -- Patient confirmed attendance
  'en_sala',       -- Patient arrived, waiting
  'en_atencion',   -- Currently being seen
  'completada',    -- Appointment finished
  'cancelada',     -- Cancelled
  'no_asistio'     -- Patient did not show up
);

COMMENT ON TYPE public.appointment_status IS 'Estado de la cita medica con flujo de trabajo completo';

-- ============================================
-- 3. APPOINTMENTS TABLE
-- ============================================

CREATE TABLE public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign keys
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  doctor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,

  -- Time range
  fecha_hora_inicio TIMESTAMPTZ NOT NULL,
  fecha_hora_fin TIMESTAMPTZ NOT NULL,

  -- Status (using enum type)
  estado public.appointment_status NOT NULL DEFAULT 'programada',

  -- Optional fields
  notas TEXT,
  motivo_consulta TEXT,

  -- Audit
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT valid_time_range CHECK (fecha_hora_fin > fecha_hora_inicio),

  -- CRITICAL: Prevent overlapping appointments for same doctor
  -- Uses tstzrange for time-with-timezone range comparison
  -- '[)' means include start, exclude end (standard for time slots)
  -- Only applies to active appointments (not cancelled/no-show)
  CONSTRAINT no_overlapping_appointments
    EXCLUDE USING gist (
      doctor_id WITH =,
      tstzrange(fecha_hora_inicio, fecha_hora_fin, '[)') WITH &&
    ) WHERE (estado NOT IN ('cancelada', 'no_asistio'))
);

-- Table comment
COMMENT ON TABLE public.appointments IS 'Citas medicas con prevencion de solapamiento por doctor';
COMMENT ON COLUMN public.appointments.estado IS 'Estado actual de la cita (enum appointment_status)';
COMMENT ON CONSTRAINT no_overlapping_appointments ON public.appointments IS 'Previene citas simultaneas para el mismo doctor';

-- ============================================
-- 4. INDEXES
-- ============================================

-- Foreign key lookups
CREATE INDEX idx_appointments_patient ON public.appointments(patient_id);
CREATE INDEX idx_appointments_doctor ON public.appointments(doctor_id);

-- Calendar queries (find appointments in date range)
CREATE INDEX idx_appointments_fecha ON public.appointments(fecha_hora_inicio);

-- Status filtering
CREATE INDEX idx_appointments_estado ON public.appointments(estado);

-- Composite index for doctor's schedule (common query pattern)
CREATE INDEX idx_appointments_doctor_fecha ON public.appointments(doctor_id, fecha_hora_inicio);

-- ============================================
-- 5. UPDATED_AT TRIGGER
-- ============================================

CREATE TRIGGER tr_appointments_updated_at
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- ============================================
-- 6. ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- All authenticated staff can view appointments
CREATE POLICY "Staff can view appointments"
  ON public.appointments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'medico', 'enfermera', 'secretaria')
    )
  );

-- All staff can create appointments
CREATE POLICY "Staff can create appointments"
  ON public.appointments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'medico', 'enfermera', 'secretaria')
    )
  );

-- All staff can update appointments (any role can cancel per CONTEXT.md)
CREATE POLICY "Staff can update appointments"
  ON public.appointments FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'medico', 'enfermera', 'secretaria')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'medico', 'enfermera', 'secretaria')
    )
  );

-- Only admin can delete appointments (soft delete via estado = 'cancelada' preferred)
CREATE POLICY "Admin can delete appointments"
  ON public.appointments FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
  );

-- ============================================
-- 7. AUDIT LOGGING
-- ============================================

-- Enable audit for appointments table (uses function from 002_audit_infrastructure.sql)
SELECT enable_audit_for_table('public.appointments');

-- ============================================
-- 8. GRANT PERMISSIONS
-- ============================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointments TO authenticated;

-- ============================================
-- 9. VERIFICATION
-- ============================================

-- Verify RLS is enabled
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename = 'appointments'
    AND rowsecurity = true
  ) THEN
    RAISE EXCEPTION 'RLS not enabled on appointments table';
  END IF;
END;
$$;

-- Verify btree_gist extension is enabled
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'btree_gist'
  ) THEN
    RAISE EXCEPTION 'btree_gist extension not enabled';
  END IF;
END;
$$;

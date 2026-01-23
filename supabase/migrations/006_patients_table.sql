-- Migration: 006_patients_table.sql
-- Purpose: Patient registry with immutable cedula and audit trail
-- Phase: 02-patients, Plan: 02
-- Created: 2026-01-23

-- ============================================
-- 1. PATIENTS TABLE
-- ============================================

CREATE TABLE public.patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identification (cedula is IMMUTABLE after creation)
  cedula VARCHAR(10) NOT NULL UNIQUE,

  -- Basic info
  nombre VARCHAR(100) NOT NULL,
  apellido VARCHAR(100) NOT NULL,
  celular VARCHAR(10) NOT NULL,
  email VARCHAR(255),
  fecha_nacimiento DATE,
  direccion VARCHAR(200),

  -- Emergency contact (REQUIRED)
  contacto_emergencia_nombre VARCHAR(100) NOT NULL,
  contacto_emergencia_telefono VARCHAR(10) NOT NULL,
  contacto_emergencia_parentesco VARCHAR(50) NOT NULL,

  -- Metadata
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add table comment
COMMENT ON TABLE public.patients IS 'Registro de pacientes con cedula inmutable como identificador unico';
COMMENT ON COLUMN public.patients.cedula IS 'Cedula colombiana (6-10 digitos). INMUTABLE despues de creacion.';

-- ============================================
-- 2. INDEXES FOR SEARCH
-- ============================================

-- Primary search fields
CREATE INDEX idx_patients_cedula ON public.patients(cedula);
CREATE INDEX idx_patients_nombre ON public.patients(nombre);
CREATE INDEX idx_patients_apellido ON public.patients(apellido);
CREATE INDEX idx_patients_celular ON public.patients(celular);

-- Composite index for full name search
CREATE INDEX idx_patients_nombre_apellido ON public.patients(nombre, apellido);

-- ============================================
-- 3. ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view patients
CREATE POLICY "Authenticated users can view patients" ON public.patients
  FOR SELECT
  TO authenticated
  USING (true);

-- Staff can create patients (all roles)
CREATE POLICY "Staff can create patients" ON public.patients
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_user_role() IN ('admin', 'medico', 'enfermera', 'secretaria')
  );

-- Staff can update patients (but cedula trigger prevents cedula changes)
CREATE POLICY "Staff can update patients" ON public.patients
  FOR UPDATE
  TO authenticated
  USING (public.get_user_role() IN ('admin', 'medico', 'enfermera', 'secretaria'))
  WITH CHECK (public.get_user_role() IN ('admin', 'medico', 'enfermera', 'secretaria'));

-- Only admin can delete patients
CREATE POLICY "Only admin can delete patients" ON public.patients
  FOR DELETE
  TO authenticated
  USING (public.get_user_role() = 'admin');

-- ============================================
-- 4. IMMUTABLE CEDULA TRIGGER
-- ============================================

-- Function to prevent cedula updates (anti-fraud)
CREATE OR REPLACE FUNCTION public.prevent_cedula_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.cedula IS DISTINCT FROM NEW.cedula THEN
    RAISE EXCEPTION 'La cedula no puede ser modificada';
  END IF;
  RETURN NEW;
END;
$$;

-- Attach trigger to patients table
CREATE TRIGGER tr_patients_immutable_cedula
  BEFORE UPDATE ON public.patients
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_cedula_update();

-- ============================================
-- 5. UPDATED_AT TRIGGER
-- ============================================

-- Reuse update_updated_at function from Phase 1 if exists, or create it
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at') THEN
    CREATE OR REPLACE FUNCTION public.update_updated_at()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $func$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $func$;
  END IF;
END;
$$;

CREATE TRIGGER tr_patients_updated_at
  BEFORE UPDATE ON public.patients
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- ============================================
-- 6. AUDIT LOGGING
-- ============================================

-- Enable audit for patients table (uses function from 002_audit_infrastructure.sql)
SELECT enable_audit_for_table('public.patients');

-- ============================================
-- 7. VERIFICATION
-- ============================================

-- Verify RLS is enabled
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename = 'patients'
    AND rowsecurity = true
  ) THEN
    RAISE EXCEPTION 'RLS not enabled on patients table';
  END IF;
END;
$$;

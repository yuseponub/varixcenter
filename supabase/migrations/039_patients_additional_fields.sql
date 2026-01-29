-- Migration: 039_patients_additional_fields.sql
-- Purpose: Add additional patient fields for Access migration
-- Created: 2026-01-28

-- ============================================
-- 1. ADD NEW COLUMNS
-- ============================================

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS ocupacion VARCHAR(100),
  ADD COLUMN IF NOT EXISTS estado_civil VARCHAR(50),
  ADD COLUMN IF NOT EXISTS ciudad VARCHAR(100),
  ADD COLUMN IF NOT EXISTS pais VARCHAR(50) DEFAULT 'Colombia',
  ADD COLUMN IF NOT EXISTS fecha_registro DATE DEFAULT CURRENT_DATE;

-- ============================================
-- 2. COMMENTS
-- ============================================

COMMENT ON COLUMN public.patients.ocupacion IS 'Ocupación o profesión del paciente';
COMMENT ON COLUMN public.patients.estado_civil IS 'Estado civil: Soltero/a, Casado/a, Unión Libre, Divorciado/a, Viudo/a';
COMMENT ON COLUMN public.patients.ciudad IS 'Ciudad de residencia';
COMMENT ON COLUMN public.patients.pais IS 'País de residencia (default: Colombia)';
COMMENT ON COLUMN public.patients.fecha_registro IS 'Fecha de primera visita/registro del paciente';

-- ============================================
-- 3. INDEX FOR CITY SEARCH (optional)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_patients_ciudad ON public.patients(ciudad);

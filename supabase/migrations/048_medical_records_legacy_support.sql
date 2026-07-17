-- Migration: 048_medical_records_legacy_support.sql
-- Purpose: Allow medical_records to store legacy Access data (no appointment/doctor required)
-- Created: 2026-02-14

-- ============================================
-- 1. RELAX NOT NULL CONSTRAINTS
-- ============================================

-- appointment_id: legacy records have no appointment
-- PostgreSQL allows multiple NULLs in UNIQUE columns
ALTER TABLE public.medical_records
  ALTER COLUMN appointment_id DROP NOT NULL;

-- doctor_id: legacy records may not resolve to a system doctor
ALTER TABLE public.medical_records
  ALTER COLUMN doctor_id DROP NOT NULL;

-- ============================================
-- 2. ADD NEW COLUMNS
-- ============================================

-- Source tracking: 'digital' (default) or 'legacy_access'
ALTER TABLE public.medical_records
  ADD COLUMN source TEXT NOT NULL DEFAULT 'digital';

-- Link to original legacy record for traceability and idempotency
ALTER TABLE public.medical_records
  ADD COLUMN legacy_record_id UUID REFERENCES public.patient_legacy_records(id);

-- Doctor name from legacy when doctor_id cannot be resolved
ALTER TABLE public.medical_records
  ADD COLUMN nombre_medico_legacy TEXT;

-- Medications (from legacy, also useful for future digital records)
ALTER TABLE public.medical_records
  ADD COLUMN medicamentos TEXT;

-- ============================================
-- 3. INDEXES
-- ============================================

CREATE INDEX idx_medical_records_source ON public.medical_records(source);
CREATE UNIQUE INDEX idx_medical_records_legacy_record ON public.medical_records(legacy_record_id)
  WHERE legacy_record_id IS NOT NULL;

-- ============================================
-- 4. COMMENTS
-- ============================================

COMMENT ON COLUMN public.medical_records.source IS 'Origen del registro: digital (UI) o legacy_access (migrado de Access)';
COMMENT ON COLUMN public.medical_records.legacy_record_id IS 'Referencia al registro legacy original (para trazabilidad e idempotencia)';
COMMENT ON COLUMN public.medical_records.nombre_medico_legacy IS 'Nombre del medico del sistema anterior cuando no se resolvio a UUID';
COMMENT ON COLUMN public.medical_records.medicamentos IS 'Medicamentos del paciente (legacy o texto libre)';

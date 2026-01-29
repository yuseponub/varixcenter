-- Migration: 037_patients_emergency_optional.sql
-- Purpose: Make emergency contact fields optional for legacy data migration
-- Created: 2026-01-28

-- Make emergency contact fields nullable
ALTER TABLE public.patients
  ALTER COLUMN contacto_emergencia_nombre DROP NOT NULL,
  ALTER COLUMN contacto_emergencia_telefono DROP NOT NULL,
  ALTER COLUMN contacto_emergencia_parentesco DROP NOT NULL;

-- Add comment explaining why
COMMENT ON COLUMN public.patients.contacto_emergencia_nombre IS 'Nombre del contacto de emergencia. Opcional para datos migrados de Access.';
COMMENT ON COLUMN public.patients.contacto_emergencia_telefono IS 'Telefono del contacto de emergencia. Opcional para datos migrados de Access.';
COMMENT ON COLUMN public.patients.contacto_emergencia_parentesco IS 'Parentesco del contacto de emergencia. Opcional para datos migrados de Access.';

-- Migration: 052_appointment_doctor_optional.sql
-- Purpose: Make doctor_id optional on appointments
--
-- Business rule change: appointments can be created without a doctor assigned.
-- Only patient + date/time are required. Doctor can be filled in later.
--
-- The no_overlapping_appointments exclusion constraint already handles NULL
-- doctor_id gracefully: GiST equality (=) does not match NULL values, so
-- appointments without an assigned doctor do not conflict with any other
-- appointment. Overlap prevention continues to work for appointments that DO
-- have a doctor assigned.

ALTER TABLE public.appointments
  ALTER COLUMN doctor_id DROP NOT NULL;

COMMENT ON COLUMN public.appointments.doctor_id IS
  'Doctor asignado a la cita (opcional — puede asignarse despues de crearla)';

-- Verify the change
DO $$
BEGIN
  IF (
    SELECT is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'appointments'
      AND column_name = 'doctor_id'
  ) <> 'YES' THEN
    RAISE EXCEPTION 'doctor_id should be nullable after migration 052';
  END IF;

  RAISE NOTICE 'Migration 052: appointments.doctor_id is now optional';
END $$;

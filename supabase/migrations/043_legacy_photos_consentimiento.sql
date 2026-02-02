-- Migration: Add consentimiento type to legacy_history_photos
-- Description: Add 'consentimiento' as valid type for legacy photos

-- Drop and recreate the check constraint to include 'consentimiento'
ALTER TABLE public.legacy_history_photos
  DROP CONSTRAINT IF EXISTS legacy_history_photos_tipo_check;

ALTER TABLE public.legacy_history_photos
  ADD CONSTRAINT legacy_history_photos_tipo_check
  CHECK (tipo IN ('historia', 'evolucion', 'plan_tratamiento', 'consentimiento'));

-- Verification
DO $$
BEGIN
  RAISE NOTICE 'Migration 043_legacy_photos_consentimiento completed successfully';
END $$;

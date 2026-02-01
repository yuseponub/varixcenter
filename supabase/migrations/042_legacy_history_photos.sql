-- Migration: Legacy History Photos
-- Description: Table for storing photos of physical medical records (historias antiguas)
-- Author: Claude
-- Date: 2026-02-01

-- =====================================================
-- 1. CREATE TABLE
-- =====================================================

CREATE TABLE public.legacy_history_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medical_record_id UUID NOT NULL REFERENCES public.medical_records(id) ON DELETE CASCADE,

  -- Tipo de documento: 'historia', 'evolucion', 'plan_tratamiento'
  tipo TEXT NOT NULL CHECK (tipo IN ('historia', 'evolucion', 'plan_tratamiento')),

  -- Ruta en Supabase Storage
  storage_path TEXT NOT NULL,

  -- Orden de la foto dentro del tipo (para multiples fotos)
  orden INTEGER NOT NULL DEFAULT 0,

  -- Metadata
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================
-- 2. INDEXES
-- =====================================================

CREATE INDEX idx_legacy_photos_record ON public.legacy_history_photos(medical_record_id);
CREATE INDEX idx_legacy_photos_tipo ON public.legacy_history_photos(tipo);

-- =====================================================
-- 3. ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE public.legacy_history_photos ENABLE ROW LEVEL SECURITY;

-- Staff puede ver
CREATE POLICY "Staff can view legacy photos"
  ON public.legacy_history_photos FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'medico', 'enfermera', 'secretaria')
    )
  );

-- Clinical staff puede crear
CREATE POLICY "Clinical staff can create legacy photos"
  ON public.legacy_history_photos FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'medico', 'enfermera')
    )
  );

-- Clinical staff puede eliminar
CREATE POLICY "Clinical staff can delete legacy photos"
  ON public.legacy_history_photos FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'medico', 'enfermera')
    )
  );

-- =====================================================
-- 4. GRANT PERMISSIONS
-- =====================================================

GRANT SELECT, INSERT, DELETE ON public.legacy_history_photos TO authenticated;

-- =====================================================
-- 5. VERIFICATION
-- =====================================================

DO $$
BEGIN
  -- Verify table exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'legacy_history_photos'
  ) THEN
    RAISE EXCEPTION 'Table legacy_history_photos was not created';
  END IF;

  -- Verify RLS is enabled
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename = 'legacy_history_photos'
    AND rowsecurity = true
  ) THEN
    RAISE EXCEPTION 'RLS is not enabled on legacy_history_photos';
  END IF;

  RAISE NOTICE 'Migration 042_legacy_history_photos completed successfully';
END $$;

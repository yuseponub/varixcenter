-- Migration: 045_services_categoria.sql
-- Purpose: Add categoria field to services table for treatment plan organization
-- Created: 2026-02-02

-- ============================================
-- 1. CREATE ENUM TYPE FOR SERVICE CATEGORIES
-- ============================================

CREATE TYPE public.service_categoria AS ENUM (
  'examen_lab',      -- Exámenes de Laboratorio Vascular
  'procedimiento',   -- Procedimientos Terapéuticos
  'sesiones',        -- Tratamientos por Sesiones (Escleroterapia, Láser Superficial)
  'insumo'           -- Insumos (medias, anestésicos, etc.)
);

COMMENT ON TYPE public.service_categoria IS 'Categorías de servicios para organización del plan de tratamiento';

-- ============================================
-- 2. ADD CATEGORIA COLUMN TO SERVICES
-- ============================================

ALTER TABLE public.services
ADD COLUMN categoria public.service_categoria NOT NULL DEFAULT 'procedimiento';

COMMENT ON COLUMN public.services.categoria IS 'Categoría del servicio para agrupación en plan de tratamiento';

-- ============================================
-- 3. INDEX FOR CATEGORY FILTERING
-- ============================================

CREATE INDEX idx_services_categoria ON public.services(categoria) WHERE activo = true;

-- ============================================
-- 4. VERIFICATION
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'services'
    AND column_name = 'categoria'
  ) THEN
    RAISE EXCEPTION 'Column categoria not added to services table';
  END IF;
END;
$$;

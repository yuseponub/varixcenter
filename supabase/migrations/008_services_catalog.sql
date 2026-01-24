-- Migration: 008_services_catalog.sql
-- Purpose: Services catalog with variable price support for medical procedures
-- Phase: 04-payments-core, Plan: 01
-- Created: 2026-01-24

-- ============================================
-- 1. SERVICES TABLE
-- ============================================

CREATE TABLE public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Service identification
  nombre VARCHAR(100) NOT NULL UNIQUE,
  descripcion TEXT,

  -- Pricing
  precio_base DECIMAL(12,2) NOT NULL,
  precio_variable BOOLEAN NOT NULL DEFAULT false,
  precio_minimo DECIMAL(12,2),
  precio_maximo DECIMAL(12,2),

  -- Status (soft delete)
  activo BOOLEAN NOT NULL DEFAULT true,

  -- Audit
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- ============================================
  -- CONSTRAINTS
  -- ============================================

  -- Price must be non-negative
  CONSTRAINT precio_base_positive CHECK (precio_base >= 0),

  -- If variable pricing is enabled, min and max must be set
  CONSTRAINT variable_price_requires_range CHECK (
    precio_variable = false OR (precio_minimo IS NOT NULL AND precio_maximo IS NOT NULL)
  ),

  -- When variable, base price must be within min/max range
  CONSTRAINT variable_price_in_range CHECK (
    precio_variable = false OR (precio_minimo <= precio_base AND precio_base <= precio_maximo)
  ),

  -- Min must be less than or equal to max
  CONSTRAINT min_less_than_max CHECK (
    precio_minimo IS NULL OR precio_maximo IS NULL OR precio_minimo <= precio_maximo
  )
);

-- Table comments
COMMENT ON TABLE public.services IS 'Catalogo de servicios medicos con soporte de precios variables';
COMMENT ON COLUMN public.services.precio_variable IS 'Si es true, el precio puede ajustarse entre precio_minimo y precio_maximo al momento del pago';
COMMENT ON COLUMN public.services.precio_minimo IS 'Precio minimo permitido cuando precio_variable = true';
COMMENT ON COLUMN public.services.precio_maximo IS 'Precio maximo permitido cuando precio_variable = true';
COMMENT ON COLUMN public.services.activo IS 'Soft delete: false significa que el servicio ya no se ofrece';

-- ============================================
-- 2. INDEXES
-- ============================================

-- Partial index for active services (common query pattern)
CREATE INDEX idx_services_activo ON public.services(activo) WHERE activo = true;

-- Name search index
CREATE INDEX idx_services_nombre ON public.services(nombre);

-- ============================================
-- 3. UPDATED_AT TRIGGER
-- ============================================

CREATE TRIGGER tr_services_updated_at
  BEFORE UPDATE ON public.services
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- ============================================
-- 4. ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view services (service catalog is public within clinic)
CREATE POLICY "Authenticated users can view services"
  ON public.services FOR SELECT
  TO authenticated
  USING (true);

-- Only admin can create services
CREATE POLICY "Admin can create services"
  ON public.services FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
  );

-- Only admin can update services
CREATE POLICY "Admin can update services"
  ON public.services FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
  );

-- NO DELETE policy - use activo = false for soft delete
-- This is intentional: services with historical payments should not be deleted

-- ============================================
-- 5. AUDIT LOGGING
-- ============================================

-- Enable audit for services table (uses function from 002_audit_infrastructure.sql)
SELECT enable_audit_for_table('public.services');

-- ============================================
-- 6. GRANT PERMISSIONS
-- ============================================

GRANT SELECT, INSERT, UPDATE ON public.services TO authenticated;

-- ============================================
-- 7. VERIFICATION
-- ============================================

-- Verify RLS is enabled
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename = 'services'
    AND rowsecurity = true
  ) THEN
    RAISE EXCEPTION 'RLS not enabled on services table';
  END IF;
END;
$$;

-- ============================================
-- 8. SEED DATA (COMMENTED - UNCOMMENT FOR TESTING)
-- ============================================

/*
-- Example services for Varix Clinic (vascular medicine)
INSERT INTO public.services (nombre, descripcion, precio_base, precio_variable, precio_minimo, precio_maximo, activo) VALUES
  ('Consulta inicial', 'Evaluacion inicial del paciente con historia clinica completa', 150000.00, false, NULL, NULL, true),
  ('Consulta de control', 'Seguimiento y control post-procedimiento', 80000.00, false, NULL, NULL, true),
  ('Escleroterapia simple', 'Tratamiento de varices pequenas con agente esclerosante', 250000.00, true, 200000.00, 350000.00, true),
  ('Escleroterapia con espuma', 'Tratamiento de varices medianas con espuma esclerosante', 400000.00, true, 350000.00, 500000.00, true),
  ('Doppler venoso unilateral', 'Ecografia Doppler de miembro inferior (una pierna)', 180000.00, false, NULL, NULL, true),
  ('Doppler venoso bilateral', 'Ecografia Doppler de ambos miembros inferiores', 300000.00, false, NULL, NULL, true),
  ('Laser endovenoso', 'Ablacion laser de vena safena', 2500000.00, true, 2000000.00, 3000000.00, true),
  ('Radiofrecuencia endovenosa', 'Ablacion con radiofrecuencia de vena safena', 2800000.00, true, 2300000.00, 3300000.00, true),
  ('Flebectomia ambulatoria', 'Extraccion quirurgica de varices tributarias', 800000.00, true, 600000.00, 1200000.00, true),
  ('Medias de compresion', 'Medias de compresion graduada terapeuticas', 120000.00, true, 80000.00, 200000.00, true);
*/

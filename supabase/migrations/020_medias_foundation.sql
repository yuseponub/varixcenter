-- Migration: 020_medias_foundation.sql
-- Purpose: Products catalog and stock movements schema for medias de compresion
-- Phase: 10-medias-foundation, Plan: 01
-- Created: 2026-01-25
-- Depends on: 002_audit_infrastructure.sql (audit functions), 001_rbac_foundation.sql (user_roles)

-- ============================================================================
-- VARIX-MEDIAS FOUNDATION SCHEMA
-- ============================================================================
-- This migration establishes:
-- 1. medias_products - Product catalog with dual stock tracking
-- 2. medias_stock_movements - Immutable stock movement ledger
--
-- Core principle: Dual stock columns (stock_normal + stock_devoluciones) for audit clarity
-- All stock movements are immutable - history cannot be altered
-- ============================================================================

-- ============================================================================
-- 1. ENUM TYPES
-- ============================================================================

-- Product type (leg coverage)
CREATE TYPE public.medias_tipo AS ENUM ('Muslo', 'Panty', 'Rodilla');

-- Size options
CREATE TYPE public.medias_talla AS ENUM ('M', 'L', 'XL', 'XXL');

-- Movement types for stock ledger
CREATE TYPE public.medias_movement_type AS ENUM (
  'compra',           -- Stock received from supplier
  'venta',            -- Stock sold to customer
  'devolucion',       -- Customer return (goes to stock_devoluciones)
  'ajuste_entrada',   -- Manual adjustment (+)
  'ajuste_salida',    -- Manual adjustment (-)
  'transferencia'     -- Transfer between stock_normal and stock_devoluciones
);

-- ============================================================================
-- 2. MEDIAS_PRODUCTS TABLE
-- ============================================================================

CREATE TABLE public.medias_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Product identification
  tipo public.medias_tipo NOT NULL,
  talla public.medias_talla NOT NULL,
  codigo VARCHAR(20) NOT NULL,

  -- Pricing
  precio DECIMAL(12,2) NOT NULL,

  -- Dual stock tracking
  stock_normal INTEGER NOT NULL DEFAULT 0,
  stock_devoluciones INTEGER NOT NULL DEFAULT 0,

  -- Status (soft delete)
  activo BOOLEAN NOT NULL DEFAULT true,

  -- Audit timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- ============================================================================
  -- CONSTRAINTS
  -- ============================================================================

  -- Unique code
  CONSTRAINT medias_products_codigo_unique UNIQUE (codigo),

  -- Only one product per type/size combination
  CONSTRAINT medias_products_tipo_talla_unique UNIQUE (tipo, talla),

  -- Stock must be non-negative
  CONSTRAINT medias_products_stock_normal_positive CHECK (stock_normal >= 0),
  CONSTRAINT medias_products_stock_devoluciones_positive CHECK (stock_devoluciones >= 0),

  -- Price must be positive
  CONSTRAINT medias_products_precio_positive CHECK (precio > 0)
);

-- Table comments
COMMENT ON TABLE public.medias_products IS 'Catalogo de medias de compresion con stock dual (normal + devoluciones)';
COMMENT ON COLUMN public.medias_products.tipo IS 'Tipo de media: Muslo, Panty, Rodilla';
COMMENT ON COLUMN public.medias_products.talla IS 'Talla: M, L, XL, XXL';
COMMENT ON COLUMN public.medias_products.codigo IS 'Codigo unico del producto (codigo proveedor)';
COMMENT ON COLUMN public.medias_products.precio IS 'Precio de venta en pesos colombianos';
COMMENT ON COLUMN public.medias_products.stock_normal IS 'Stock disponible de producto nuevo';
COMMENT ON COLUMN public.medias_products.stock_devoluciones IS 'Stock de producto devuelto (separado para trazabilidad)';
COMMENT ON COLUMN public.medias_products.activo IS 'Soft delete: false significa producto descontinuado';

-- ============================================================================
-- 3. INDEXES FOR MEDIAS_PRODUCTS
-- ============================================================================

-- Partial index for active products (common query pattern)
CREATE INDEX idx_medias_products_activo ON public.medias_products(activo) WHERE activo = true;

-- Index for tipo/talla lookups
CREATE INDEX idx_medias_products_tipo_talla ON public.medias_products(tipo, talla);

-- ============================================================================
-- 4. UPDATED_AT TRIGGER FOR MEDIAS_PRODUCTS
-- ============================================================================

CREATE TRIGGER tr_medias_products_updated_at
  BEFORE UPDATE ON public.medias_products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- ============================================================================
-- 5. MEDIAS_STOCK_MOVEMENTS TABLE (IMMUTABLE LEDGER)
-- ============================================================================

CREATE TABLE public.medias_stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Product reference
  product_id UUID NOT NULL REFERENCES public.medias_products(id),

  -- Movement details
  tipo public.medias_movement_type NOT NULL,
  cantidad INTEGER NOT NULL,

  -- Stock snapshot before movement
  stock_normal_antes INTEGER NOT NULL,
  stock_devoluciones_antes INTEGER NOT NULL,

  -- Stock snapshot after movement
  stock_normal_despues INTEGER NOT NULL,
  stock_devoluciones_despues INTEGER NOT NULL,

  -- Reference to related entity (sale, purchase, etc)
  referencia_id UUID,
  referencia_tipo VARCHAR(50),

  -- Justification for adjustments
  notas TEXT,

  -- Audit
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- NO updated_at - this table is IMMUTABLE

  -- ============================================================================
  -- CONSTRAINTS
  -- ============================================================================

  -- Quantity must be positive
  CONSTRAINT medias_stock_movements_cantidad_positive CHECK (cantidad > 0)
);

-- Table comments
COMMENT ON TABLE public.medias_stock_movements IS 'Ledger inmutable de movimientos de stock - NO se puede modificar ni eliminar';
COMMENT ON COLUMN public.medias_stock_movements.tipo IS 'Tipo de movimiento: compra, venta, devolucion, ajuste_entrada, ajuste_salida, transferencia';
COMMENT ON COLUMN public.medias_stock_movements.cantidad IS 'Cantidad del movimiento (siempre positivo)';
COMMENT ON COLUMN public.medias_stock_movements.stock_normal_antes IS 'Snapshot de stock_normal antes del movimiento';
COMMENT ON COLUMN public.medias_stock_movements.stock_devoluciones_antes IS 'Snapshot de stock_devoluciones antes del movimiento';
COMMENT ON COLUMN public.medias_stock_movements.stock_normal_despues IS 'Snapshot de stock_normal despues del movimiento';
COMMENT ON COLUMN public.medias_stock_movements.stock_devoluciones_despues IS 'Snapshot de stock_devoluciones despues del movimiento';
COMMENT ON COLUMN public.medias_stock_movements.referencia_id IS 'ID de la entidad relacionada (venta_id, compra_id, etc)';
COMMENT ON COLUMN public.medias_stock_movements.referencia_tipo IS 'Tipo de entidad relacionada: venta, compra, ajuste';
COMMENT ON COLUMN public.medias_stock_movements.notas IS 'Notas o justificacion (obligatorio para ajustes)';

-- ============================================================================
-- 6. INDEXES FOR MEDIAS_STOCK_MOVEMENTS
-- ============================================================================

-- Product history queries
CREATE INDEX idx_medias_stock_movements_product ON public.medias_stock_movements(product_id);

-- Reference lookups
CREATE INDEX idx_medias_stock_movements_referencia ON public.medias_stock_movements(referencia_id) WHERE referencia_id IS NOT NULL;

-- Chronological queries
CREATE INDEX idx_medias_stock_movements_created_at ON public.medias_stock_movements(created_at DESC);

-- ============================================================================
-- 7. IMMUTABILITY ENFORCEMENT
-- ============================================================================

-- Function to block UPDATE and DELETE on stock movements
CREATE OR REPLACE FUNCTION public.enforce_stock_movement_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Los movimientos de stock no pueden ser eliminados';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Los movimientos de stock son inmutables';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_stock_movement_immutability() IS
  'Trigger function that enforces immutability on medias_stock_movements - blocks all UPDATE and DELETE';

-- Apply immutability trigger
CREATE TRIGGER tr_stock_movement_immutability
  BEFORE UPDATE OR DELETE ON public.medias_stock_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_stock_movement_immutability();

COMMENT ON TRIGGER tr_stock_movement_immutability ON public.medias_stock_movements IS
  'Immutability trigger: blocks all UPDATE and DELETE operations on stock movements';

-- ============================================================================
-- 8. ROW LEVEL SECURITY - MEDIAS_PRODUCTS
-- ============================================================================

ALTER TABLE public.medias_products ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view products
CREATE POLICY "Authenticated users can view medias products"
  ON public.medias_products FOR SELECT
  TO authenticated
  USING (true);

-- Only admin can manage products (INSERT, UPDATE, DELETE)
CREATE POLICY "Admin can manage medias products"
  ON public.medias_products FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- ============================================================================
-- 9. ROW LEVEL SECURITY - MEDIAS_STOCK_MOVEMENTS
-- ============================================================================

ALTER TABLE public.medias_stock_movements ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view stock movements
CREATE POLICY "Authenticated users can view stock movements"
  ON public.medias_stock_movements FOR SELECT
  TO authenticated
  USING (true);

-- Authenticated users can insert stock movements (role-specific validation in application layer)
CREATE POLICY "Authenticated users can insert stock movements"
  ON public.medias_stock_movements FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

-- No UPDATE or DELETE policies - immutability trigger handles those

-- ============================================================================
-- 10. AUDIT LOGGING
-- ============================================================================

-- Enable audit for both tables (uses function from 002_audit_infrastructure.sql)
SELECT enable_audit_for_table('public.medias_products');
SELECT enable_audit_for_table('public.medias_stock_movements');

-- ============================================================================
-- 11. GRANT PERMISSIONS
-- ============================================================================

-- Products: authenticated can SELECT, INSERT, UPDATE (RLS controls actual access)
GRANT SELECT, INSERT, UPDATE ON public.medias_products TO authenticated;

-- Stock movements: authenticated can SELECT and INSERT (no UPDATE or DELETE)
GRANT SELECT, INSERT ON public.medias_stock_movements TO authenticated;

-- ============================================================================
-- 12. SEED DATA - 11 PRODUCTS (CAT-05)
-- ============================================================================

INSERT INTO public.medias_products (tipo, talla, codigo, precio, stock_normal, stock_devoluciones, activo) VALUES
  ('Muslo', 'M',   '74113', 175000, 0, 0, true),
  ('Muslo', 'L',   '74114', 175000, 0, 0, true),
  ('Muslo', 'XL',  '74115', 175000, 0, 0, true),
  ('Muslo', 'XXL', '74116', 175000, 0, 0, true),
  ('Panty', 'M',   '75406', 190000, 0, 0, true),
  ('Panty', 'L',   '75407', 190000, 0, 0, true),
  ('Panty', 'XL',  '75408', 190000, 0, 0, true),
  ('Panty', 'XXL', '75409', 190000, 0, 0, true),
  ('Rodilla', 'M', '79321', 130000, 0, 0, true),
  ('Rodilla', 'L', '79322', 130000, 0, 0, true),
  ('Rodilla', 'XL','79323', 130000, 0, 0, true);

-- ============================================================================
-- 13. VERIFICATION
-- ============================================================================

DO $$
DECLARE
  v_products_count INTEGER;
  v_has_stock_columns BOOLEAN;
  v_has_immutability_trigger BOOLEAN;
  v_rls_products BOOLEAN;
  v_rls_movements BOOLEAN;
BEGIN
  -- Verify product count
  SELECT COUNT(*) INTO v_products_count FROM public.medias_products;
  IF v_products_count != 11 THEN
    RAISE EXCEPTION 'Expected 11 products, found %', v_products_count;
  END IF;

  -- Verify dual stock columns exist
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'medias_products'
    AND column_name = 'stock_normal'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'medias_products'
    AND column_name = 'stock_devoluciones'
  ) INTO v_has_stock_columns;

  IF NOT v_has_stock_columns THEN
    RAISE EXCEPTION 'medias_products missing stock_normal or stock_devoluciones columns';
  END IF;

  -- Verify immutability trigger exists
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'tr_stock_movement_immutability'
  ) INTO v_has_immutability_trigger;

  IF NOT v_has_immutability_trigger THEN
    RAISE EXCEPTION 'Immutability trigger not created on medias_stock_movements';
  END IF;

  -- Verify RLS enabled on medias_products
  SELECT rowsecurity INTO v_rls_products
  FROM pg_tables
  WHERE schemaname = 'public' AND tablename = 'medias_products';

  IF NOT v_rls_products THEN
    RAISE EXCEPTION 'RLS not enabled on medias_products';
  END IF;

  -- Verify RLS enabled on medias_stock_movements
  SELECT rowsecurity INTO v_rls_movements
  FROM pg_tables
  WHERE schemaname = 'public' AND tablename = 'medias_stock_movements';

  IF NOT v_rls_movements THEN
    RAISE EXCEPTION 'RLS not enabled on medias_stock_movements';
  END IF;

  -- Verify correct prices
  IF NOT EXISTS (SELECT 1 FROM public.medias_products WHERE tipo = 'Muslo' AND precio = 175000) THEN
    RAISE EXCEPTION 'Muslo products should have precio = 175000';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.medias_products WHERE tipo = 'Panty' AND precio = 190000) THEN
    RAISE EXCEPTION 'Panty products should have precio = 190000';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.medias_products WHERE tipo = 'Rodilla' AND precio = 130000) THEN
    RAISE EXCEPTION 'Rodilla products should have precio = 130000';
  END IF;

  RAISE NOTICE 'Medias foundation verification passed: 11 products, dual stock, immutable movements, RLS enabled';
END $$;

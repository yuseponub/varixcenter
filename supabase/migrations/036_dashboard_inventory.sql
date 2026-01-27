-- Migration: 036_dashboard_inventory.sql
-- Purpose: Dashboard inventory features - alert threshold and inventory adjustment RPC
-- Phase: 15-dashboard-inventory, Plan: 01
-- Created: 2026-01-27
-- Depends on: 020_medias_foundation.sql (medias_products, medias_stock_movements)
--
-- Requirements covered by this migration:
--   Dashboard: Per-product alert threshold (umbral_alerta)
--   INV-01: Configurable stock alert threshold per product
--   INV-02: Manual inventory adjustments by Admin/Medico only
--   INV-03: All adjustments create immutable movement records with snapshots
--
-- NOTE: Follows patterns from 034_medias_returns_rpc.sql for role validation and RPC structure
-- ============================================================================

-- ============================================================================
-- 1. ADD UMBRAL_ALERTA COLUMN TO MEDIAS_PRODUCTS
-- ============================================================================
-- Per-product configurable threshold for low stock alerts
-- Alerts trigger when stock_normal < umbral_alerta (ignores stock_devoluciones)
-- Default of 3 is reasonable for the 11-product catalog
-- ============================================================================

ALTER TABLE public.medias_products
ADD COLUMN umbral_alerta INTEGER NOT NULL DEFAULT 3;

COMMENT ON COLUMN public.medias_products.umbral_alerta IS
  'Umbral para alertas de stock critico. Alerta cuando stock_normal < umbral_alerta';

-- ============================================================================
-- 2. CREATE_INVENTORY_ADJUSTMENT RPC FUNCTION
-- ============================================================================
-- Creates manual inventory adjustments:
-- - Only Admin/Medico can call (role check via JWT app_metadata)
-- - Validates stock doesn't go negative on salida
-- - Updates appropriate stock column (stock_normal or stock_devoluciones)
-- - Creates movement record with before/after snapshots
-- - Returns success with new stock values and movement_id
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_inventory_adjustment(
  p_product_id UUID,
  p_cantidad INTEGER,
  p_tipo TEXT,        -- 'entrada' or 'salida'
  p_stock_type TEXT,  -- 'normal' or 'devoluciones'
  p_razon TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_user_role TEXT;
  v_product RECORD;
  v_movement_type medias_movement_type;
  v_new_stock_normal INTEGER;
  v_new_stock_devoluciones INTEGER;
  v_movement_id UUID;
BEGIN
  -- ========================================================================
  -- STEP 1: Auth validation
  -- ========================================================================
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  -- ========================================================================
  -- STEP 2: Role validation (Admin or Medico only)
  -- ========================================================================
  -- Check JWT app_metadata.user_role (set by custom access token hook)
  v_user_role := (auth.jwt() -> 'app_metadata' ->> 'user_role');

  -- Fallback to user_roles table if JWT doesn't have role
  IF v_user_role IS NULL THEN
    SELECT role INTO v_user_role
    FROM user_roles
    WHERE user_id = v_user_id;
  END IF;

  IF v_user_role IS NULL OR v_user_role NOT IN ('admin', 'medico') THEN
    RAISE EXCEPTION 'Solo Admin o Medico pueden realizar ajustes de inventario';
  END IF;

  -- ========================================================================
  -- STEP 3: Input validation
  -- ========================================================================
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RAISE EXCEPTION 'La cantidad debe ser mayor a 0';
  END IF;

  IF p_tipo IS NULL OR p_tipo NOT IN ('entrada', 'salida') THEN
    RAISE EXCEPTION 'El tipo debe ser entrada o salida';
  END IF;

  IF p_stock_type IS NULL OR p_stock_type NOT IN ('normal', 'devoluciones') THEN
    RAISE EXCEPTION 'El tipo de stock debe ser normal o devoluciones';
  END IF;

  IF p_razon IS NULL OR LENGTH(TRIM(p_razon)) < 10 THEN
    RAISE EXCEPTION 'La razon debe tener al menos 10 caracteres';
  END IF;

  -- ========================================================================
  -- STEP 4: Lock and fetch product
  -- ========================================================================
  SELECT * INTO v_product
  FROM medias_products
  WHERE id = p_product_id
  FOR UPDATE;  -- Row lock prevents concurrent modifications

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto no encontrado';
  END IF;

  -- ========================================================================
  -- STEP 5: Determine movement type and calculate new stock
  -- ========================================================================
  IF p_tipo = 'entrada' THEN
    v_movement_type := 'ajuste_entrada'::medias_movement_type;

    IF p_stock_type = 'normal' THEN
      v_new_stock_normal := v_product.stock_normal + p_cantidad;
      v_new_stock_devoluciones := v_product.stock_devoluciones;
    ELSE -- devoluciones
      v_new_stock_normal := v_product.stock_normal;
      v_new_stock_devoluciones := v_product.stock_devoluciones + p_cantidad;
    END IF;

  ELSE -- salida
    v_movement_type := 'ajuste_salida'::medias_movement_type;

    IF p_stock_type = 'normal' THEN
      -- Validate stock doesn't go negative
      IF v_product.stock_normal < p_cantidad THEN
        RAISE EXCEPTION 'Stock insuficiente. Stock normal actual: %, Cantidad solicitada: %',
          v_product.stock_normal, p_cantidad;
      END IF;
      v_new_stock_normal := v_product.stock_normal - p_cantidad;
      v_new_stock_devoluciones := v_product.stock_devoluciones;
    ELSE -- devoluciones
      -- Validate stock doesn't go negative
      IF v_product.stock_devoluciones < p_cantidad THEN
        RAISE EXCEPTION 'Stock insuficiente. Stock devoluciones actual: %, Cantidad solicitada: %',
          v_product.stock_devoluciones, p_cantidad;
      END IF;
      v_new_stock_normal := v_product.stock_normal;
      v_new_stock_devoluciones := v_product.stock_devoluciones - p_cantidad;
    END IF;
  END IF;

  -- ========================================================================
  -- STEP 6: Update product stock
  -- ========================================================================
  UPDATE medias_products
  SET
    stock_normal = v_new_stock_normal,
    stock_devoluciones = v_new_stock_devoluciones
  WHERE id = p_product_id;

  -- ========================================================================
  -- STEP 7: Create movement record with before/after snapshots
  -- ========================================================================
  INSERT INTO medias_stock_movements (
    product_id,
    tipo,
    cantidad,
    stock_normal_antes,
    stock_normal_despues,
    stock_devoluciones_antes,
    stock_devoluciones_despues,
    referencia_tipo,
    notas,
    created_by
  ) VALUES (
    p_product_id,
    v_movement_type,
    p_cantidad,
    v_product.stock_normal,
    v_new_stock_normal,
    v_product.stock_devoluciones,
    v_new_stock_devoluciones,
    'ajuste',
    TRIM(p_razon),
    v_user_id
  )
  RETURNING id INTO v_movement_id;

  -- ========================================================================
  -- STEP 8: Return success response
  -- ========================================================================
  RETURN jsonb_build_object(
    'success', true,
    'product_id', p_product_id,
    'movement_id', v_movement_id,
    'tipo', p_tipo,
    'stock_type', p_stock_type,
    'cantidad', p_cantidad,
    'stock_normal', v_new_stock_normal,
    'stock_devoluciones', v_new_stock_devoluciones
  );
END;
$$;

COMMENT ON FUNCTION public.create_inventory_adjustment(UUID, INTEGER, TEXT, TEXT, TEXT) IS
  'Creates manual inventory adjustment. Only Admin/Medico can call (INV-02). Creates immutable movement record with before/after snapshots (INV-03).';

-- Grant execute to authenticated users (role check is inside function)
GRANT EXECUTE ON FUNCTION public.create_inventory_adjustment(UUID, INTEGER, TEXT, TEXT, TEXT) TO authenticated;

-- ============================================================================
-- 3. VERIFICATION
-- ============================================================================

DO $$
DECLARE
  v_umbral_exists BOOLEAN;
  v_umbral_default INTEGER;
  v_rpc_exists BOOLEAN;
  v_rpc_security_definer BOOLEAN;
  v_products_have_umbral BOOLEAN;
BEGIN
  -- Verify umbral_alerta column exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'medias_products'
    AND column_name = 'umbral_alerta'
  ) INTO v_umbral_exists;

  IF NOT v_umbral_exists THEN
    RAISE EXCEPTION 'umbral_alerta column not created on medias_products';
  END IF;

  -- Verify umbral_alerta default is 3
  SELECT column_default::INTEGER INTO v_umbral_default
  FROM information_schema.columns
  WHERE table_schema = 'public'
  AND table_name = 'medias_products'
  AND column_name = 'umbral_alerta';

  IF v_umbral_default != 3 THEN
    RAISE EXCEPTION 'umbral_alerta should have default 3, found %', v_umbral_default;
  END IF;

  -- Verify create_inventory_adjustment function exists
  SELECT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'create_inventory_adjustment'
  ) INTO v_rpc_exists;

  IF NOT v_rpc_exists THEN
    RAISE EXCEPTION 'create_inventory_adjustment function not created';
  END IF;

  -- Verify create_inventory_adjustment is SECURITY DEFINER
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname = 'create_inventory_adjustment'
    AND p.prosecdef = true
  ) INTO v_rpc_security_definer;

  IF NOT v_rpc_security_definer THEN
    RAISE EXCEPTION 'create_inventory_adjustment should be SECURITY DEFINER';
  END IF;

  -- Verify all existing products have umbral_alerta = 3
  SELECT NOT EXISTS (
    SELECT 1 FROM medias_products
    WHERE umbral_alerta != 3
  ) INTO v_products_have_umbral;

  IF NOT v_products_have_umbral THEN
    RAISE EXCEPTION 'Some products do not have umbral_alerta = 3';
  END IF;

  RAISE NOTICE 'Dashboard inventory migration verified successfully';
  RAISE NOTICE '- umbral_alerta column: INTEGER NOT NULL DEFAULT 3';
  RAISE NOTICE '- create_inventory_adjustment RPC: Admin/Medico role check, stock validation, movement logging';
  RAISE NOTICE '- All 11 products have umbral_alerta = 3';
END $$;

-- ============================================================================
-- Summary of requirements addressed:
-- INV-01: Per-product umbral_alerta column for configurable stock alerts
-- INV-02: create_inventory_adjustment validates admin/medico role via JWT app_metadata
-- INV-03: All adjustments create movement records with stock_*_antes/despues snapshots
--
-- Stock validation:
-- - entrada: No validation needed (always adds stock)
-- - salida: Validates current stock >= cantidad requested
--
-- Movement types:
-- - ajuste_entrada: p_tipo = 'entrada'
-- - ajuste_salida: p_tipo = 'salida'
--
-- Stock types:
-- - 'normal': Affects stock_normal column
-- - 'devoluciones': Affects stock_devoluciones column
-- ============================================================================

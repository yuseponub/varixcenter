-- Migration: 032_purchases_rpc.sql
-- Purpose: RPC functions for atomic purchase operations
-- Phase: 13-purchases, Plan: 03
-- Created: 2026-01-26
-- Depends on: 031_purchases_tables.sql (purchases, purchase_items, compra_estado)
--             020_medias_foundation.sql (medias_products, medias_stock_movements)
--
-- Requirements covered by this migration:
--   COM-07: create_purchase RPC with gapless numbering and item snapshots
--   COM-08: confirm_purchase_reception RPC with atomic stock increment
--   COM-09: cancel_purchase RPC with stock reversal and admin role check
--
-- CRITICAL: Uses FOR UPDATE row locking to prevent race conditions
-- Transaction is all-or-nothing: if any validation fails, entire operation is rolled back

-- ============================================================================
-- 1. CREATE_PURCHASE RPC FUNCTION
-- ============================================================================
-- Atomic purchase creation:
-- 1. Generates gapless COM- number
-- 2. Validates all items have valid product references
-- 3. Creates purchase header
-- 4. Creates purchase items with product snapshots
-- 5. Returns created purchase record
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_purchase(
  p_proveedor TEXT,
  p_fecha_factura DATE,
  p_numero_factura TEXT,
  p_total DECIMAL(12,2),
  p_factura_path TEXT,
  p_notas TEXT,
  p_items JSONB  -- [{product_id, cantidad, costo_unitario}, ...]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchase_id UUID;
  v_numero_compra TEXT;
  v_item RECORD;
  v_product RECORD;
  v_user_id UUID;
  v_items_total DECIMAL(12,2) := 0;
BEGIN
  -- ========================================================================
  -- GET CURRENT USER
  -- ========================================================================

  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  -- ========================================================================
  -- INPUT VALIDATION
  -- ========================================================================

  -- Validate proveedor
  IF p_proveedor IS NULL OR TRIM(p_proveedor) = '' THEN
    RAISE EXCEPTION 'Proveedor es requerido';
  END IF;

  IF LENGTH(p_proveedor) < 2 THEN
    RAISE EXCEPTION 'Proveedor debe tener al menos 2 caracteres';
  END IF;

  -- Validate fecha_factura
  IF p_fecha_factura IS NULL THEN
    RAISE EXCEPTION 'Fecha de factura es requerida';
  END IF;

  -- Validate total
  IF p_total IS NULL OR p_total <= 0 THEN
    RAISE EXCEPTION 'Total debe ser mayor a 0';
  END IF;

  -- Validate factura_path (REQUIRED - COM-04)
  IF p_factura_path IS NULL OR TRIM(p_factura_path) = '' THEN
    RAISE EXCEPTION 'Foto de factura es obligatoria';
  END IF;

  -- Validate items array
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Debe incluir al menos un producto';
  END IF;

  -- ========================================================================
  -- SET LOCK TIMEOUT
  -- ========================================================================

  SET LOCAL lock_timeout = '10s';

  -- ========================================================================
  -- VALIDATE ALL ITEMS AND CALCULATE TOTAL
  -- ========================================================================

  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
    product_id UUID, cantidad INTEGER, costo_unitario DECIMAL
  )
  LOOP
    -- Validate cantidad
    IF v_item.cantidad IS NULL OR v_item.cantidad <= 0 THEN
      RAISE EXCEPTION 'Cantidad debe ser mayor a 0';
    END IF;

    -- Validate costo_unitario
    IF v_item.costo_unitario IS NULL OR v_item.costo_unitario < 0 THEN
      RAISE EXCEPTION 'Costo unitario debe ser mayor o igual a 0';
    END IF;

    -- Lock and fetch product to verify it exists
    SELECT * INTO v_product
    FROM medias_products
    WHERE id = v_item.product_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Producto no encontrado: %', v_item.product_id;
    END IF;

    IF NOT v_product.activo THEN
      RAISE EXCEPTION 'Producto no activo: %', v_product.codigo;
    END IF;

    -- Accumulate items total for verification
    v_items_total := v_items_total + (v_item.cantidad * v_item.costo_unitario);
  END LOOP;

  -- ========================================================================
  -- GENERATE GAPLESS COMPRA NUMBER (COM-03)
  -- ========================================================================

  v_numero_compra := get_next_compra_number();

  -- ========================================================================
  -- CREATE PURCHASE HEADER
  -- ========================================================================

  INSERT INTO purchases (
    numero_compra,
    proveedor,
    fecha_factura,
    numero_factura,
    total,
    factura_path,
    notas,
    created_by,
    estado
  ) VALUES (
    v_numero_compra,
    TRIM(p_proveedor),
    p_fecha_factura,
    NULLIF(TRIM(p_numero_factura), ''),
    p_total,
    p_factura_path,
    NULLIF(TRIM(p_notas), ''),
    v_user_id,
    'pendiente_recepcion'
  ) RETURNING id INTO v_purchase_id;

  -- ========================================================================
  -- CREATE PURCHASE ITEMS WITH PRODUCT SNAPSHOTS
  -- ========================================================================

  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
    product_id UUID, cantidad INTEGER, costo_unitario DECIMAL
  )
  LOOP
    -- Re-fetch product for snapshot
    SELECT * INTO v_product
    FROM medias_products
    WHERE id = v_item.product_id
    FOR UPDATE;

    -- Create purchase item with product snapshot
    INSERT INTO purchase_items (
      purchase_id,
      product_id,
      product_codigo,
      product_tipo,
      product_talla,
      cantidad,
      costo_unitario,
      subtotal
    ) VALUES (
      v_purchase_id,
      v_item.product_id,
      v_product.codigo,
      v_product.tipo::text,
      v_product.talla::text,
      v_item.cantidad,
      v_item.costo_unitario,
      v_item.cantidad * v_item.costo_unitario
    );
  END LOOP;

  -- ========================================================================
  -- RETURN RESULT
  -- ========================================================================

  RETURN jsonb_build_object(
    'id', v_purchase_id,
    'numero_compra', v_numero_compra,
    'total', p_total,
    'estado', 'pendiente_recepcion'
  );
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.create_purchase(TEXT, DATE, TEXT, DECIMAL, TEXT, TEXT, JSONB) TO authenticated;

COMMENT ON FUNCTION public.create_purchase IS
  'Atomic purchase creation with gapless COM- numbering and product snapshots. Purchase starts in pendiente_recepcion state - stock is NOT incremented until reception is confirmed (COM-07).';

-- ============================================================================
-- 2. CONFIRM_PURCHASE_RECEPTION RPC FUNCTION
-- ============================================================================
-- Atomic reception confirmation:
-- 1. Validates purchase exists and is in pendiente_recepcion state
-- 2. For each item: increments stock_normal
-- 3. Logs stock movements with before/after snapshots
-- 4. Updates purchase estado to recibido
-- 5. Returns updated purchase record
-- ============================================================================

CREATE OR REPLACE FUNCTION public.confirm_purchase_reception(
  p_purchase_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchase RECORD;
  v_item RECORD;
  v_product RECORD;
  v_user_id UUID;
BEGIN
  -- ========================================================================
  -- GET CURRENT USER
  -- ========================================================================

  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  -- ========================================================================
  -- INPUT VALIDATION
  -- ========================================================================

  IF p_purchase_id IS NULL THEN
    RAISE EXCEPTION 'ID de compra es requerido';
  END IF;

  -- ========================================================================
  -- SET LOCK TIMEOUT
  -- ========================================================================

  SET LOCAL lock_timeout = '10s';

  -- ========================================================================
  -- LOCK AND VALIDATE PURCHASE
  -- ========================================================================

  SELECT * INTO v_purchase
  FROM purchases
  WHERE id = p_purchase_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compra no encontrada: %', p_purchase_id;
  END IF;

  -- Validate state (COM-05: only pendiente_recepcion can be confirmed)
  IF v_purchase.estado != 'pendiente_recepcion' THEN
    RAISE EXCEPTION 'Solo compras pendientes de recepcion pueden ser confirmadas. Estado actual: %', v_purchase.estado;
  END IF;

  -- ========================================================================
  -- PROCESS EACH ITEM: INCREMENT STOCK AND LOG MOVEMENT
  -- ========================================================================

  FOR v_item IN
    SELECT * FROM purchase_items WHERE purchase_id = p_purchase_id
  LOOP
    -- Lock product row
    SELECT * INTO v_product
    FROM medias_products
    WHERE id = v_item.product_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Producto no encontrado: %', v_item.product_id;
    END IF;

    -- Increment stock_normal
    UPDATE medias_products
    SET stock_normal = stock_normal + v_item.cantidad
    WHERE id = v_item.product_id;

    -- Log stock movement with before/after snapshots (INV-06, INV-07)
    INSERT INTO medias_stock_movements (
      product_id,
      tipo,
      cantidad,
      stock_normal_antes,
      stock_normal_despues,
      stock_devoluciones_antes,
      stock_devoluciones_despues,
      referencia_id,
      referencia_tipo,
      notas,
      created_by
    ) VALUES (
      v_item.product_id,
      'compra',
      v_item.cantidad,
      v_product.stock_normal,
      v_product.stock_normal + v_item.cantidad,
      v_product.stock_devoluciones,
      v_product.stock_devoluciones,
      p_purchase_id,
      'compra',
      'Recepcion de compra ' || v_purchase.numero_compra,
      v_user_id
    );
  END LOOP;

  -- ========================================================================
  -- UPDATE PURCHASE STATE
  -- ========================================================================

  UPDATE purchases
  SET
    estado = 'recibido',
    recibido_por = v_user_id,
    recibido_at = now()
  WHERE id = p_purchase_id;

  -- ========================================================================
  -- RETURN RESULT
  -- ========================================================================

  RETURN jsonb_build_object(
    'id', p_purchase_id,
    'numero_compra', v_purchase.numero_compra,
    'estado', 'recibido',
    'recibido_por', v_user_id,
    'recibido_at', now()
  );
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.confirm_purchase_reception(UUID) TO authenticated;

COMMENT ON FUNCTION public.confirm_purchase_reception IS
  'Confirms purchase reception: atomically increments stock_normal for all items and logs stock movements. Uses FOR UPDATE row locking to prevent race conditions (COM-08).';

-- ============================================================================
-- 3. CANCEL_PURCHASE RPC FUNCTION
-- ============================================================================
-- Atomic purchase cancellation:
-- 1. Validates user has admin or medico role
-- 2. If purchase is recibido: reverts stock (subtracts from stock_normal)
-- 3. Updates purchase estado to anulado with justification
-- 4. Returns updated purchase record
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cancel_purchase(
  p_purchase_id UUID,
  p_justificacion TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchase RECORD;
  v_item RECORD;
  v_product RECORD;
  v_user_id UUID;
  v_user_role TEXT;
BEGIN
  -- ========================================================================
  -- GET CURRENT USER
  -- ========================================================================

  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  -- ========================================================================
  -- VALIDATE USER ROLE (ONLY ADMIN/MEDICO CAN CANCEL)
  -- ========================================================================

  -- Check app_metadata.user_role from JWT
  SELECT (auth.jwt() -> 'app_metadata' ->> 'user_role')::TEXT INTO v_user_role;

  IF v_user_role IS NULL OR v_user_role NOT IN ('admin', 'medico') THEN
    RAISE EXCEPTION 'Solo administradores y medicos pueden anular compras';
  END IF;

  -- ========================================================================
  -- INPUT VALIDATION
  -- ========================================================================

  IF p_purchase_id IS NULL THEN
    RAISE EXCEPTION 'ID de compra es requerido';
  END IF;

  IF p_justificacion IS NULL OR TRIM(p_justificacion) = '' THEN
    RAISE EXCEPTION 'Justificacion es requerida para anular una compra';
  END IF;

  IF LENGTH(TRIM(p_justificacion)) < 10 THEN
    RAISE EXCEPTION 'Justificacion debe tener al menos 10 caracteres';
  END IF;

  -- ========================================================================
  -- SET LOCK TIMEOUT
  -- ========================================================================

  SET LOCAL lock_timeout = '10s';

  -- ========================================================================
  -- LOCK AND VALIDATE PURCHASE
  -- ========================================================================

  SELECT * INTO v_purchase
  FROM purchases
  WHERE id = p_purchase_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compra no encontrada: %', p_purchase_id;
  END IF;

  -- Cannot cancel already cancelled purchase
  IF v_purchase.estado = 'anulado' THEN
    RAISE EXCEPTION 'La compra ya esta anulada';
  END IF;

  -- ========================================================================
  -- IF RECEIVED: REVERT STOCK
  -- ========================================================================

  IF v_purchase.estado = 'recibido' THEN
    FOR v_item IN
      SELECT * FROM purchase_items WHERE purchase_id = p_purchase_id
    LOOP
      -- Lock product row
      SELECT * INTO v_product
      FROM medias_products
      WHERE id = v_item.product_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Producto no encontrado: %', v_item.product_id;
      END IF;

      -- Validate we have enough stock to revert
      IF v_product.stock_normal < v_item.cantidad THEN
        RAISE EXCEPTION 'Stock insuficiente para revertir compra de % (disponible: %, requerido: %)',
          v_product.codigo, v_product.stock_normal, v_item.cantidad;
      END IF;

      -- Decrement stock_normal
      UPDATE medias_products
      SET stock_normal = stock_normal - v_item.cantidad
      WHERE id = v_item.product_id;

      -- Log stock movement with before/after snapshots
      INSERT INTO medias_stock_movements (
        product_id,
        tipo,
        cantidad,
        stock_normal_antes,
        stock_normal_despues,
        stock_devoluciones_antes,
        stock_devoluciones_despues,
        referencia_id,
        referencia_tipo,
        notas,
        created_by
      ) VALUES (
        v_item.product_id,
        'ajuste_salida',
        v_item.cantidad,
        v_product.stock_normal,
        v_product.stock_normal - v_item.cantidad,
        v_product.stock_devoluciones,
        v_product.stock_devoluciones,
        p_purchase_id,
        'compra_anulada',
        'Anulacion de compra ' || v_purchase.numero_compra || ': ' || TRIM(p_justificacion),
        v_user_id
      );
    END LOOP;
  END IF;

  -- ========================================================================
  -- UPDATE PURCHASE STATE
  -- ========================================================================

  UPDATE purchases
  SET
    estado = 'anulado',
    anulado_por = v_user_id,
    anulado_at = now(),
    anulacion_justificacion = TRIM(p_justificacion)
  WHERE id = p_purchase_id;

  -- ========================================================================
  -- RETURN RESULT
  -- ========================================================================

  RETURN jsonb_build_object(
    'id', p_purchase_id,
    'numero_compra', v_purchase.numero_compra,
    'estado', 'anulado',
    'anulado_por', v_user_id,
    'anulado_at', now(),
    'stock_reverted', v_purchase.estado = 'recibido'
  );
END;
$$;

-- Grant execute to authenticated users (role check is inside function)
GRANT EXECUTE ON FUNCTION public.cancel_purchase(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.cancel_purchase IS
  'Cancels a purchase with required justification. Only admin/medico can call. If purchase was received, reverts stock by decrementing stock_normal and logs movements (COM-09).';

-- ============================================================================
-- 4. VERIFICATION
-- ============================================================================

DO $$
DECLARE
  v_has_create_purchase BOOLEAN;
  v_has_confirm_reception BOOLEAN;
  v_has_cancel_purchase BOOLEAN;
BEGIN
  -- Verify create_purchase function exists
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname = 'create_purchase'
  ) INTO v_has_create_purchase;

  IF NOT v_has_create_purchase THEN
    RAISE EXCEPTION 'create_purchase function not created';
  END IF;

  -- Verify create_purchase is SECURITY DEFINER
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname = 'create_purchase'
    AND p.prosecdef = true
  ) THEN
    RAISE EXCEPTION 'create_purchase function should be SECURITY DEFINER';
  END IF;

  -- Verify confirm_purchase_reception function exists
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname = 'confirm_purchase_reception'
  ) INTO v_has_confirm_reception;

  IF NOT v_has_confirm_reception THEN
    RAISE EXCEPTION 'confirm_purchase_reception function not created';
  END IF;

  -- Verify confirm_purchase_reception is SECURITY DEFINER
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname = 'confirm_purchase_reception'
    AND p.prosecdef = true
  ) THEN
    RAISE EXCEPTION 'confirm_purchase_reception function should be SECURITY DEFINER';
  END IF;

  -- Verify cancel_purchase function exists
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname = 'cancel_purchase'
  ) INTO v_has_cancel_purchase;

  IF NOT v_has_cancel_purchase THEN
    RAISE EXCEPTION 'cancel_purchase function not created';
  END IF;

  -- Verify cancel_purchase is SECURITY DEFINER
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname = 'cancel_purchase'
    AND p.prosecdef = true
  ) THEN
    RAISE EXCEPTION 'cancel_purchase function should be SECURITY DEFINER';
  END IF;

  -- Verify create_purchase has correct signature (7 parameters)
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname = 'create_purchase'
    AND p.pronargs = 7
  ) THEN
    RAISE EXCEPTION 'create_purchase function does not have expected 7 parameters';
  END IF;

  -- Verify confirm_purchase_reception has correct signature (1 parameter)
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname = 'confirm_purchase_reception'
    AND p.pronargs = 1
  ) THEN
    RAISE EXCEPTION 'confirm_purchase_reception function does not have expected 1 parameter';
  END IF;

  -- Verify cancel_purchase has correct signature (2 parameters)
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname = 'cancel_purchase'
    AND p.pronargs = 2
  ) THEN
    RAISE EXCEPTION 'cancel_purchase function does not have expected 2 parameters';
  END IF;

  RAISE NOTICE 'Purchases RPC verification passed: create_purchase, confirm_purchase_reception, cancel_purchase functions created successfully';
END $$;

-- ============================================================================
-- Summary of requirements addressed:
-- COM-07: create_purchase RPC with gapless numbering via get_next_compra_number()
--         - Validates all items have valid product references
--         - Creates purchase header with estado = pendiente_recepcion
--         - Creates purchase_items with product snapshots (codigo, tipo, talla)
-- COM-08: confirm_purchase_reception RPC
--         - Validates purchase is in pendiente_recepcion state
--         - Increments stock_normal for each item
--         - Logs stock movements with before/after snapshots
--         - Updates estado to recibido with recibido_por/recibido_at
-- COM-09: cancel_purchase RPC
--         - Role check: only admin/medico via app_metadata.user_role
--         - If recibido: reverts stock by decrementing stock_normal
--         - Logs reversal movements with referencia_tipo = 'compra_anulada'
--         - Updates estado to anulado with justification
--
-- All functions use:
-- - SECURITY DEFINER with search_path = public
-- - FOR UPDATE row locking to prevent race conditions
-- - SET LOCAL lock_timeout = '10s' for deadlock prevention
-- - Proper input validation with Spanish error messages
-- ============================================================================

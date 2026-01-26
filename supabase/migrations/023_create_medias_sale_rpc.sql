-- Migration: 023_create_medias_sale_rpc.sql
-- Purpose: Atomic sale creation RPC with stock decrement and movement logging
-- Phase: 11-sales-core, Plan: 03
-- Created: 2026-01-26
-- Depends on: 020_medias_foundation.sql (medias_products, medias_stock_movements), 021_medias_sales.sql (sales tables)
--
-- Requirements covered by this migration:
--   VTA-11: Auto decrement stock on sale (stock_normal decremented atomically)
--   VTA-12: Block sale if stock insufficient (with clear error message)
--   INV-06, INV-07: Log stock movement with before/after snapshots
--
-- CRITICAL: Uses FOR UPDATE row locking to prevent race conditions
-- Transaction is all-or-nothing: if any product fails, entire sale is rolled back

-- ============================================================================
-- CREATE_MEDIAS_SALE RPC FUNCTION
-- ============================================================================
-- Atomic sale creation:
-- 1. Validates all products have sufficient stock (with locks)
-- 2. Creates sale header with gapless VTA- number
-- 3. Creates sale items with product snapshots
-- 4. Decrements stock_normal for each product
-- 5. Logs stock movements with before/after snapshots
-- 6. Creates payment methods
-- 7. Returns sale id and numero_venta
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_medias_sale(
  p_items JSONB,              -- [{product_id, quantity}, ...]
  p_methods JSONB,            -- [{metodo, monto, comprobante_path}, ...]
  p_patient_id UUID,          -- nullable (VTA-06: optional patient link)
  p_vendedor_id UUID,         -- required (VTA-07: who made the sale)
  p_receptor_efectivo_id UUID -- nullable (VTA-08: cash receiver if different from seller)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_id UUID;
  v_numero_venta TEXT;
  v_subtotal DECIMAL(12,2) := 0;
  v_total DECIMAL(12,2) := 0;
  v_item RECORD;
  v_method RECORD;
  v_product RECORD;
  v_methods_total DECIMAL(12,2) := 0;
BEGIN
  -- ========================================================================
  -- INPUT VALIDATION
  -- ========================================================================

  -- Validate vendedor_id
  IF p_vendedor_id IS NULL THEN
    RAISE EXCEPTION 'vendedor_id es requerido';
  END IF;

  -- Validate items array
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Debe incluir al menos un producto';
  END IF;

  -- Validate methods array
  IF p_methods IS NULL OR jsonb_array_length(p_methods) = 0 THEN
    RAISE EXCEPTION 'Debe incluir al menos un metodo de pago';
  END IF;

  -- Validate patient exists if provided
  IF p_patient_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM patients WHERE id = p_patient_id) THEN
      RAISE EXCEPTION 'El paciente no existe';
    END IF;
  END IF;

  -- ========================================================================
  -- COMPROBANTE VALIDATION (ANTI-FRAUD - VTA-05)
  -- ========================================================================

  FOR v_method IN SELECT * FROM jsonb_to_recordset(p_methods) AS x(
    metodo TEXT, monto DECIMAL, comprobante_path TEXT
  )
  LOOP
    IF v_method.metodo IN ('tarjeta', 'transferencia', 'nequi')
       AND (v_method.comprobante_path IS NULL OR v_method.comprobante_path = '') THEN
      RAISE EXCEPTION 'Los pagos con % requieren foto del comprobante', v_method.metodo;
    END IF;
  END LOOP;

  -- ========================================================================
  -- SET LOCK TIMEOUT
  -- ========================================================================

  -- Prevent deadlocks under high load
  SET LOCAL lock_timeout = '10s';

  -- ========================================================================
  -- FIRST PASS: VALIDATE ALL ITEMS HAVE SUFFICIENT STOCK
  -- ========================================================================
  -- Critical: Lock each product row with FOR UPDATE to prevent race conditions
  -- If any product has insufficient stock, transaction fails before any changes

  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id UUID, quantity INTEGER)
  LOOP
    -- Validate quantity
    IF v_item.quantity IS NULL OR v_item.quantity <= 0 THEN
      RAISE EXCEPTION 'Cantidad debe ser mayor a 0';
    END IF;

    -- Lock and fetch product
    SELECT * INTO v_product
    FROM medias_products
    WHERE id = v_item.product_id
    FOR UPDATE;  -- Row lock prevents concurrent sales from reading stale stock

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Producto no encontrado: %', v_item.product_id;
    END IF;

    IF NOT v_product.activo THEN
      RAISE EXCEPTION 'Producto no disponible: %', v_product.codigo;
    END IF;

    -- VTA-12: Block if insufficient stock
    IF v_product.stock_normal < v_item.quantity THEN
      RAISE EXCEPTION 'Stock insuficiente para % (disponible: %, solicitado: %)',
        v_product.codigo, v_product.stock_normal, v_item.quantity;
    END IF;

    -- Accumulate subtotal
    v_subtotal := v_subtotal + (v_product.precio * v_item.quantity);
  END LOOP;

  v_total := v_subtotal;  -- No discounts in medias sales

  -- ========================================================================
  -- VALIDATE PAYMENT METHODS TOTAL
  -- ========================================================================

  SELECT COALESCE(SUM(monto), 0)
  INTO v_methods_total
  FROM jsonb_to_recordset(p_methods) AS x(metodo TEXT, monto DECIMAL, comprobante_path TEXT);

  IF ABS(v_methods_total - v_total) > 0.01 THEN
    RAISE EXCEPTION 'La suma de metodos (%) no coincide con total (%)', v_methods_total, v_total;
  END IF;

  -- ========================================================================
  -- GENERATE GAPLESS VENTA NUMBER (VTA-10)
  -- ========================================================================

  v_numero_venta := get_next_venta_number();

  -- ========================================================================
  -- CREATE SALE HEADER
  -- ========================================================================

  INSERT INTO medias_sales (
    numero_venta, patient_id, subtotal, total,
    vendedor_id, receptor_efectivo_id
  ) VALUES (
    v_numero_venta, p_patient_id, v_subtotal, v_total,
    p_vendedor_id, p_receptor_efectivo_id
  ) RETURNING id INTO v_sale_id;

  -- ========================================================================
  -- SECOND PASS: CREATE ITEMS, DECREMENT STOCK, LOG MOVEMENTS
  -- ========================================================================

  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id UUID, quantity INTEGER)
  LOOP
    -- Re-fetch product (still locked from first pass within same transaction)
    SELECT * INTO v_product
    FROM medias_products
    WHERE id = v_item.product_id
    FOR UPDATE;

    -- Create sale item with product snapshots (immutable record)
    INSERT INTO medias_sale_items (
      sale_id, product_id,
      product_codigo, product_tipo, product_talla,
      unit_price, quantity, subtotal
    ) VALUES (
      v_sale_id, v_item.product_id,
      v_product.codigo, v_product.tipo::text, v_product.talla::text,
      v_product.precio, v_item.quantity, v_product.precio * v_item.quantity
    );

    -- VTA-11: Decrement stock_normal
    UPDATE medias_products
    SET stock_normal = stock_normal - v_item.quantity
    WHERE id = v_item.product_id;

    -- INV-06, INV-07: Log stock movement with before/after snapshots
    INSERT INTO medias_stock_movements (
      product_id, tipo, cantidad,
      stock_normal_antes, stock_normal_despues,
      stock_devoluciones_antes, stock_devoluciones_despues,
      referencia_id, referencia_tipo, created_by
    ) VALUES (
      v_item.product_id, 'venta', v_item.quantity,
      v_product.stock_normal, v_product.stock_normal - v_item.quantity,
      v_product.stock_devoluciones, v_product.stock_devoluciones,
      v_sale_id, 'venta', p_vendedor_id
    );
  END LOOP;

  -- ========================================================================
  -- CREATE PAYMENT METHODS
  -- ========================================================================

  FOR v_method IN SELECT * FROM jsonb_to_recordset(p_methods) AS x(
    metodo TEXT, monto DECIMAL, comprobante_path TEXT
  )
  LOOP
    INSERT INTO medias_sale_methods (sale_id, metodo, monto, comprobante_path)
    VALUES (v_sale_id, v_method.metodo::payment_method_type, v_method.monto, v_method.comprobante_path);
  END LOOP;

  -- ========================================================================
  -- RETURN RESULT
  -- ========================================================================

  RETURN jsonb_build_object(
    'id', v_sale_id,
    'numero_venta', v_numero_venta,
    'total', v_total
  );
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.create_medias_sale(JSONB, JSONB, UUID, UUID, UUID) TO authenticated;

COMMENT ON FUNCTION public.create_medias_sale IS
  'Atomic sale creation with stock validation and decrement. Uses FOR UPDATE row locking to prevent race conditions. Creates sale header, items (with product snapshots), and payment methods. Logs all stock movements with before/after snapshots (VTA-11, VTA-12, INV-06, INV-07).';

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
BEGIN
  -- Verify function exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'create_medias_sale'
  ) THEN
    RAISE EXCEPTION 'create_medias_sale function not created';
  END IF;

  -- Verify function has correct signature (5 parameters)
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname = 'create_medias_sale'
    AND p.pronargs = 5
  ) THEN
    RAISE EXCEPTION 'create_medias_sale function does not have expected 5 parameters';
  END IF;

  -- Verify function is SECURITY DEFINER
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname = 'create_medias_sale'
    AND p.prosecdef = true
  ) THEN
    RAISE EXCEPTION 'create_medias_sale function should be SECURITY DEFINER';
  END IF;

  RAISE NOTICE 'create_medias_sale RPC verified successfully';
END $$;

-- ============================================================================
-- Summary of requirements addressed:
-- VTA-11: Stock decrement via UPDATE medias_products SET stock_normal = stock_normal - quantity
-- VTA-12: Stock validation with clear error: 'Stock insuficiente para [codigo] (disponible: X, solicitado: Y)'
-- INV-06, INV-07: Stock movement logging with before/after snapshots
-- Race condition protection: FOR UPDATE row locking on medias_products
-- Atomicity: All operations in single transaction, fails entirely if any product fails
-- ============================================================================

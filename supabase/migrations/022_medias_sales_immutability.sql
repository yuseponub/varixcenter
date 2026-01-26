-- Migration: 022_medias_sales_immutability.sql
-- Purpose: Enforce sales immutability via database trigger and admin delete RPC
-- Phase: 11-sales-core, Plan: 02
-- Created: 2026-01-26
-- Depends on: 021_medias_sales.sql (medias_sales, medias_sale_items, medias_sale_methods tables)
--
-- Requirements covered by this migration:
--   VTA-09: Sales are immutable - cannot UPDATE or DELETE directly
--   VTA-13: Admin delete reverses stock and requires justification
--
-- Pattern: Follows 010_payments_immutability.sql but simpler (no anulacion transition)
-- ============================================================================

-- ============================================================================
-- 1. MEDIAS_SALES IMMUTABILITY ENFORCEMENT
-- ============================================================================
-- This trigger makes fraud IMPOSSIBLE at the database level.
-- Sales CANNOT be updated or deleted - only admin can mark as anulado via RPC.
-- ============================================================================

-- Function to enforce medias_sales immutability
CREATE OR REPLACE FUNCTION public.enforce_medias_sale_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- ========================================================================
  -- RULE 1: DELETE is NEVER allowed directly
  -- ========================================================================
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Las ventas no pueden ser eliminadas directamente. Use eliminar_medias_sale.';
  END IF;

  -- ========================================================================
  -- RULE 2: UPDATE is NEVER allowed (simpler than payments - no estado transition)
  -- The only way to "cancel" a sale is via eliminar_medias_sale RPC which
  -- temporarily disables this trigger.
  -- ========================================================================
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Las ventas son inmutables';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_medias_sale_immutability() IS
  'Enforces medias sales immutability: blocks ALL UPDATE and DELETE. Admin delete uses RPC.';

-- Create trigger on medias_sales table
CREATE TRIGGER tr_medias_sale_immutability
  BEFORE UPDATE OR DELETE ON public.medias_sales
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_medias_sale_immutability();

COMMENT ON TRIGGER tr_medias_sale_immutability ON public.medias_sales IS
  'Immutability trigger: blocks all UPDATE and DELETE. Use eliminar_medias_sale RPC for admin delete.';

-- ============================================================================
-- 2. MEDIAS_SALE_ITEMS IMMUTABILITY ENFORCEMENT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_medias_sale_items_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Los items de venta no pueden ser eliminados';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Los items de venta son inmutables';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_medias_sale_items_immutability() IS
  'Enforces medias sale items immutability: blocks all UPDATE and DELETE';

CREATE TRIGGER tr_medias_sale_items_immutability
  BEFORE UPDATE OR DELETE ON public.medias_sale_items
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_medias_sale_items_immutability();

COMMENT ON TRIGGER tr_medias_sale_items_immutability ON public.medias_sale_items IS
  'Immutability trigger: blocks all UPDATE and DELETE on sale items';

-- ============================================================================
-- 3. MEDIAS_SALE_METHODS IMMUTABILITY ENFORCEMENT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_medias_sale_methods_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Los metodos de pago de venta no pueden ser eliminados';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Los metodos de pago de venta son inmutables';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_medias_sale_methods_immutability() IS
  'Enforces medias sale methods immutability: blocks all UPDATE and DELETE';

CREATE TRIGGER tr_medias_sale_methods_immutability
  BEFORE UPDATE OR DELETE ON public.medias_sale_methods
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_medias_sale_methods_immutability();

COMMENT ON TRIGGER tr_medias_sale_methods_immutability ON public.medias_sale_methods IS
  'Immutability trigger: blocks all UPDATE and DELETE on sale payment methods';

-- ============================================================================
-- 4. RPC FUNCTION: eliminar_medias_sale
-- ============================================================================
-- Safe deletion function for use by admin only
-- - Validates admin role
-- - Validates justificacion length (>= 10 chars)
-- - Reverses stock for all sale items
-- - Logs stock movements with tipo='ajuste_entrada'
-- - Marks sale as 'anulado' with justification
-- ============================================================================

CREATE OR REPLACE FUNCTION public.eliminar_medias_sale(
  p_sale_id UUID,
  p_justificacion TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_user_role TEXT;
  v_sale RECORD;
  v_item RECORD;
  v_product RECORD;
  v_stock_normal_antes INTEGER;
  v_stock_devoluciones_antes INTEGER;
  v_stock_normal_despues INTEGER;
BEGIN
  -- ========================================================================
  -- STEP 1: Validate caller is authenticated
  -- ========================================================================
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  -- ========================================================================
  -- STEP 2: Validate caller has admin role
  -- ========================================================================
  SELECT role INTO v_user_role FROM user_roles WHERE user_id = v_user_id;
  IF v_user_role IS NULL OR v_user_role != 'admin' THEN
    RAISE EXCEPTION 'Solo Admin puede eliminar ventas';
  END IF;

  -- ========================================================================
  -- STEP 3: Validate justificacion (minimum 10 characters)
  -- ========================================================================
  IF p_justificacion IS NULL OR LENGTH(TRIM(p_justificacion)) < 10 THEN
    RAISE EXCEPTION 'La justificacion debe tener al menos 10 caracteres';
  END IF;

  -- ========================================================================
  -- STEP 4: Get sale and verify it exists
  -- ========================================================================
  SELECT * INTO v_sale FROM medias_sales WHERE id = p_sale_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venta no encontrada';
  END IF;

  -- ========================================================================
  -- STEP 5: Verify sale is not already cancelled
  -- ========================================================================
  IF v_sale.estado != 'activo' THEN
    RAISE EXCEPTION 'La venta ya fue anulada';
  END IF;

  -- ========================================================================
  -- STEP 6: Reverse stock for each item
  -- For each item: restore stock_normal and log movement
  -- ========================================================================
  FOR v_item IN
    SELECT * FROM medias_sale_items WHERE sale_id = p_sale_id
  LOOP
    -- Lock product row with FOR UPDATE to prevent race conditions
    SELECT * INTO v_product
    FROM medias_products
    WHERE id = v_item.product_id
    FOR UPDATE;

    -- Capture stock before restoration
    v_stock_normal_antes := v_product.stock_normal;
    v_stock_devoluciones_antes := v_product.stock_devoluciones;
    v_stock_normal_despues := v_product.stock_normal + v_item.quantity;

    -- Restore stock to product
    UPDATE medias_products
    SET stock_normal = stock_normal + v_item.quantity
    WHERE id = v_item.product_id;

    -- Log stock movement with tipo='ajuste_entrada' and referencia_tipo='eliminacion_venta'
    INSERT INTO medias_stock_movements (
      product_id,
      tipo,
      cantidad,
      stock_normal_antes,
      stock_devoluciones_antes,
      stock_normal_despues,
      stock_devoluciones_despues,
      referencia_id,
      referencia_tipo,
      notas,
      created_by
    ) VALUES (
      v_item.product_id,
      'ajuste_entrada',
      v_item.quantity,
      v_stock_normal_antes,
      v_stock_devoluciones_antes,
      v_stock_normal_despues,
      v_stock_devoluciones_antes,  -- stock_devoluciones unchanged
      p_sale_id,
      'eliminacion_venta',
      'Reversion de stock por eliminacion de venta: ' || TRIM(p_justificacion),
      v_user_id
    );
  END LOOP;

  -- ========================================================================
  -- STEP 7: Temporarily disable immutability trigger and update sale
  -- ========================================================================
  ALTER TABLE medias_sales DISABLE TRIGGER tr_medias_sale_immutability;

  UPDATE medias_sales
  SET
    estado = 'anulado',
    eliminado_por = v_user_id,
    eliminado_at = now(),
    eliminacion_justificacion = TRIM(p_justificacion)
  WHERE id = p_sale_id;

  ALTER TABLE medias_sales ENABLE TRIGGER tr_medias_sale_immutability;

  -- ========================================================================
  -- STEP 8: Return success response
  -- ========================================================================
  RETURN jsonb_build_object(
    'success', true,
    'sale_id', p_sale_id,
    'eliminado_por', v_user_id,
    'eliminado_at', now()
  );
END;
$$;

COMMENT ON FUNCTION public.eliminar_medias_sale(UUID, TEXT) IS
  'Admin-only function to cancel a sale with stock reversal. Requires 10+ char justificacion (VTA-09, VTA-13).';

-- Grant execute to authenticated users (role check is inside function)
GRANT EXECUTE ON FUNCTION public.eliminar_medias_sale(UUID, TEXT) TO authenticated;

-- ============================================================================
-- 5. AUDIT TRIGGER FOR MEDIAS_SALES
-- ============================================================================
-- All INSERT and UPDATE (anulacion via RPC) operations are logged to audit_log
-- ============================================================================

CREATE TRIGGER tr_audit_medias_sales
  AFTER INSERT OR UPDATE ON public.medias_sales
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_trigger_func();

COMMENT ON TRIGGER tr_audit_medias_sales ON public.medias_sales IS
  'Audit trigger: logs all sale creation and cancellation to audit_log';

-- ============================================================================
-- 6. VERIFICATION
-- ============================================================================

DO $$
BEGIN
  -- Verify medias_sales immutability trigger exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'tr_medias_sale_immutability'
  ) THEN
    RAISE EXCEPTION 'Immutability trigger not created on medias_sales';
  END IF;

  -- Verify medias_sale_items immutability trigger exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'tr_medias_sale_items_immutability'
  ) THEN
    RAISE EXCEPTION 'Immutability trigger not created on medias_sale_items';
  END IF;

  -- Verify medias_sale_methods immutability trigger exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'tr_medias_sale_methods_immutability'
  ) THEN
    RAISE EXCEPTION 'Immutability trigger not created on medias_sale_methods';
  END IF;

  -- Verify audit trigger exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'tr_audit_medias_sales'
  ) THEN
    RAISE EXCEPTION 'Audit trigger not created on medias_sales';
  END IF;

  -- Verify eliminar_medias_sale function exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'eliminar_medias_sale'
  ) THEN
    RAISE EXCEPTION 'eliminar_medias_sale function not created';
  END IF;

  RAISE NOTICE 'Medias sales immutability enforcement verified successfully';
  RAISE NOTICE '- tr_medias_sale_immutability: blocks UPDATE/DELETE on medias_sales';
  RAISE NOTICE '- tr_medias_sale_items_immutability: blocks UPDATE/DELETE on medias_sale_items';
  RAISE NOTICE '- tr_medias_sale_methods_immutability: blocks UPDATE/DELETE on medias_sale_methods';
  RAISE NOTICE '- tr_audit_medias_sales: logs all changes to audit_log';
  RAISE NOTICE '- eliminar_medias_sale: admin-only delete with stock reversal';
END $$;

-- ============================================================================
-- Summary of VTA requirements addressed:
-- VTA-09: Immutability enforced via triggers (blocks UPDATE/DELETE)
-- VTA-13: Admin delete via eliminar_medias_sale reverses stock to stock_normal
--
-- Stock reversal process:
-- 1. Admin calls eliminar_medias_sale(sale_id, justificacion)
-- 2. Function validates admin role and justificacion
-- 3. For each sale item, stock_normal is restored
-- 4. Stock movements logged with tipo='ajuste_entrada'
-- 5. Sale marked as estado='anulado' with audit fields
-- ============================================================================

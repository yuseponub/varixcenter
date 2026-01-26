-- Migration: 034_medias_returns_rpc.sql
-- Purpose: RPC functions for medias return lifecycle: create, approve, reject
-- Phase: 14-returns-workflow, Plan: 02
-- Created: 2026-01-26
-- Depends on: 033_medias_returns.sql (medias_returns table, get_next_medias_return_number)
--             020_medias_foundation.sql (medias_products, medias_stock_movements)
--             021_medias_sales.sql (medias_sales, medias_sale_items)
--
-- Requirements covered by this migration:
--   DEV-01: Two-phase approval (employee requests via create, Admin/Medico approves/rejects)
--   DEV-02: Partial returns - validates cantidad <= (item quantity - already returned)
--   DEV-03: Product snapshots copied from sale item
--   DEV-10: Approved returns increment stock_devoluciones (NOT stock_normal)
--   DEV-11: Stock movement logged with tipo='devolucion'
--
-- NOTE: Follows patterns from 023_create_medias_sale_rpc.sql (atomic operations, FOR UPDATE)
-- ============================================================================

-- ============================================================================
-- 1. CREATE_MEDIAS_RETURN RPC FUNCTION
-- ============================================================================
-- Creates a return request in 'pendiente' state
-- - Validates sale exists and is active
-- - Validates quantity doesn't exceed available units for return
-- - Generates gapless DEV- number
-- - Any authenticated user can call (no role restriction for creation)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_medias_return(
  p_sale_id UUID,
  p_sale_item_id UUID,
  p_cantidad INTEGER,
  p_motivo TEXT,
  p_metodo_reembolso TEXT,
  p_foto_path TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_sale RECORD;
  v_sale_item RECORD;
  v_already_returned INTEGER;
  v_available_for_return INTEGER;
  v_numero_devolucion TEXT;
  v_monto_devolucion DECIMAL(12,2);
  v_return_id UUID;
BEGIN
  -- ========================================================================
  -- STEP 1: Auth validation
  -- ========================================================================
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  -- ========================================================================
  -- STEP 2: Input validation
  -- ========================================================================
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RAISE EXCEPTION 'La cantidad debe ser mayor a 0';
  END IF;

  -- Validate motivo length (minimum 10 characters for meaningful explanation)
  IF p_motivo IS NULL OR LENGTH(TRIM(p_motivo)) < 10 THEN
    RAISE EXCEPTION 'El motivo debe tener al menos 10 caracteres';
  END IF;

  -- Validate metodo_reembolso
  IF p_metodo_reembolso IS NULL OR p_metodo_reembolso NOT IN ('efectivo', 'cambio_producto') THEN
    RAISE EXCEPTION 'El metodo de reembolso debe ser efectivo o cambio_producto';
  END IF;

  -- ========================================================================
  -- STEP 3: Fetch and validate sale
  -- ========================================================================
  SELECT * INTO v_sale
  FROM medias_sales
  WHERE id = p_sale_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venta no encontrada';
  END IF;

  -- Validate sale is active (cannot return from cancelled sale)
  IF v_sale.estado != 'activo' THEN
    RAISE EXCEPTION 'Solo se pueden devolver productos de ventas activas';
  END IF;

  -- ========================================================================
  -- STEP 4: Fetch and validate sale item
  -- ========================================================================
  SELECT * INTO v_sale_item
  FROM medias_sale_items
  WHERE id = p_sale_item_id AND sale_id = p_sale_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item de venta no encontrado';
  END IF;

  -- ========================================================================
  -- STEP 5: Calculate already returned quantity
  -- ========================================================================
  -- Count items in pendiente or aprobada state (rechazada doesn't count)
  -- This prevents over-returns even if multiple requests are pending
  SELECT COALESCE(SUM(cantidad), 0)
  INTO v_already_returned
  FROM medias_returns
  WHERE sale_item_id = p_sale_item_id
    AND estado IN ('pendiente', 'aprobada');

  -- Calculate available units for return
  v_available_for_return := v_sale_item.quantity - v_already_returned;

  -- ========================================================================
  -- STEP 6: Validate quantity doesn't exceed available
  -- ========================================================================
  IF p_cantidad > v_available_for_return THEN
    RAISE EXCEPTION 'Cantidad excede unidades disponibles para devolucion. Vendidas: %, Ya en devolucion: %, Disponibles: %',
      v_sale_item.quantity, v_already_returned, v_available_for_return;
  END IF;

  -- ========================================================================
  -- STEP 7: Generate return number and calculate refund amount
  -- ========================================================================
  v_numero_devolucion := get_next_medias_return_number();
  v_monto_devolucion := v_sale_item.unit_price * p_cantidad;

  -- ========================================================================
  -- STEP 8: Insert return record
  -- ========================================================================
  INSERT INTO medias_returns (
    numero_devolucion,
    sale_id,
    sale_item_id,
    cantidad,
    -- Product snapshot from sale item (immutable record of what was sold)
    product_codigo,
    product_tipo,
    product_talla,
    monto_devolucion,
    motivo,
    foto_path,
    metodo_reembolso,
    estado,
    solicitante_id
  ) VALUES (
    v_numero_devolucion,
    p_sale_id,
    p_sale_item_id,
    p_cantidad,
    v_sale_item.product_codigo,
    v_sale_item.product_tipo,
    v_sale_item.product_talla,
    v_monto_devolucion,
    TRIM(p_motivo),
    p_foto_path,
    p_metodo_reembolso::reembolso_metodo,
    'pendiente',
    v_user_id
  )
  RETURNING id INTO v_return_id;

  -- ========================================================================
  -- STEP 9: Return success response
  -- ========================================================================
  RETURN jsonb_build_object(
    'success', true,
    'id', v_return_id,
    'numero_devolucion', v_numero_devolucion,
    'monto_devolucion', v_monto_devolucion,
    'cantidad', p_cantidad,
    'estado', 'pendiente'
  );
END;
$$;

COMMENT ON FUNCTION public.create_medias_return(UUID, UUID, INTEGER, TEXT, TEXT, TEXT) IS
  'Creates a return request in pendiente state. Validates quantity against already returned items (DEV-02). Any authenticated user can call (DEV-01).';

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.create_medias_return(UUID, UUID, INTEGER, TEXT, TEXT, TEXT) TO authenticated;

-- ============================================================================
-- 2. APPROVE_MEDIAS_RETURN RPC FUNCTION
-- ============================================================================
-- Approves a pending return:
-- - Only Admin/Medico can call (role check)
-- - Validates return is in 'pendiente' state
-- - Increments stock_devoluciones (NOT stock_normal - per CONTEXT.md)
-- - Creates stock movement with tipo='devolucion'
-- - Updates return estado to 'aprobada'
-- ============================================================================

CREATE OR REPLACE FUNCTION public.approve_medias_return(
  p_return_id UUID,
  p_notas TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_user_role TEXT;
  v_return RECORD;
  v_sale_item RECORD;
  v_product RECORD;
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
  SELECT role INTO v_user_role
  FROM user_roles
  WHERE user_id = v_user_id;

  IF v_user_role IS NULL OR v_user_role NOT IN ('admin', 'medico') THEN
    RAISE EXCEPTION 'Solo Admin o Medico pueden aprobar devoluciones';
  END IF;

  -- ========================================================================
  -- STEP 3: Fetch return and validate exists
  -- ========================================================================
  SELECT * INTO v_return
  FROM medias_returns
  WHERE id = p_return_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Devolucion no encontrada';
  END IF;

  -- ========================================================================
  -- STEP 4: Validate estado is pendiente
  -- ========================================================================
  IF v_return.estado != 'pendiente' THEN
    RAISE EXCEPTION 'Solo se pueden aprobar devoluciones pendientes';
  END IF;

  -- ========================================================================
  -- STEP 5: Get product_id from sale item
  -- ========================================================================
  SELECT product_id INTO v_sale_item
  FROM medias_sale_items
  WHERE id = v_return.sale_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item de venta no encontrado';
  END IF;

  -- ========================================================================
  -- STEP 6: Lock and fetch product for stock update
  -- ========================================================================
  SELECT * INTO v_product
  FROM medias_products
  WHERE id = v_sale_item.product_id
  FOR UPDATE;  -- Row lock prevents concurrent modifications

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto no encontrado';
  END IF;

  -- ========================================================================
  -- STEP 7: Increment stock_devoluciones (NOT stock_normal)
  -- ========================================================================
  -- CRITICAL: Returns go to stock_devoluciones for audit clarity
  -- stock_normal is for new/purchased stock only
  UPDATE medias_products
  SET stock_devoluciones = stock_devoluciones + v_return.cantidad
  WHERE id = v_sale_item.product_id;

  -- ========================================================================
  -- STEP 8: Create stock movement record
  -- ========================================================================
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
    v_sale_item.product_id,
    'devolucion',
    v_return.cantidad,
    v_product.stock_normal,
    v_product.stock_normal,  -- stock_normal unchanged
    v_product.stock_devoluciones,
    v_product.stock_devoluciones + v_return.cantidad,
    p_return_id,
    'devolucion',
    COALESCE(p_notas, v_return.motivo),
    v_user_id
  );

  -- ========================================================================
  -- STEP 9: Update return to aprobada
  -- ========================================================================
  -- Immutability trigger allows estado transition: pendiente -> aprobada
  UPDATE medias_returns
  SET
    estado = 'aprobada',
    aprobador_id = v_user_id,
    notas_aprobador = p_notas
  WHERE id = p_return_id;

  -- ========================================================================
  -- STEP 10: Return success response
  -- ========================================================================
  RETURN jsonb_build_object(
    'success', true,
    'id', p_return_id,
    'numero_devolucion', v_return.numero_devolucion,
    'estado', 'aprobada',
    'stock_devoluciones_nuevo', v_product.stock_devoluciones + v_return.cantidad,
    'aprobado_por', v_user_id
  );
END;
$$;

COMMENT ON FUNCTION public.approve_medias_return(UUID, TEXT) IS
  'Approves a pending return. Only Admin/Medico can call. Increments stock_devoluciones (NOT stock_normal) and creates stock movement (DEV-01, DEV-10, DEV-11).';

-- Grant execute to authenticated users (role check is inside function)
GRANT EXECUTE ON FUNCTION public.approve_medias_return(UUID, TEXT) TO authenticated;

-- ============================================================================
-- 3. REJECT_MEDIAS_RETURN RPC FUNCTION
-- ============================================================================
-- Rejects a pending return:
-- - Only Admin/Medico can call (role check)
-- - Validates return is in 'pendiente' state
-- - Updates estado to 'rechazada' (NO stock change)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reject_medias_return(
  p_return_id UUID,
  p_notas TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_user_role TEXT;
  v_return RECORD;
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
  SELECT role INTO v_user_role
  FROM user_roles
  WHERE user_id = v_user_id;

  IF v_user_role IS NULL OR v_user_role NOT IN ('admin', 'medico') THEN
    RAISE EXCEPTION 'Solo Admin o Medico pueden rechazar devoluciones';
  END IF;

  -- ========================================================================
  -- STEP 3: Fetch return and validate exists
  -- ========================================================================
  SELECT * INTO v_return
  FROM medias_returns
  WHERE id = p_return_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Devolucion no encontrada';
  END IF;

  -- ========================================================================
  -- STEP 4: Validate estado is pendiente
  -- ========================================================================
  IF v_return.estado != 'pendiente' THEN
    RAISE EXCEPTION 'Solo se pueden rechazar devoluciones pendientes';
  END IF;

  -- ========================================================================
  -- STEP 5: Update return to rechazada
  -- ========================================================================
  -- NO stock change - rejected returns don't affect inventory
  -- Immutability trigger allows estado transition: pendiente -> rechazada
  UPDATE medias_returns
  SET
    estado = 'rechazada',
    aprobador_id = v_user_id,
    notas_aprobador = p_notas
  WHERE id = p_return_id;

  -- ========================================================================
  -- STEP 6: Return success response
  -- ========================================================================
  RETURN jsonb_build_object(
    'success', true,
    'id', p_return_id,
    'numero_devolucion', v_return.numero_devolucion,
    'estado', 'rechazada',
    'rechazado_por', v_user_id
  );
END;
$$;

COMMENT ON FUNCTION public.reject_medias_return(UUID, TEXT) IS
  'Rejects a pending return. Only Admin/Medico can call. Changes estado to rechazada WITHOUT affecting stock (DEV-01).';

-- Grant execute to authenticated users (role check is inside function)
GRANT EXECUTE ON FUNCTION public.reject_medias_return(UUID, TEXT) TO authenticated;

-- ============================================================================
-- 4. VERIFICATION
-- ============================================================================

DO $$
BEGIN
  -- Verify create_medias_return function exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'create_medias_return'
  ) THEN
    RAISE EXCEPTION 'create_medias_return function not created';
  END IF;

  -- Verify create_medias_return is SECURITY DEFINER
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname = 'create_medias_return'
    AND p.prosecdef = true
  ) THEN
    RAISE EXCEPTION 'create_medias_return should be SECURITY DEFINER';
  END IF;

  -- Verify approve_medias_return function exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'approve_medias_return'
  ) THEN
    RAISE EXCEPTION 'approve_medias_return function not created';
  END IF;

  -- Verify approve_medias_return is SECURITY DEFINER
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname = 'approve_medias_return'
    AND p.prosecdef = true
  ) THEN
    RAISE EXCEPTION 'approve_medias_return should be SECURITY DEFINER';
  END IF;

  -- Verify reject_medias_return function exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'reject_medias_return'
  ) THEN
    RAISE EXCEPTION 'reject_medias_return function not created';
  END IF;

  -- Verify reject_medias_return is SECURITY DEFINER
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname = 'reject_medias_return'
    AND p.prosecdef = true
  ) THEN
    RAISE EXCEPTION 'reject_medias_return should be SECURITY DEFINER';
  END IF;

  RAISE NOTICE 'Medias returns RPC functions verified successfully';
  RAISE NOTICE '- create_medias_return: any auth user can create, validates quantity (DEV-01, DEV-02)';
  RAISE NOTICE '- approve_medias_return: Admin/Medico only, increments stock_devoluciones (DEV-10, DEV-11)';
  RAISE NOTICE '- reject_medias_return: Admin/Medico only, no stock change';
END $$;

-- ============================================================================
-- Summary of DEV requirements addressed:
-- DEV-01: Two-phase approval (create for all, approve/reject for Admin/Medico)
-- DEV-02: Partial returns validated via already_returned calculation
-- DEV-03: Product snapshots copied from sale_item
-- DEV-10: Approved returns increment stock_devoluciones (NOT stock_normal)
-- DEV-11: Stock movement logged with tipo='devolucion' and referencia_tipo='devolucion'
--
-- Edge cases handled:
-- - Item not found: RAISE EXCEPTION 'Item de venta no encontrado'
-- - Sale anulada: RAISE EXCEPTION 'Solo se pueden devolver productos de ventas activas'
-- - Quantity exceeds available: RAISE EXCEPTION with detailed breakdown
-- - Non-pendiente return: RAISE EXCEPTION 'Solo se pueden aprobar/rechazar devoluciones pendientes'
-- - Non-Admin/Medico: RAISE EXCEPTION 'Solo Admin o Medico pueden aprobar/rechazar devoluciones'
-- ============================================================================

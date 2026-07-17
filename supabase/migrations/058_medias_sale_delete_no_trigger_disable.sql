-- Migration: 058_medias_sale_delete_no_trigger_disable.sql
-- Purpose: eliminar_medias_sale deshabilitaba el trigger de inmutabilidad para
--          TODA la tabla (ALTER TABLE ... DISABLE TRIGGER) durante la
--          transaccion, abriendo una ventana en la que otra sesion podia
--          modificar ventas, ademas de tomar un lock fuerte sobre la tabla.
--          Se reemplaza por un flag transaccional (set_config con is_local =
--          true) que el trigger consulta: la anulacion solo se permite dentro
--          de la transaccion del RPC y solo para la transicion activo->anulado.
-- Depends on: 022_medias_sales_immutability.sql

-- ============================================================================
-- 1. TRIGGER: permitir la transicion activo->anulado solo bajo el flag del RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_medias_sale_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Las ventas no pueden ser eliminadas directamente. Use eliminar_medias_sale.';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Unica excepcion: anulacion via RPC eliminar_medias_sale, que marca el
    -- flag transaccional y solo permite la transicion activo -> anulado.
    IF current_setting('app.allow_medias_sale_anulacion', true) = OLD.id::TEXT
       AND OLD.estado = 'activo'
       AND NEW.estado = 'anulado' THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Las ventas son inmutables';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_medias_sale_immutability() IS
  'Enforces medias sales immutability: blocks UPDATE/DELETE except the activo->anulado transition performed by eliminar_medias_sale (transaction-local flag).';

-- ============================================================================
-- 2. RPC: usar el flag transaccional en lugar de deshabilitar el trigger
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
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT role INTO v_user_role FROM user_roles WHERE user_id = v_user_id;
  IF v_user_role IS NULL OR v_user_role != 'admin' THEN
    RAISE EXCEPTION 'Solo Admin puede eliminar ventas';
  END IF;

  IF p_justificacion IS NULL OR LENGTH(TRIM(p_justificacion)) < 10 THEN
    RAISE EXCEPTION 'La justificacion debe tener al menos 10 caracteres';
  END IF;

  SELECT * INTO v_sale FROM medias_sales WHERE id = p_sale_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venta no encontrada';
  END IF;

  IF v_sale.estado != 'activo' THEN
    RAISE EXCEPTION 'La venta ya fue anulada';
  END IF;

  -- Revertir stock de cada item
  FOR v_item IN
    SELECT * FROM medias_sale_items WHERE sale_id = p_sale_id
  LOOP
    SELECT * INTO v_product
    FROM medias_products
    WHERE id = v_item.product_id
    FOR UPDATE;

    v_stock_normal_antes := v_product.stock_normal;
    v_stock_devoluciones_antes := v_product.stock_devoluciones;
    v_stock_normal_despues := v_product.stock_normal + v_item.quantity;

    UPDATE medias_products
    SET stock_normal = stock_normal + v_item.quantity
    WHERE id = v_item.product_id;

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
      v_stock_devoluciones_antes,
      p_sale_id,
      'eliminacion_venta',
      'Reversion de stock por eliminacion de venta: ' || TRIM(p_justificacion),
      v_user_id
    );
  END LOOP;

  -- Marcar la venta como anulada bajo flag transaccional (is_local = true:
  -- el flag muere al terminar la transaccion; solo autoriza esta fila)
  PERFORM set_config('app.allow_medias_sale_anulacion', p_sale_id::TEXT, true);

  UPDATE medias_sales
  SET
    estado = 'anulado',
    eliminado_por = v_user_id,
    eliminado_at = now(),
    eliminacion_justificacion = TRIM(p_justificacion)
  WHERE id = p_sale_id;

  -- Limpiar el flag inmediatamente (defensa en profundidad)
  PERFORM set_config('app.allow_medias_sale_anulacion', '', true);

  RETURN jsonb_build_object(
    'success', true,
    'sale_id', p_sale_id,
    'eliminado_por', v_user_id,
    'eliminado_at', now()
  );
END;
$$;

COMMENT ON FUNCTION public.eliminar_medias_sale(UUID, TEXT) IS
  'Admin-only function to cancel a sale with stock reversal. Requires 10+ char justificacion. Uses a transaction-local flag instead of disabling the immutability trigger (VTA-09, VTA-13).';

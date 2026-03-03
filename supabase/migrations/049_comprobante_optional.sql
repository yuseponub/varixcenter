-- Migration: 049_comprobante_optional.sql
-- Purpose: Make receipt photo (comprobante) optional for all payment methods
-- Previously required for electronic payments (tarjeta, transferencia, nequi)
-- Now the photo is optional - users can attach it but it is not enforced

-- ============================================================================
-- 1. DROP CONSTRAINTS ON TABLES
-- ============================================================================

ALTER TABLE public.payment_methods
  DROP CONSTRAINT IF EXISTS comprobante_required_for_electronic;

ALTER TABLE public.medias_sale_methods
  DROP CONSTRAINT IF EXISTS comprobante_required_for_electronic;

-- ============================================================================
-- 2. UPDATE create_payment_with_invoice RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_payment_with_invoice(
  p_patient_id UUID,
  p_subtotal DECIMAL,
  p_descuento DECIMAL,
  p_descuento_justificacion TEXT,
  p_total DECIMAL,
  p_created_by UUID,
  p_items JSONB,
  p_methods JSONB,
  p_appointment_service_ids UUID[] DEFAULT NULL,
  p_appointment_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment_id UUID;
  v_invoice_number TEXT;
  v_item JSONB;
  v_method JSONB;
  v_payment_item_id UUID;
  v_items_subtotal DECIMAL := 0;
  v_methods_total DECIMAL := 0;
  v_service_id UUID;
  v_apt_service_id UUID;
BEGIN
  -- ========================================================================
  -- INPUT VALIDATION
  -- ========================================================================

  IF p_patient_id IS NULL THEN
    RAISE EXCEPTION 'patient_id es requerido';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM patients WHERE id = p_patient_id) THEN
    RAISE EXCEPTION 'El paciente no existe';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Debe incluir al menos un servicio';
  END IF;

  IF p_methods IS NULL OR jsonb_array_length(p_methods) = 0 THEN
    RAISE EXCEPTION 'Debe incluir al menos un metodo de pago';
  END IF;

  IF p_appointment_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM appointments WHERE id = p_appointment_id) THEN
      RAISE EXCEPTION 'La cita especificada no existe';
    END IF;
  END IF;

  IF p_appointment_service_ids IS NOT NULL AND array_length(p_appointment_service_ids, 1) > 0 THEN
    FOR v_apt_service_id IN SELECT unnest(p_appointment_service_ids)
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM appointment_services
        WHERE id = v_apt_service_id AND estado_pago = 'pendiente'
      ) THEN
        RAISE EXCEPTION 'Servicio de cita % no existe o ya fue pagado', v_apt_service_id;
      END IF;
    END LOOP;
  END IF;

  -- ========================================================================
  -- TOTALS VALIDATION
  -- ========================================================================

  SELECT COALESCE(SUM((item->>'unit_price')::DECIMAL * (item->>'quantity')::INTEGER), 0)
  INTO v_items_subtotal
  FROM jsonb_array_elements(p_items) AS item;

  IF ABS(v_items_subtotal - p_subtotal) > 0.01 THEN
    RAISE EXCEPTION 'La suma de items (%) no coincide con subtotal (%)', v_items_subtotal, p_subtotal;
  END IF;

  SELECT COALESCE(SUM((method->>'monto')::DECIMAL), 0)
  INTO v_methods_total
  FROM jsonb_array_elements(p_methods) AS method;

  IF ABS(v_methods_total - p_total) > 0.01 THEN
    RAISE EXCEPTION 'La suma de metodos (%) no coincide con total (%)', v_methods_total, p_total;
  END IF;

  -- ========================================================================
  -- DISCOUNT VALIDATION
  -- ========================================================================

  IF p_descuento > 0 AND (p_descuento_justificacion IS NULL OR LENGTH(TRIM(p_descuento_justificacion)) < 5) THEN
    RAISE EXCEPTION 'Los descuentos requieren justificacion (minimo 5 caracteres)';
  END IF;

  -- ========================================================================
  -- ATOMIC PAYMENT CREATION
  -- ========================================================================

  SET LOCAL lock_timeout = '10s';

  v_invoice_number := get_next_invoice_number();

  INSERT INTO payments (
    patient_id,
    numero_factura,
    subtotal,
    descuento,
    descuento_justificacion,
    total,
    created_by,
    appointment_id
  ) VALUES (
    p_patient_id,
    v_invoice_number,
    p_subtotal,
    p_descuento,
    NULLIF(TRIM(p_descuento_justificacion), ''),
    p_total,
    p_created_by,
    p_appointment_id
  )
  RETURNING id INTO v_payment_id;

  -- ========================================================================
  -- INSERT PAYMENT ITEMS AND LINK APPOINTMENT SERVICES
  -- ========================================================================

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO payment_items (
      payment_id,
      service_id,
      service_name,
      unit_price,
      quantity,
      subtotal
    ) VALUES (
      v_payment_id,
      (v_item->>'service_id')::UUID,
      v_item->>'service_name',
      (v_item->>'unit_price')::DECIMAL,
      (v_item->>'quantity')::INTEGER,
      (v_item->>'unit_price')::DECIMAL * (v_item->>'quantity')::INTEGER
    )
    RETURNING id INTO v_payment_item_id;

    IF v_item->>'appointment_service_id' IS NOT NULL THEN
      v_apt_service_id := (v_item->>'appointment_service_id')::UUID;

      IF p_appointment_service_ids IS NOT NULL AND array_length(p_appointment_service_ids, 1) > 0 THEN
        IF NOT v_apt_service_id = ANY(p_appointment_service_ids) THEN
          RAISE EXCEPTION 'appointment_service_id % no esta en la lista permitida', v_apt_service_id;
        END IF;
      END IF;

      UPDATE appointment_services
      SET
        estado_pago = 'pagado',
        payment_item_id = v_payment_item_id,
        updated_at = now()
      WHERE id = v_apt_service_id
        AND estado_pago = 'pendiente';

      IF NOT FOUND THEN
        RAISE EXCEPTION 'No se pudo actualizar el servicio de cita %', v_apt_service_id;
      END IF;
    END IF;
  END LOOP;

  -- ========================================================================
  -- INSERT PAYMENT METHODS
  -- ========================================================================

  FOR v_method IN SELECT * FROM jsonb_array_elements(p_methods)
  LOOP
    INSERT INTO payment_methods (
      payment_id,
      metodo,
      monto,
      comprobante_path
    ) VALUES (
      v_payment_id,
      (v_method->>'metodo')::payment_method_type,
      (v_method->>'monto')::DECIMAL,
      NULLIF(v_method->>'comprobante_path', '')
    );
  END LOOP;

  -- ========================================================================
  -- RETURN RESULT
  -- ========================================================================

  RETURN jsonb_build_object(
    'id', v_payment_id,
    'numero_factura', v_invoice_number
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_payment_with_invoice(UUID, DECIMAL, DECIMAL, TEXT, DECIMAL, UUID, JSONB, JSONB, UUID[], UUID) TO authenticated;

-- ============================================================================
-- 3. UPDATE create_medias_sale RPC (remove comprobante validation)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_medias_sale(
  p_items JSONB,
  p_methods JSONB,
  p_patient_id UUID,
  p_vendedor_id UUID,
  p_receptor_efectivo_id UUID
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
  -- INPUT VALIDATION
  IF p_vendedor_id IS NULL THEN
    RAISE EXCEPTION 'vendedor_id es requerido';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Debe incluir al menos un producto';
  END IF;

  IF p_methods IS NULL OR jsonb_array_length(p_methods) = 0 THEN
    RAISE EXCEPTION 'Debe incluir al menos un metodo de pago';
  END IF;

  IF p_patient_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM patients WHERE id = p_patient_id) THEN
      RAISE EXCEPTION 'El paciente no existe';
    END IF;
  END IF;

  -- LOCK TIMEOUT
  SET LOCAL lock_timeout = '10s';

  -- FIRST PASS: VALIDATE ALL ITEMS HAVE SUFFICIENT STOCK
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id UUID, quantity INTEGER)
  LOOP
    IF v_item.quantity IS NULL OR v_item.quantity <= 0 THEN
      RAISE EXCEPTION 'Cantidad debe ser mayor a 0';
    END IF;

    SELECT * INTO v_product
    FROM medias_products
    WHERE id = v_item.product_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Producto no encontrado: %', v_item.product_id;
    END IF;

    IF NOT v_product.activo THEN
      RAISE EXCEPTION 'Producto no disponible: %', v_product.codigo;
    END IF;

    IF v_product.stock_normal < v_item.quantity THEN
      RAISE EXCEPTION 'Stock insuficiente para % (disponible: %, solicitado: %)',
        v_product.codigo, v_product.stock_normal, v_item.quantity;
    END IF;

    v_subtotal := v_subtotal + (v_product.precio * v_item.quantity);
  END LOOP;

  v_total := v_subtotal;

  -- VALIDATE PAYMENT METHODS TOTAL
  SELECT COALESCE(SUM(monto), 0)
  INTO v_methods_total
  FROM jsonb_to_recordset(p_methods) AS x(metodo TEXT, monto DECIMAL, comprobante_path TEXT);

  IF ABS(v_methods_total - v_total) > 0.01 THEN
    RAISE EXCEPTION 'La suma de metodos (%) no coincide con total (%)', v_methods_total, v_total;
  END IF;

  -- GENERATE GAPLESS VENTA NUMBER
  v_numero_venta := get_next_venta_number();

  -- CREATE SALE HEADER
  INSERT INTO medias_sales (
    numero_venta, patient_id, subtotal, total,
    vendedor_id, receptor_efectivo_id
  ) VALUES (
    v_numero_venta, p_patient_id, v_subtotal, v_total,
    p_vendedor_id, p_receptor_efectivo_id
  ) RETURNING id INTO v_sale_id;

  -- SECOND PASS: CREATE ITEMS, DECREMENT STOCK, LOG MOVEMENTS
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id UUID, quantity INTEGER)
  LOOP
    SELECT * INTO v_product
    FROM medias_products
    WHERE id = v_item.product_id
    FOR UPDATE;

    INSERT INTO medias_sale_items (
      sale_id, product_id,
      product_codigo, product_tipo, product_talla,
      unit_price, quantity, subtotal
    ) VALUES (
      v_sale_id, v_item.product_id,
      v_product.codigo, v_product.tipo::text, v_product.talla::text,
      v_product.precio, v_item.quantity, v_product.precio * v_item.quantity
    );

    UPDATE medias_products
    SET stock_normal = stock_normal - v_item.quantity
    WHERE id = v_item.product_id;

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

  -- CREATE PAYMENT METHODS
  FOR v_method IN SELECT * FROM jsonb_to_recordset(p_methods) AS x(
    metodo TEXT, monto DECIMAL, comprobante_path TEXT
  )
  LOOP
    INSERT INTO medias_sale_methods (sale_id, metodo, monto, comprobante_path)
    VALUES (v_sale_id, v_method.metodo::payment_method_type, v_method.monto, v_method.comprobante_path);
  END LOOP;

  RETURN jsonb_build_object(
    'id', v_sale_id,
    'numero_venta', v_numero_venta,
    'total', v_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_medias_sale(JSONB, JSONB, UUID, UUID, UUID) TO authenticated;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'comprobante_required_for_electronic'
      AND table_name = 'payment_methods'
  ) THEN
    RAISE EXCEPTION 'constraint comprobante_required_for_electronic still exists on payment_methods';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'comprobante_required_for_electronic'
      AND table_name = 'medias_sale_methods'
  ) THEN
    RAISE EXCEPTION 'constraint comprobante_required_for_electronic still exists on medias_sale_methods';
  END IF;

  RAISE NOTICE 'Migration 049: comprobante is now optional for all payment methods';
END $$;

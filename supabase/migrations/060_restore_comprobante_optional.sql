-- Migration: 060_restore_comprobante_optional.sql
-- Purpose: CORRECCION URGENTE. La migracion 056 reconstruyo el RPC de pagos a
--          partir del texto de la 014 y reintrodujo por error la exigencia de
--          foto de comprobante para pagos electronicos, que la 049 ya habia
--          eliminado (la clinica quedo bloqueada para registrar esos pagos).
--          Esta migracion recrea la funcion IGUAL a la 056 (todas las
--          validaciones de precio/total/created_by se conservan) pero SIN el
--          bloque de comprobante obligatorio: la foto vuelve a ser opcional
--          para todos los metodos de pago.
-- Depends on: 056_payment_price_validation.sql, 049_comprobante_optional.sql


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
  p_appointment_id UUID DEFAULT NULL,
  p_nota TEXT DEFAULT NULL
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
  v_apt_service_id UUID;
  v_service RECORD;
  v_unit_price DECIMAL;
  v_floor DECIMAL;
  v_agreed_price DECIMAL;
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

  -- ANTI-FRAUDE: el pago solo puede registrarse a nombre de quien lo crea
  IF auth.uid() IS NOT NULL AND p_created_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'created_by no coincide con el usuario autenticado';
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
  -- PRICE VALIDATION AGAINST CATALOG (ANTI-FRAUDE)
  -- ========================================================================

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_unit_price := (v_item->>'unit_price')::DECIMAL;

    IF v_item->>'appointment_service_id' IS NOT NULL THEN
      -- Precio pactado al agendar: debe cobrarse exactamente ese valor
      SELECT precio_unitario INTO v_agreed_price
      FROM appointment_services
      WHERE id = (v_item->>'appointment_service_id')::UUID;

      IF v_agreed_price IS NULL THEN
        RAISE EXCEPTION 'Servicio de cita % no encontrado', v_item->>'appointment_service_id';
      END IF;

      IF ABS(v_unit_price - v_agreed_price) > 0.01 THEN
        RAISE EXCEPTION 'El precio del servicio (%) no coincide con el precio pactado en la cita (%)',
          v_unit_price, v_agreed_price;
      END IF;
    ELSE
      -- Precio libre: validar contra el catalogo de servicios
      SELECT precio_base, precio_variable, precio_minimo, precio_maximo
      INTO v_service
      FROM services
      WHERE id = (v_item->>'service_id')::UUID;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'El servicio % no existe en el catalogo', v_item->>'service_id';
      END IF;

      -- Piso: precio_minimo para servicios variables, precio_base para fijos
      v_floor := CASE
        WHEN v_service.precio_variable THEN COALESCE(v_service.precio_minimo, 0)
        ELSE v_service.precio_base
      END;

      IF v_unit_price < v_floor - 0.01 THEN
        RAISE EXCEPTION 'El precio (%) esta por debajo del minimo permitido (%) para este servicio. Use el campo descuento con justificacion.',
          v_unit_price, v_floor;
      END IF;

      IF v_service.precio_variable
         AND v_service.precio_maximo IS NOT NULL
         AND v_unit_price > v_service.precio_maximo + 0.01 THEN
        RAISE EXCEPTION 'El precio (%) supera el maximo permitido (%) para este servicio',
          v_unit_price, v_service.precio_maximo;
      END IF;
    END IF;
  END LOOP;

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

  -- ANTI-FRAUDE: total debe ser exactamente subtotal - descuento
  IF p_descuento < 0 OR p_descuento > p_subtotal THEN
    RAISE EXCEPTION 'El descuento (%) es invalido (debe estar entre 0 y el subtotal %)', p_descuento, p_subtotal;
  END IF;

  IF ABS((p_subtotal - p_descuento) - p_total) > 0.01 THEN
    RAISE EXCEPTION 'El total (%) no coincide con subtotal - descuento (%)', p_total, p_subtotal - p_descuento;
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
    appointment_id,
    nota
  ) VALUES (
    p_patient_id,
    v_invoice_number,
    p_subtotal,
    p_descuento,
    NULLIF(TRIM(p_descuento_justificacion), ''),
    p_total,
    p_created_by,
    p_appointment_id,
    NULLIF(TRIM(p_nota), '')
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

  RETURN jsonb_build_object(
    'id', v_payment_id,
    'numero_factura', v_invoice_number
  );
END;
$$;

COMMENT ON FUNCTION public.create_payment_with_invoice IS
  'Atomic payment creation with gapless invoice numbering. Validates prices against services catalog / agreed appointment prices, enforces total = subtotal - descuento and created_by = auth.uid(). Optionally links and marks appointment services as paid.';

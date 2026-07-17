-- Migration: 061_relax_price_validation.sql
-- Purpose: Decision del dueno (17-jul-2026): los precios varian en la practica,
--          asi que se retiran las validaciones server-side de precio agregadas
--          en la 056: piso/techo contra el catalogo, precio exacto en servicios
--          fijos, precio pactado de la cita, y total = subtotal - descuento.
--          SE CONSERVAN: created_by = auth.uid(), suma de items = subtotal,
--          suma de metodos = total, justificacion de descuento, comprobante
--          opcional (060), contadores bloqueados (057) e inmutabilidad.
-- Depends on: 060_restore_comprobante_optional.sql



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
  'Atomic payment creation with gapless invoice numbering. Prices are set by the operator (owner decision 2026-07); enforces created_by = auth.uid(), item/method sum coherence and discount justification. Optionally links and marks appointment services as paid.';

-- Migration: 014_update_payment_rpc.sql
-- Purpose: Extend payment RPC to handle appointment services payment status
-- Phase: 05-appointment-services
-- Created: 2026-01-24
-- Depends on: 012_create_payment_rpc.sql, 013_appointment_services.sql

-- ============================================================================
-- UPDATE PAYMENT CREATION RPC
-- ============================================================================
-- Extends create_payment_with_invoice to:
-- 1. Accept optional p_appointment_service_ids parameter
-- 2. Update appointment_services.estado_pago to 'pagado'
-- 3. Link appointment_services.payment_item_id to the corresponding payment item
-- 4. Optionally set payments.appointment_id for appointment-linked payments
-- ============================================================================

-- Drop the old function first (to change signature)
DROP FUNCTION IF EXISTS public.create_payment_with_invoice(UUID, DECIMAL, DECIMAL, TEXT, DECIMAL, UUID, JSONB, JSONB);

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

  -- Validate patient_id
  IF p_patient_id IS NULL THEN
    RAISE EXCEPTION 'patient_id es requerido';
  END IF;

  -- Validate patient exists
  IF NOT EXISTS (SELECT 1 FROM patients WHERE id = p_patient_id) THEN
    RAISE EXCEPTION 'El paciente no existe';
  END IF;

  -- Validate items array
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Debe incluir al menos un servicio';
  END IF;

  -- Validate methods array
  IF p_methods IS NULL OR jsonb_array_length(p_methods) = 0 THEN
    RAISE EXCEPTION 'Debe incluir al menos un metodo de pago';
  END IF;

  -- Validate appointment_id if provided
  IF p_appointment_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM appointments WHERE id = p_appointment_id) THEN
      RAISE EXCEPTION 'La cita especificada no existe';
    END IF;
  END IF;

  -- Validate appointment_service_ids if provided
  IF p_appointment_service_ids IS NOT NULL AND array_length(p_appointment_service_ids, 1) > 0 THEN
    -- Verify all appointment services exist and are pending
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

  -- Calculate items subtotal and validate it matches p_subtotal
  SELECT COALESCE(SUM((item->>'unit_price')::DECIMAL * (item->>'quantity')::INTEGER), 0)
  INTO v_items_subtotal
  FROM jsonb_array_elements(p_items) AS item;

  IF ABS(v_items_subtotal - p_subtotal) > 0.01 THEN
    RAISE EXCEPTION 'La suma de items (%) no coincide con subtotal (%)', v_items_subtotal, p_subtotal;
  END IF;

  -- Calculate methods total and validate it matches p_total
  SELECT COALESCE(SUM((method->>'monto')::DECIMAL), 0)
  INTO v_methods_total
  FROM jsonb_array_elements(p_methods) AS method;

  IF ABS(v_methods_total - p_total) > 0.01 THEN
    RAISE EXCEPTION 'La suma de metodos (%) no coincide con total (%)', v_methods_total, p_total;
  END IF;

  -- ========================================================================
  -- DISCOUNT VALIDATION
  -- ========================================================================

  -- Validate descuento justification (minimum 5 characters)
  IF p_descuento > 0 AND (p_descuento_justificacion IS NULL OR LENGTH(TRIM(p_descuento_justificacion)) < 5) THEN
    RAISE EXCEPTION 'Los descuentos requieren justificacion (minimo 5 caracteres)';
  END IF;

  -- ========================================================================
  -- COMPROBANTE VALIDATION (ANTI-FRAUD)
  -- ========================================================================

  -- Validate comprobante_path for electronic payments
  FOR v_method IN SELECT * FROM jsonb_array_elements(p_methods)
  LOOP
    IF v_method->>'metodo' IN ('tarjeta', 'transferencia', 'nequi')
       AND (v_method->>'comprobante_path' IS NULL OR v_method->>'comprobante_path' = '') THEN
      RAISE EXCEPTION 'Los pagos con % requieren foto del comprobante', v_method->>'metodo';
    END IF;
  END LOOP;

  -- ========================================================================
  -- ATOMIC PAYMENT CREATION
  -- ========================================================================

  -- Set lock timeout to prevent deadlocks under high load
  SET LOCAL lock_timeout = '10s';

  -- Get next invoice number (this locks the counter row for gapless numbering)
  v_invoice_number := get_next_invoice_number();

  -- Insert payment record
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
    -- Insert the payment item
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

    -- If this item has an associated appointment_service_id, update it
    IF v_item->>'appointment_service_id' IS NOT NULL THEN
      v_apt_service_id := (v_item->>'appointment_service_id')::UUID;

      -- Verify this appointment_service_id is in the allowed list (if list provided)
      IF p_appointment_service_ids IS NOT NULL AND array_length(p_appointment_service_ids, 1) > 0 THEN
        IF NOT v_apt_service_id = ANY(p_appointment_service_ids) THEN
          RAISE EXCEPTION 'appointment_service_id % no esta en la lista permitida', v_apt_service_id;
        END IF;
      END IF;

      -- Update the appointment service to paid status
      UPDATE appointment_services
      SET
        estado_pago = 'pagado',
        payment_item_id = v_payment_item_id,
        updated_at = now()
      WHERE id = v_apt_service_id
        AND estado_pago = 'pendiente';

      -- Verify the update happened
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

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.create_payment_with_invoice(UUID, DECIMAL, DECIMAL, TEXT, DECIMAL, UUID, JSONB, JSONB, UUID[], UUID) TO authenticated;

COMMENT ON FUNCTION public.create_payment_with_invoice IS
  'Atomic payment creation with gapless invoice numbering. Validates all inputs, creates payment/items/methods in single transaction. Optionally links and marks appointment services as paid.';

-- ============================================================================
-- VERIFICATION
-- ============================================================================
DO $$
BEGIN
  -- Verify function exists with new signature
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'create_payment_with_invoice'
      AND array_length(p.proargtypes, 1) = 10  -- Now has 10 parameters
  ) THEN
    RAISE EXCEPTION 'create_payment_with_invoice function not updated with new signature';
  END IF;

  RAISE NOTICE 'Payment creation RPC updated successfully';
END $$;

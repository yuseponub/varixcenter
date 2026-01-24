-- Migration: 012_create_payment_rpc.sql
-- Purpose: Atomic payment creation function with gapless invoice numbering
-- Phase: 04-payments-core, Plan: 08
-- Created: 2026-01-24
-- Depends on: 009_payments_tables.sql, 010_payments_immutability.sql

-- ============================================================================
-- ATOMIC PAYMENT CREATION RPC
-- ============================================================================
-- Creates payment, items, and methods in single transaction
-- Generates gapless invoice number with row-level locking
-- Validates all inputs before processing
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_payment_with_invoice(
  p_patient_id UUID,
  p_subtotal DECIMAL,
  p_descuento DECIMAL,
  p_descuento_justificacion TEXT,
  p_total DECIMAL,
  p_created_by UUID,
  p_items JSONB,
  p_methods JSONB
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
  v_items_subtotal DECIMAL := 0;
  v_methods_total DECIMAL := 0;
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
    created_by
  ) VALUES (
    p_patient_id,
    v_invoice_number,
    p_subtotal,
    p_descuento,
    NULLIF(TRIM(p_descuento_justificacion), ''),
    p_total,
    p_created_by
  )
  RETURNING id INTO v_payment_id;

  -- ========================================================================
  -- INSERT PAYMENT ITEMS
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
    );
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
GRANT EXECUTE ON FUNCTION public.create_payment_with_invoice(UUID, DECIMAL, DECIMAL, TEXT, DECIMAL, UUID, JSONB, JSONB) TO authenticated;

COMMENT ON FUNCTION public.create_payment_with_invoice IS
  'Atomic payment creation with gapless invoice numbering. Validates all inputs, creates payment/items/methods in single transaction.';

-- ============================================================================
-- VERIFICATION
-- ============================================================================
DO $$
BEGIN
  -- Verify function exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'create_payment_with_invoice'
  ) THEN
    RAISE EXCEPTION 'create_payment_with_invoice function not created';
  END IF;

  RAISE NOTICE 'Payment creation RPC verified successfully';
END $$;

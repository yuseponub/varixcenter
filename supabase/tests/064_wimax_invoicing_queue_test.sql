-- Staging integration test for migration 064.
-- Every fixture and audit row is rolled back at the end.

BEGIN;

SET LOCAL request.jwt.claims = '{"role":"service_role"}';

DO $$
DECLARE
  v_user UUID;
  v_exact_patient UUID := gen_random_uuid();
  v_partial_patient UUID := gen_random_uuid();
  v_discard_patient UUID := gen_random_uuid();
  v_old_patient UUID := gen_random_uuid();
  v_requested_patient UUID := gen_random_uuid();
  v_exact_payment UUID := gen_random_uuid();
  v_partial_payment UUID := gen_random_uuid();
  v_discard_payment UUID := gen_random_uuid();
  v_old_payment UUID := gen_random_uuid();
  v_requested_payment UUID := gen_random_uuid();
  v_result JSONB;
BEGIN
  SELECT id INTO v_user FROM auth.users ORDER BY created_at LIMIT 1;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Staging necesita al menos un auth.users para probar payments.created_by';
  END IF;

  INSERT INTO public.patients (id, cedula, nombre, apellido)
  VALUES
    (v_exact_patient, '990000001', 'Prueba', 'Exacta WiMAX'),
    (v_partial_patient, '990000002', 'Prueba', 'Parcial WiMAX'),
    (v_discard_patient, '990000003', 'Prueba', 'Descartada WiMAX'),
    (v_old_patient, '990000004', 'Prueba', 'Vieja WiMAX'),
    (v_requested_patient, '990000005', 'Prueba', 'Solicitud WiMAX');

  INSERT INTO public.payments (
    id, patient_id, numero_factura, subtotal, descuento, total, created_by, created_at
  )
  VALUES
    (v_exact_payment, v_exact_patient, 'TEST-WIMAX-EXACT', 100000, 0, 100000, v_user, now() - interval '5 days'),
    (v_partial_payment, v_partial_patient, 'TEST-WIMAX-PARTIAL', 200000, 0, 200000, v_user, now() - interval '4 days'),
    (v_discard_payment, v_discard_patient, 'TEST-WIMAX-DISCARD', 300000, 0, 300000, v_user, now() - interval '3 days'),
    (v_old_payment, v_old_patient, 'TEST-WIMAX-OLD', 400000, 0, 400000, v_user, now() - interval '70 days'),
    (v_requested_payment, v_requested_patient, 'TEST-WIMAX-REQUEST', 500000, 0, 500000, v_user, now() - interval '2 days');

  -- The AFTER INSERT trigger must enqueue every card payment.
  INSERT INTO public.payment_methods (payment_id, metodo, monto)
  VALUES
    (v_exact_payment, 'tarjeta', 100000),
    (v_partial_payment, 'tarjeta', 200000),
    (v_discard_payment, 'tarjeta', 300000),
    (v_old_payment, 'tarjeta', 400000),
    (v_requested_payment, 'efectivo', 500000);

  IF (
    SELECT count(*) FROM public.payment_invoicing
    WHERE payment_id IN (v_exact_payment, v_partial_payment, v_discard_payment, v_old_payment)
      AND estado = 'pendiente'
  ) <> 4 THEN
    RAISE EXCEPTION 'Fallo tarjeta -> pendiente automatico';
  END IF;

  -- Simulate the authenticated payment-form checkbox for a non-card payment.
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'role', 'authenticated',
      'sub', v_user,
      'app_metadata', jsonb_build_object('role', 'admin')
    )::TEXT,
    true
  );
  PERFORM public.encolar_pago_facturacion(v_requested_payment);

  IF NOT EXISTS (
    SELECT 1 FROM public.payment_invoicing
    WHERE payment_id = v_requested_payment
      AND estado = 'pendiente'
      AND pidio_factura = true
  ) THEN
    RAISE EXCEPTION 'Fallo checkbox pidio_factura -> pendiente';
  END IF;

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  -- Exercise the persisted discard reason before running reconciliation.
  UPDATE public.payment_invoicing
  SET
    estado = 'descartada',
    motivo_descarte = 'Fixture descartada en prueba staging',
    descartada_por = v_user,
    descartada_at = now()
  WHERE payment_id = v_discard_payment;

  INSERT INTO public.wimax_facturas (
    numero, emision, cedula, nombre, total, mes_origen
  )
  VALUES
    (
      'TEST-FE-EXACT',
      (now() AT TIME ZONE 'America/Bogota')::date - 5,
      '990000001',
      'Prueba Exacta WiMAX',
      100000,
      to_char(now(), 'YYYY-MM')
    ),
    (
      'TEST-FE-PARTIAL',
      (now() AT TIME ZONE 'America/Bogota')::date - 4,
      '990000002',
      'Prueba Parcial WiMAX',
      150000,
      to_char(now(), 'YYYY-MM')
    ),
    (
      'TEST-FE-DISCARD',
      (now() AT TIME ZONE 'America/Bogota')::date - 3,
      '990000003',
      'Prueba Descartada WiMAX',
      300000,
      to_char(now(), 'YYYY-MM')
    );

  v_result := public.cruzar_facturacion_wimax();

  IF NOT EXISTS (
    SELECT 1 FROM public.payment_invoicing
    WHERE payment_id = v_exact_payment
      AND estado = 'facturada_total'
      AND wimax_factura_numero = 'TEST-FE-EXACT'
  ) THEN
    RAISE EXCEPTION 'Fallo cruce exacto: %', v_result;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.payment_invoicing
    WHERE payment_id = v_partial_payment
      AND estado = 'facturada_parcial'
      AND wimax_factura_numero = 'TEST-FE-PARTIAL'
  ) THEN
    RAISE EXCEPTION 'Fallo cruce parcial: %', v_result;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.payment_invoicing
    WHERE payment_id = v_discard_payment
      AND estado = 'descartada'
      AND motivo_descarte = 'Fixture descartada en prueba staging'
      AND wimax_factura_numero IS NULL
  ) THEN
    RAISE EXCEPTION 'Fallo descarte o se revirtio un estado terminal';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.payment_invoicing
    WHERE payment_id = v_old_payment
      AND estado = 'pendiente'
  ) THEN
    RAISE EXCEPTION 'El pago viejo sin factura dejo de estar visible como pendiente';
  END IF;
END;
$$;

SELECT
  'ok' AS resultado,
  'tarjeta, solicitud, exacto, parcial, descarte y pago viejo verificados' AS casos;

ROLLBACK;

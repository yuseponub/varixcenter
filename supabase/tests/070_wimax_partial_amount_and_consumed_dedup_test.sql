-- Transactional verification for selectable WiMAX amount, consumed-invoice
-- dedup and partial completion through the ColFact path.

BEGIN;

DO $$
DECLARE
  v_user UUID;
  v_patient UUID := gen_random_uuid();
  v_old_payment UUID := gen_random_uuid();
  v_payment UUID := gen_random_uuid();
  v_result JSONB;
  v_job UUID;
  v_cufe TEXT := repeat('d', 96);
  v_test_at TIMESTAMPTZ;
BEGIN
  SELECT id INTO v_user FROM auth.users ORDER BY created_at LIMIT 1;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Staging necesita al menos un auth.users';
  END IF;

  SELECT (((current_date - candidate.days) + TIME '12:00') AT TIME ZONE 'America/Bogota')
  INTO v_test_at
  FROM generate_series(0, 30) AS candidate(days)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.cash_closings
    WHERE fecha_cierre = current_date - candidate.days AND estado = 'cerrado'
  )
  ORDER BY candidate.days
  LIMIT 1;
  IF v_test_at IS NULL THEN
    RAISE EXCEPTION 'La prueba necesita una fecha abierta para crear sus fixtures';
  END IF;

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'role', 'authenticated',
      'sub', v_user,
      'app_metadata', jsonb_build_object('role', 'admin')
    )::TEXT,
    true
  );

  INSERT INTO public.patients (
    id, cedula, nombre, apellido, celular,
    contacto_emergencia_nombre, contacto_emergencia_telefono,
    contacto_emergencia_parentesco, created_by
  ) VALUES (
    v_patient, '99007001', 'Robot', 'Parcial', '3000000070',
    'Contacto', '3000000170', 'Familiar', v_user
  );

  INSERT INTO public.payments (
    id, patient_id, numero_factura, subtotal, descuento, total, created_by, created_at
  ) VALUES
    (v_old_payment, v_patient, 'TEST-070-OLD', 190000, 0, 190000, v_user, v_test_at),
    (v_payment, v_patient, 'TEST-070-NEW', 200000, 0, 200000, v_user, v_test_at);

  INSERT INTO public.payment_methods (payment_id, metodo, monto)
  VALUES
    (v_old_payment, 'tarjeta', 190000),
    (v_payment, 'tarjeta', 200000);

  INSERT INTO public.wimax_facturas (
    numero, emision, cedula, nombre, total, mes_origen, estado_dian
  ) VALUES (
    'FE99007001', current_date, '99007001', 'Robot Parcial',
    190000, to_char(current_date, 'YYYY-MM'), 'confirmada_manual'
  );
  UPDATE public.payment_invoicing
  SET
    estado = 'facturada_total',
    monto_a_facturar = 190000,
    wimax_factura_numero = 'FE99007001'
  WHERE payment_id = v_old_payment;

  v_result := public.preparar_factura_wimax(
    v_payment,
    '[{"referencia":"41651001CONSULT","cantidad":1,"precio_unitario":125000}]'::JSONB
  );
  v_job := (v_result->>'job_id')::UUID;

  IF v_result->>'estado' <> 'en_cola'
     OR (v_result->>'facturacion_parcial')::BOOLEAN IS NOT TRUE
     OR (v_result->>'monto')::NUMERIC <> 125000
     OR NOT EXISTS (
       SELECT 1
       FROM public.wimax_invoice_jobs
       WHERE id = v_job
         AND estado = 'en_cola'
         AND monto = 125000
         AND dedup_evidence->'consumed_invoices' @>
           '[{"numero":"FE99007001"}]'::JSONB
     ) THEN
    RAISE EXCEPTION 'No preparo correctamente la factura parcial: %', v_result;
  END IF;

  BEGIN
    PERFORM public.preparar_factura_wimax(
      v_payment,
      '[{"referencia":"41651001CONSULT","cantidad":1,"precio_unitario":200001}]'::JSONB
    );
    RAISE EXCEPTION 'Se permitio facturar por encima del pago';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'El total WiMAX (%) no puede superar el pago registrado (%)%' THEN
      RAISE;
    END IF;
  END;

  INSERT INTO public.wimax_facturas (
    numero, emision, cedula, nombre, total, mes_origen, estado_dian
  ) VALUES (
    'FE99007002', current_date, '99007001', 'Robot Parcial',
    125000, to_char(current_date, 'YYYY-MM'), 'cufe_pendiente'
  );
  UPDATE public.wimax_invoice_jobs
  SET
    estado = 'emitida_sin_cufe',
    wimax_factura_numero = 'FE99007002',
    last_step = 'emitida_sin_cufe',
    error_code = 'CUFE_NO_CAPTURADO'
  WHERE id = v_job;

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  PERFORM public.robot_wimax_completar_desde_portal(
    v_job,
    v_cufe,
    '{"colfact_confirmed":true,"xml_cufe_verified":true}'::JSONB
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public.payment_invoicing
    WHERE payment_id = v_payment
      AND estado = 'facturada_parcial'
      AND monto_a_facturar = 125000
      AND wimax_factura_numero = 'FE99007002'
  ) THEN
    RAISE EXCEPTION 'La conciliacion no marco el pago como facturado parcial';
  END IF;
END;
$$;

SELECT 'ok' AS resultado,
       'monto parcial y dedup de FE consumida verificados' AS caso;

ROLLBACK;

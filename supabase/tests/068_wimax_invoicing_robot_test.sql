-- Integration test for migration 068. All fixtures and state changes roll back.

BEGIN;

SET LOCAL request.jwt.claims = '{"role":"service_role"}';

DO $$
DECLARE
  v_user UUID;
  v_patient UUID := gen_random_uuid();
  v_duplicate_patient UUID := gen_random_uuid();
  v_large_patient UUID := gen_random_uuid();
  v_exact_patient UUID := gen_random_uuid();
  v_payment UUID := gen_random_uuid();
  v_duplicate_payment UUID := gen_random_uuid();
  v_large_payment UUID := gen_random_uuid();
  v_exact_payment UUID := gen_random_uuid();
  v_job_id UUID;
  v_lease UUID;
  v_result JSONB;
  v_claim JSONB;
  v_cufe TEXT := repeat('a', 96);
  v_guard_blocked BOOLEAN := false;
BEGIN
  SELECT id INTO v_user FROM auth.users ORDER BY created_at LIMIT 1;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Staging necesita al menos un auth.users';
  END IF;

  INSERT INTO public.patients (
    id, cedula, nombre, apellido, celular,
    contacto_emergencia_nombre, contacto_emergencia_telefono,
    contacto_emergencia_parentesco, created_by
  )
  VALUES
    (v_patient, '99006801', 'Robot', 'Supervisado', '3000000001', 'Contacto', '3000000011', 'Familiar', v_user),
    (v_duplicate_patient, '99006802', 'Robot', 'Duplicado', '3000000002', 'Contacto', '3000000012', 'Familiar', v_user),
    (v_large_patient, '99006803', 'Robot', 'Pago Grande', '3000000003', 'Contacto', '3000000013', 'Familiar', v_user),
    (v_exact_patient, '99006804', 'Robot', 'Pago Exacto', '3000000004', 'Contacto', '3000000014', 'Familiar', v_user);

  INSERT INTO public.payments (
    id, patient_id, numero_factura, subtotal, descuento, total, created_by, created_at
  )
  VALUES
    (v_payment, v_patient, 'TEST-068-ROBOT', 100000, 0, 100000, v_user, now() - interval '1 day'),
    (v_duplicate_payment, v_duplicate_patient, 'TEST-068-DUP', 200000, 0, 200000, v_user, now()),
    (v_large_payment, v_large_patient, 'TEST-068-LARGE', 200000, 0, 200000, v_user, now() - interval '2 days'),
    (v_exact_payment, v_large_patient, 'TEST-068-EXACT', 100000, 0, 100000, v_user, now() - interval '1 day');

  INSERT INTO public.payment_methods (payment_id, metodo, monto)
  VALUES
    (v_payment, 'tarjeta', 100000),
    (v_duplicate_payment, 'tarjeta', 200000),
    (v_large_payment, 'tarjeta', 200000),
    (v_exact_payment, 'tarjeta', 100000);

  INSERT INTO public.wimax_facturas (
    numero, emision, cedula, nombre, total, mes_origen
  )
  VALUES
    ('FE99006802', current_date, '99006802', 'Robot Duplicado', 200000, to_char(current_date, 'YYYY-MM')),
    ('FE99006804', current_date, '99006803', 'Robot Pago Grande', 100000, to_char(current_date, 'YYYY-MM'));

  -- Authenticated Admin prepares a canonical, supervised job.
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'role', 'authenticated',
      'sub', v_user,
      'app_metadata', jsonb_build_object('role', 'admin')
    )::TEXT,
    true
  );

  v_result := public.preparar_factura_wimax(
    v_payment,
    '[{"referencia":"41651001consult","cantidad":1,"precio_unitario":100000}]'::JSONB
  );
  v_job_id := (v_result->>'job_id')::UUID;

  IF v_result->>'estado' <> 'en_cola' OR NOT EXISTS (
    SELECT 1 FROM public.wimax_invoice_jobs
    WHERE id = v_job_id
      AND estado = 'en_cola'
      AND supervisada = true
      AND items->0->>'referencia' = '41651001CONSULT'
      AND items->0->>'descripcion' = 'CONSULTA VALORACION'
  ) THEN
    RAISE EXCEPTION 'No se preparo correctamente el trabajo supervisado: %', v_result;
  END IF;

  BEGIN
    UPDATE public.payment_invoicing
    SET monto_a_facturar = 99999
    WHERE payment_id = v_payment;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'El pago tiene un trabajo WiMAX protegido%' THEN
      v_guard_blocked := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT v_guard_blocked THEN
    RAISE EXCEPTION 'El guard permitio cambiar el monto de un trabajo activo';
  END IF;

  -- A cloud candidate blocks before any UI action.
  v_result := public.preparar_factura_wimax(
    v_duplicate_payment,
    '[{"referencia":"41651003CONTROL","cantidad":1,"precio_unitario":200000}]'::JSONB
  );
  IF v_result->>'estado' <> 'bloqueada_duplicado' THEN
    RAISE EXCEPTION 'No se bloqueo la candidata existente: %', v_result;
  END IF;

  -- Service-role lease drives the job to the irreversible approval gate.
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  v_claim := public.robot_wimax_reclamar('test-agent-068');
  IF (v_claim->'job'->>'id')::UUID <> v_job_id THEN
    RAISE EXCEPTION 'El agente reclamo un trabajo inesperado: %', v_claim;
  END IF;
  v_lease := (v_claim->'job'->>'lease_token')::UUID;

  PERFORM public.robot_wimax_registrar_preflight(
    v_job_id, v_lease, 'limpio', '99ROB',
    '{"dbf_checked":true,"recent_invoices":[]}'::JSONB
  );
  PERFORM public.robot_wimax_esperar_aprobacion(
    v_job_id, v_lease, '{"step":"asiento_contable"}'::JSONB
  );

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'role', 'authenticated',
      'sub', v_user,
      'app_metadata', jsonb_build_object('role', 'admin')
    )::TEXT,
    true
  );
  PERFORM public.autorizar_factura_wimax(v_job_id);

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  PERFORM public.robot_wimax_marcar_verificando(v_job_id, v_lease);
  v_result := public.robot_wimax_completar(
    v_job_id,
    v_lease,
    'FE99006801',
    current_date,
    '99006801',
    'Robot Supervisado',
    100000,
    v_cufe,
    '{"trafac":true,"tmfecufe":true}'::JSONB
  );

  IF v_result->>'estado' <> 'completada'
     OR NOT EXISTS (
       SELECT 1 FROM public.payment_invoicing
       WHERE payment_id = v_payment
         AND estado = 'facturada_total'
         AND wimax_factura_numero = 'FE99006801'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.wimax_facturas
       WHERE numero = 'FE99006801' AND cufe = v_cufe
     ) THEN
    RAISE EXCEPTION 'No se completo con FE + CUFE: %', v_result;
  END IF;

  -- Regression: a smaller invoice must not be consumed by the older/larger
  -- payment. It belongs to the later payment with the exact amount.
  v_result := public.cruzar_facturacion_wimax();
  IF NOT EXISTS (
    SELECT 1 FROM public.payment_invoicing
    WHERE payment_id = v_large_payment
      AND estado = 'pendiente'
      AND wimax_factura_numero IS NULL
  ) THEN
    RAISE EXCEPTION 'El cruce volvio a crear un emparejamiento parcial: %', v_result;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.payment_invoicing
    WHERE payment_id = v_exact_payment
      AND estado = 'facturada_total'
      AND wimax_factura_numero = 'FE99006804'
  ) THEN
    RAISE EXCEPTION 'La FE exacta no fue consumida 1-a-1: %', v_result;
  END IF;
END;
$$;

SELECT
  'ok' AS resultado,
  'cola, bloqueo, lease, aprobacion, FE+CUFE y dedup exacto 1-a-1 verificados' AS casos;

ROLLBACK;

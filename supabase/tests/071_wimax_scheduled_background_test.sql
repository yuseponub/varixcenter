-- Transactional verification for explicit urgent/close modes, durable final
-- authorization and mode-restricted atomic claims.

BEGIN;

DO $$
DECLARE
  v_user UUID;
  v_patient_close UUID := gen_random_uuid();
  v_patient_urgent UUID := gen_random_uuid();
  v_patient_deferred UUID := gen_random_uuid();
  v_patient_supervised UUID := gen_random_uuid();
  v_payment_close UUID := gen_random_uuid();
  v_payment_urgent UUID := gen_random_uuid();
  v_payment_deferred UUID := gen_random_uuid();
  v_payment_supervised UUID := gen_random_uuid();
  v_close_job UUID;
  v_urgent_job UUID;
  v_deferred_job UUID;
  v_supervised_job UUID;
  v_claim JSONB;
  v_result JSONB;
  v_lease UUID;
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

  INSERT INTO public.patients (
    id, cedula, nombre, apellido, celular,
    contacto_emergencia_nombre, contacto_emergencia_telefono,
    contacto_emergencia_parentesco, created_by
  ) VALUES
    (v_patient_close, '99007101', 'Robot', 'Cierre', '3000007101', 'Contacto', '3000007111', 'Familiar', v_user),
    (v_patient_urgent, '99007102', 'Robot', 'Urgente', '3000007102', 'Contacto', '3000007112', 'Familiar', v_user),
    (v_patient_deferred, '99007103', 'Robot', 'Pospuesto', '3000007103', 'Contacto', '3000007113', 'Familiar', v_user),
    (v_patient_supervised, '99007104', 'Robot', 'Supervisado', '3000007104', 'Contacto', '3000007114', 'Familiar', v_user);

  INSERT INTO public.payments (
    id, patient_id, numero_factura, subtotal, descuento, total, created_by, created_at
  ) VALUES
    (v_payment_close, v_patient_close, 'TEST-071-CLOSE', 100000, 0, 100000, v_user, v_test_at),
    (v_payment_urgent, v_patient_urgent, 'TEST-071-URGENT', 100000, 0, 100000, v_user, v_test_at),
    (v_payment_deferred, v_patient_deferred, 'TEST-071-DEFER', 100000, 0, 100000, v_user, v_test_at),
    (v_payment_supervised, v_patient_supervised, 'TEST-071-SUP', 100000, 0, 100000, v_user, v_test_at);

  INSERT INTO public.payment_methods (payment_id, metodo, monto) VALUES
    (v_payment_close, 'tarjeta', 100000),
    (v_payment_urgent, 'tarjeta', 100000),
    (v_payment_deferred, 'tarjeta', 100000),
    (v_payment_supervised, 'tarjeta', 100000);

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'role', 'authenticated',
      'sub', v_user,
      'app_metadata', jsonb_build_object('role', 'admin')
    )::TEXT,
    true
  );

  v_result := public.preparar_factura_wimax_programada(
    v_payment_close,
    '[{"referencia":"41651001CONSULT","cantidad":1,"precio_unitario":100000}]'::JSONB,
    'cierre'
  );
  v_close_job := (v_result->>'job_id')::UUID;

  v_result := public.preparar_factura_wimax_programada(
    v_payment_urgent,
    '[{"referencia":"41651001CONSULT","cantidad":1,"precio_unitario":100000}]'::JSONB,
    'urgente'
  );
  v_urgent_job := (v_result->>'job_id')::UUID;

  v_result := public.preparar_factura_wimax_programada(
    v_payment_deferred,
    '[{"referencia":"41651001CONSULT","cantidad":1,"precio_unitario":100000}]'::JSONB,
    'urgente'
  );
  v_deferred_job := (v_result->>'job_id')::UUID;

  v_result := public.preparar_factura_wimax(
    v_payment_supervised,
    '[{"referencia":"41651001CONSULT","cantidad":1,"precio_unitario":100000}]'::JSONB
  );
  v_supervised_job := (v_result->>'job_id')::UUID;

  IF NOT EXISTS (
    SELECT 1 FROM public.wimax_invoice_jobs
    WHERE id = v_close_job
      AND modo_ejecucion = 'cierre'
      AND supervisada = false
      AND approved_by = v_user
      AND approved_at IS NOT NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM public.wimax_invoice_jobs
    WHERE id = v_supervised_job
      AND modo_ejecucion = 'supervisada'
      AND supervisada = true
      AND approved_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Los modos o la preautorizacion no quedaron auditados';
  END IF;

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  PERFORM public.robot_wimax_posponer_al_cierre(v_deferred_job);
  IF NOT EXISTS (
    SELECT 1 FROM public.wimax_invoice_jobs
    WHERE id = v_deferred_job AND modo_ejecucion = 'cierre'
  ) THEN
    RAISE EXCEPTION 'No se pospuso la urgente al cierre';
  END IF;

  -- The unrestricted compatibility claim must still take the urgent first.
  v_claim := public.robot_wimax_reclamar('test-agent-071');
  IF (v_claim->'job'->>'id')::UUID <> v_urgent_job THEN
    RAISE EXCEPTION 'No se priorizo el trabajo urgente: %', v_claim;
  END IF;
  v_lease := (v_claim->'job'->>'lease_token')::UUID;
  PERFORM public.robot_wimax_registrar_preflight(
    v_urgent_job, v_lease, 'limpio', '99URG', '{"dbf_checked":true}'::JSONB
  );
  v_result := public.robot_wimax_esperar_aprobacion(
    v_urgent_job, v_lease, '{"step":"listo"}'::JSONB
  );
  IF v_result->>'estado' <> 'aprobada' THEN
    RAISE EXCEPTION 'La urgente preautorizada se detuvo esperando aprobacion: %', v_result;
  END IF;

  -- A close-only claim cannot consume the legacy supervised row.
  v_claim := public.robot_wimax_reclamar_modos(
    'test-agent-071-close', ARRAY['cierre']::TEXT[]
  );
  IF (v_claim->'job'->>'id')::UUID NOT IN (v_close_job, v_deferred_job) THEN
    RAISE EXCEPTION 'El claim de cierre tomo un modo incorrecto: %', v_claim;
  END IF;

  -- Legacy/manual recovery remains behind the human approval gate.
  v_claim := public.robot_wimax_reclamar_modos(
    'test-agent-071-supervised', ARRAY['supervisada']::TEXT[]
  );
  IF (v_claim->'job'->>'id')::UUID <> v_supervised_job THEN
    RAISE EXCEPTION 'No se reclamo el trabajo supervisado esperado: %', v_claim;
  END IF;
  v_lease := (v_claim->'job'->>'lease_token')::UUID;
  PERFORM public.robot_wimax_registrar_preflight(
    v_supervised_job, v_lease, 'limpio', '99SUP', '{"dbf_checked":true}'::JSONB
  );
  v_result := public.robot_wimax_esperar_aprobacion(
    v_supervised_job, v_lease, '{"step":"listo"}'::JSONB
  );
  IF v_result->>'estado' <> 'esperando_aprobacion' THEN
    RAISE EXCEPTION 'El modo supervisado omitio la aprobacion humana: %', v_result;
  END IF;
END;
$$;

SELECT 'ok' AS resultado,
       'urgente, cierre, preautorizacion, prioridad y recuperacion supervisada verificados' AS caso;

ROLLBACK;

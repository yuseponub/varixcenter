-- Transactional verification for controlled recovery of an FE emitted during
-- supervised robot calibration. All fixtures and changes roll back.

BEGIN;

DO $$
DECLARE
  v_user UUID;
  v_patient UUID := gen_random_uuid();
  v_payment UUID := gen_random_uuid();
  v_job UUID := gen_random_uuid();
  v_cufe TEXT := repeat('d', 96);
  v_result JSONB;
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
  ) VALUES (
    v_patient, '99007201', 'Robot', 'Observado', '3000007201',
    'Contacto', '3000007211', 'Familiar', v_user
  );
  INSERT INTO public.payments (
    id, patient_id, numero_factura, subtotal, descuento, total, created_by, created_at
  ) VALUES (
    v_payment, v_patient, 'TEST-072-OBS', 190000, 0, 190000, v_user, v_test_at
  );
  INSERT INTO public.payment_methods (payment_id, metodo, monto)
  VALUES (v_payment, 'tarjeta', 190000);
  INSERT INTO public.payment_invoicing (
    payment_id, estado, monto_a_facturar, pidio_factura
  ) VALUES (
    v_payment, 'pendiente', 190000, true
  ) ON CONFLICT (payment_id) DO UPDATE SET
    estado = EXCLUDED.estado,
    monto_a_facturar = EXCLUDED.monto_a_facturar,
    wimax_factura_numero = NULL;
  INSERT INTO public.wimax_invoice_jobs (
    id, payment_id, estado, items, monto, paciente, supervisada,
    modo_ejecucion, requested_by, approved_by, approved_at
  ) VALUES (
    v_job,
    v_payment,
    'en_cola',
    '[{"referencia":"SES","descripcion":"SESION","cantidad":2,"precio_unitario":95000}]'::JSONB,
    190000,
    jsonb_build_object(
      'cedula', '99007201',
      'nombre', 'Robot',
      'apellido', 'Observado',
      'payment_created_at', v_test_at,
      'payment_numero', 'TEST-072-OBS'
    ),
    false,
    'cierre',
    v_user,
    v_user,
    now()
  );

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  BEGIN
    PERFORM public.robot_wimax_registrar_emision_observada(
      v_job, 'FE99007201', current_date, '99007201',
      'Robot Observado', 189999, '{"trafac_confirmed":true}'::JSONB
    );
    RAISE EXCEPTION 'La recuperacion acepto un total distinto';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'La recuperacion acepto un total distinto' THEN RAISE; END IF;
  END;

  v_result := public.robot_wimax_registrar_emision_observada(
    v_job,
    'FE99007201',
    current_date,
    '99007201',
    'Robot Observado',
    190000,
    '{"trafac_confirmed":true,"supervised":true}'::JSONB
  );
  IF v_result->>'estado' <> 'emitida_sin_cufe'
     OR NOT EXISTS (
       SELECT 1 FROM public.wimax_facturas
       WHERE numero = 'FE99007201'
         AND cedula = '99007201'
         AND total = 190000
         AND estado_dian = 'cufe_pendiente'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.wimax_invoice_jobs
       WHERE id = v_job
         AND estado = 'emitida_sin_cufe'
         AND wimax_factura_numero = 'FE99007201'
         AND last_step = 'emision_observada_en_trafac'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.payment_invoicing
       WHERE payment_id = v_payment
         AND estado = 'pendiente'
         AND wimax_factura_numero IS NULL
     ) THEN
    RAISE EXCEPTION 'La FE observada no quedo pendiente de CUFE: %', v_result;
  END IF;

  v_result := public.robot_wimax_completar_desde_portal(
    v_job,
    v_cufe,
    '{"colfact_confirmed":true,"xml_cufe_verified":true}'::JSONB
  );
  IF v_result->>'estado' <> 'completada'
     OR NOT EXISTS (
       SELECT 1 FROM public.payment_invoicing
       WHERE payment_id = v_payment
         AND estado = 'facturada_total'
         AND wimax_factura_numero = 'FE99007201'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.wimax_invoice_jobs
       WHERE id = v_job
         AND estado = 'completada'
         AND cufe = v_cufe
     ) THEN
    RAISE EXCEPTION 'La conciliacion ColFact no completo la recuperacion: %', v_result;
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.robot_wimax_registrar_emision_observada(uuid,text,date,text,text,numeric,jsonb)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'authenticated conserva acceso a la recuperacion del robot';
  END IF;
END;
$$;

SELECT 'ok' AS resultado,
       'emision observada exige identidad exacta y CUFE posterior' AS caso;

ROLLBACK;

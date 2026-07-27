-- Transactional verification for the patient address captured by the WiMAX
-- button. This test never emits or touches the WiMAX desktop.

BEGIN;

DO $$
DECLARE
  v_user UUID;
  v_patient_with_address UUID := gen_random_uuid();
  v_patient_without_address UUID := gen_random_uuid();
  v_payment_with_address UUID := gen_random_uuid();
  v_payment_without_address UUID := gen_random_uuid();
  v_job_with_address UUID;
  v_job_without_address UUID;
  v_snapshot JSONB;
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
    id, cedula, nombre, apellido, celular, direccion, ciudad, pais,
    contacto_emergencia_nombre, contacto_emergencia_telefono,
    contacto_emergencia_parentesco, created_by
  ) VALUES
    (
      v_patient_with_address, '99007701', 'Robot', 'Direccion', '3000007701',
      '  Carrera 27 # 45-10  ', ' Bucaramanga ', ' Colombia ',
      'Contacto', '3000007711', 'Familiar', v_user
    ),
    (
      v_patient_without_address, '99007702', 'Robot', 'Sin Direccion', '3000007702',
      '   ', NULL, NULL,
      'Contacto', '3000007712', 'Familiar', v_user
    );

  INSERT INTO public.payments (
    id, patient_id, numero_factura, subtotal, descuento, total, created_by, created_at
  ) VALUES
    (
      v_payment_with_address, v_patient_with_address, 'TEST-077-ADDRESS',
      100000, 0, 100000, v_user, v_test_at
    ),
    (
      v_payment_without_address, v_patient_without_address, 'TEST-077-NO-ADDRESS',
      100000, 0, 100000, v_user, v_test_at
    );

  INSERT INTO public.payment_methods (payment_id, metodo, monto) VALUES
    (v_payment_with_address, 'tarjeta', 100000),
    (v_payment_without_address, 'tarjeta', 100000);

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'role', 'authenticated',
      'sub', v_user,
      'app_metadata', jsonb_build_object('role', 'admin')
    )::TEXT,
    true
  );

  v_job_with_address := (
    public.preparar_factura_wimax_programada(
      v_payment_with_address,
      '[{"referencia":"41651001CONSULT","cantidad":1,"precio_unitario":100000}]'::JSONB,
      'cierre'
    )->>'job_id'
  )::UUID;

  v_job_without_address := (
    public.preparar_factura_wimax_programada(
      v_payment_without_address,
      '[{"referencia":"41651001CONSULT","cantidad":1,"precio_unitario":100000}]'::JSONB,
      'cierre'
    )->>'job_id'
  )::UUID;

  SELECT paciente INTO v_snapshot
  FROM public.wimax_invoice_jobs
  WHERE id = v_job_with_address;

  IF v_snapshot->>'direccion' <> 'Carrera 27 # 45-10'
     OR v_snapshot->>'ciudad' <> 'Bucaramanga'
     OR v_snapshot->>'pais' <> 'Colombia'
     OR v_snapshot->>'direccion_fuente' <> 'ficha_varix' THEN
    RAISE EXCEPTION 'El snapshot no conservo la direccion de Varix: %', v_snapshot;
  END IF;

  SELECT paciente INTO v_snapshot
  FROM public.wimax_invoice_jobs
  WHERE id = v_job_without_address;

  IF v_snapshot->'direccion' <> 'null'::JSONB
     OR v_snapshot->'ciudad' <> 'null'::JSONB
     OR v_snapshot->>'pais' <> 'Colombia'
     OR v_snapshot->>'direccion_fuente' <> 'sin_direccion' THEN
    RAISE EXCEPTION 'El snapshot invento una direccion ausente: %', v_snapshot;
  END IF;

  -- A later edit to the patient must not mutate an already authorized job.
  UPDATE public.patients
  SET direccion = 'Direccion posterior'
  WHERE id = v_patient_with_address;

  UPDATE public.wimax_invoice_jobs
  SET last_step = 'prueba_snapshot_inmutable'
  WHERE id = v_job_with_address;

  SELECT paciente INTO v_snapshot
  FROM public.wimax_invoice_jobs
  WHERE id = v_job_with_address;

  IF v_snapshot->>'direccion' <> 'Carrera 27 # 45-10' THEN
    RAISE EXCEPTION 'Una edicion posterior altero el snapshot autorizado: %', v_snapshot;
  END IF;
END;
$$;

SELECT 'ok' AS resultado,
       'direccion presente, ausente e inmutable verificadas' AS caso;

ROLLBACK;

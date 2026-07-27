-- Transactional verification for transfer eligibility, exact ColFact
-- consolidation, private PDF metadata and restricted service-role RPCs.

BEGIN;

DO $$
DECLARE
  v_user UUID;
  v_patient UUID := gen_random_uuid();
  v_payment UUID := gen_random_uuid();
  v_nequi_payment UUID := gen_random_uuid();
  v_ambiguous_payment_a UUID := gen_random_uuid();
  v_ambiguous_payment_b UUID := gen_random_uuid();
  v_cufe TEXT := repeat('e', 96);
  v_sha TEXT := repeat('a', 64);
  v_path TEXT := 'facturas/FE99007301-' || repeat('e', 96) || '.pdf';
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

  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets
    WHERE id = 'wimax-invoices'
      AND public = false
      AND file_size_limit = 10485760
      AND 'application/pdf' = ANY(allowed_mime_types)
  ) THEN
    RAISE EXCEPTION 'El bucket privado de PDFs WiMAX no quedo configurado';
  END IF;

  INSERT INTO public.patients (
    id, cedula, nombre, apellido, celular,
    contacto_emergencia_nombre, contacto_emergencia_telefono,
    contacto_emergencia_parentesco, created_by
  ) VALUES (
    v_patient, '99007301', 'Robot', 'Transferencia', '3000007301',
    'Contacto', '3000007311', 'Familiar', v_user
  );

  INSERT INTO public.payments (
    id, patient_id, numero_factura, subtotal, descuento, total, created_by, created_at
  ) VALUES (
    v_payment, v_patient, 'TEST-073-TRANSFER', 200000, 0, 200000, v_user, v_test_at
  );
  INSERT INTO public.payment_methods (payment_id, metodo, monto) VALUES
    (v_payment, 'transferencia', 100000),
    (v_payment, 'efectivo', 100000);

  IF NOT EXISTS (
    SELECT 1 FROM public.payment_invoicing
    WHERE payment_id = v_payment AND estado = 'pendiente'
  ) THEN
    RAISE EXCEPTION 'Una porcion por transferencia no creo el pendiente WiMAX';
  END IF;

  INSERT INTO public.payments (
    id, patient_id, numero_factura, subtotal, descuento, total, created_by, created_at
  ) VALUES (
    v_nequi_payment, v_patient, 'TEST-073-NEQUI', 1000, 0, 1000, v_user, v_test_at
  );
  INSERT INTO public.payment_methods (payment_id, metodo, monto)
  VALUES (v_nequi_payment, 'nequi', 1000);
  IF EXISTS (
    SELECT 1 FROM public.payment_invoicing WHERE payment_id = v_nequi_payment
  ) THEN
    RAISE EXCEPTION 'Nequi se incluyo sin haber sido solicitado';
  END IF;

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  v_result := public.robot_wimax_registrar_revision_colfact(
    v_payment,
    'sin_coincidencia',
    '{"candidate_count":0}'::JSONB
  );
  IF v_result->>'estado' <> 'sin_coincidencia' THEN
    RAISE EXCEPTION 'No se guardo el resultado de auditoria ColFact';
  END IF;

  v_result := public.robot_wimax_consolidar_pago_colfact(
    v_payment,
    'FE99007301',
    current_date,
    '99007301',
    'Robot Transferencia',
    100000,
    v_cufe,
    v_path,
    v_sha,
    12345,
    '{
      "colfact_confirmed": true,
      "xml_cufe_verified": true,
      "pdf_verified": true,
      "unique_match": true
    }'::JSONB
  );

  IF v_result->>'estado' <> 'facturada_parcial'
     OR NOT EXISTS (
       SELECT 1 FROM public.payment_invoicing
       WHERE payment_id = v_payment
         AND estado = 'facturada_parcial'
         AND monto_a_facturar = 100000
         AND wimax_factura_numero = 'FE99007301'
         AND colfact_revision_estado = 'confirmada'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.wimax_facturas
       WHERE numero = 'FE99007301'
         AND cufe = v_cufe
         AND estado_dian = 'confirmada_portal'
         AND pdf_storage_path = v_path
         AND pdf_sha256 = v_sha
         AND pdf_size_bytes = 12345
     ) THEN
    RAISE EXCEPTION 'La consolidacion exacta transferencia/PDF fallo: %', v_result;
  END IF;

  INSERT INTO public.payments (
    id, patient_id, numero_factura, subtotal, descuento, total, created_by, created_at
  ) VALUES
    (v_ambiguous_payment_a, v_patient, 'TEST-073-AMB-A', 5000, 0, 5000, v_user, v_test_at),
    (v_ambiguous_payment_b, v_patient, 'TEST-073-AMB-B', 5000, 0, 5000, v_user, v_test_at);
  INSERT INTO public.payment_methods (payment_id, metodo, monto) VALUES
    (v_ambiguous_payment_a, 'tarjeta', 5000),
    (v_ambiguous_payment_b, 'transferencia', 5000);
  INSERT INTO public.wimax_facturas (
    numero, emision, cedula, nombre, total, mes_origen
  ) VALUES (
    'FE99007302', current_date, '99007301', 'Robot Transferencia',
    5000, to_char(current_date, 'YYYY-MM')
  );

  PERFORM public.cruzar_facturacion_wimax();
  IF EXISTS (
    SELECT 1 FROM public.payment_invoicing
    WHERE payment_id IN (v_ambiguous_payment_a, v_ambiguous_payment_b)
      AND estado <> 'pendiente'
  ) THEN
    RAISE EXCEPTION 'El cruce automatico consumio una FE disputada';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.robot_wimax_consolidar_pago_colfact(uuid,text,date,text,text,numeric,text,text,text,bigint,jsonb)',
    'EXECUTE'
  ) OR has_function_privilege(
    'authenticated',
    'public.robot_wimax_registrar_documento_colfact(text,date,text,numeric,text,text,text,bigint,jsonb)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'authenticated conserva acceso a RPCs de ColFact';
  END IF;
END;
$$;

SELECT 'ok' AS resultado,
       'transferencia parcial, consolidacion exacta y PDF privado verificados' AS caso;

ROLLBACK;

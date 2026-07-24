-- Integration test for migration 069. All fixtures and changes roll back.

BEGIN;

SET LOCAL request.jwt.claims = '{"role":"service_role"}';

DO $$
DECLARE
  v_user UUID;
  v_patient UUID := gen_random_uuid();
  v_payment UUID := gen_random_uuid();
  v_job UUID := gen_random_uuid();
  v_cufe TEXT := repeat('c', 96);
  v_result JSONB;
BEGIN
  SELECT id INTO v_user FROM auth.users ORDER BY created_at LIMIT 1;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Staging necesita al menos un auth.users';
  END IF;

  INSERT INTO public.patients (
    id, cedula, nombre, apellido, celular,
    contacto_emergencia_nombre, contacto_emergencia_telefono,
    contacto_emergencia_parentesco, created_by
  ) VALUES (
    v_patient, '99006901', 'Robot', 'ColFact', '3000000069',
    'Contacto', '3000000169', 'Familiar', v_user
  );

  INSERT INTO public.payments (
    id, patient_id, numero_factura, subtotal, descuento, total, created_by, created_at
  ) VALUES (
    v_payment, v_patient, 'TEST-069-COLFACT', 125000, 0, 125000, v_user, now()
  );
  INSERT INTO public.payment_methods (payment_id, metodo, monto)
  VALUES (v_payment, 'tarjeta', 125000);
  INSERT INTO public.payment_invoicing (
    payment_id, estado, monto_a_facturar, pidio_factura
  ) VALUES (
    v_payment, 'pendiente', 125000, true
  ) ON CONFLICT (payment_id) DO UPDATE SET
    estado = EXCLUDED.estado,
    monto_a_facturar = EXCLUDED.monto_a_facturar,
    pidio_factura = EXCLUDED.pidio_factura,
    wimax_factura_numero = NULL;

  INSERT INTO public.wimax_facturas (
    numero, emision, cedula, nombre, total, mes_origen, estado_dian
  ) VALUES (
    'FE99006901', current_date, '99006901', 'Robot ColFact',
    125000, to_char(current_date, 'YYYY-MM'), 'cufe_pendiente'
  );

  INSERT INTO public.wimax_invoice_jobs (
    id, payment_id, estado, items, monto, paciente, supervisada,
    requested_by, wimax_cliente_codigo, wimax_factura_numero,
    last_step, error_code, error_message
  ) VALUES (
    v_job,
    v_payment,
    'emitida_sin_cufe',
    '[{"referencia":"41651001CONSULT","descripcion":"CONSULTA VALORACION","cantidad":1,"precio_unitario":125000}]'::JSONB,
    125000,
    jsonb_build_object(
      'cedula', '99006901',
      'nombre', 'Robot',
      'apellido', 'ColFact',
      'payment_created_at', now()
    ),
    true,
    v_user,
    '99ROB',
    'FE99006901',
    'emitida_sin_cufe',
    'CUFE_NO_CAPTURADO',
    'Pendiente de ColFact'
  );

  v_result := public.robot_wimax_completar_desde_portal(
    v_job,
    v_cufe,
    '{"colfact_confirmed":true,"xml_cufe_verified":true}'::JSONB
  );

  IF v_result->>'estado' <> 'completada'
     OR NOT EXISTS (
       SELECT 1 FROM public.wimax_facturas
       WHERE numero = 'FE99006901'
         AND cufe = v_cufe
         AND estado_dian = 'confirmada_portal'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.payment_invoicing
       WHERE payment_id = v_payment
         AND estado = 'facturada_total'
         AND wimax_factura_numero = 'FE99006901'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.wimax_invoice_jobs
       WHERE id = v_job
         AND estado = 'completada'
         AND cufe = v_cufe
         AND last_step = 'cufe_confirmado_portal'
         AND error_code IS NULL
     ) THEN
    RAISE EXCEPTION 'No se completo atomicamente desde ColFact: %', v_result;
  END IF;
END;
$$;

SELECT 'ok' AS resultado, 'conciliacion ColFact atomica verificada' AS caso;

ROLLBACK;

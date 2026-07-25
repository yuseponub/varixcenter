-- Recover a job whose invoice was emitted under direct operator supervision
-- while the robot was being calibrated. This path never emits or guesses a
-- fiscal identity: service_role must provide an exact FE already observed in
-- trafac, and the payment remains pending until its CUFE is verified through
-- the normal ColFact reconciliation RPC.

BEGIN;

CREATE OR REPLACE FUNCTION public.robot_wimax_registrar_emision_observada(
  p_job_id UUID,
  p_numero TEXT,
  p_emision DATE,
  p_cedula TEXT,
  p_nombre TEXT,
  p_total NUMERIC,
  p_evidence JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job RECORD;
  v_invoice RECORD;
  v_numero TEXT;
  v_cedula TEXT;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Solo el agente WiMAX puede recuperar una emision observada';
  END IF;
  IF pg_column_size(COALESCE(p_evidence, '{}'::JSONB)) > 32768 THEN
    RAISE EXCEPTION 'Evidencia de recuperacion demasiado grande';
  END IF;

  v_numero := upper(trim(COALESCE(p_numero, '')));
  v_cedula := regexp_replace(COALESCE(p_cedula, ''), '[^0-9]', '', 'g');
  IF v_numero !~ '^FE[0-9]+$' THEN
    RAISE EXCEPTION 'Numero FE invalido';
  END IF;

  SELECT
    j.*,
    pi.estado AS invoicing_estado,
    pi.wimax_factura_numero AS invoicing_numero,
    p.estado AS payment_estado
  INTO v_job
  FROM public.wimax_invoice_jobs j
  JOIN public.payment_invoicing pi ON pi.payment_id = j.payment_id
  JOIN public.payments p ON p.id = j.payment_id
  WHERE j.id = p_job_id
  FOR UPDATE OF j, pi;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trabajo WiMAX inexistente';
  END IF;
  IF v_job.estado NOT IN (
    'en_cola', 'bloqueada_duplicado', 'error', 'requiere_revision'
  ) OR v_job.lease_token IS NOT NULL THEN
    RAISE EXCEPTION 'El trabajo WiMAX no admite recuperacion observada';
  END IF;
  IF v_job.payment_estado <> 'activo'
     OR v_job.invoicing_estado <> 'pendiente'
     OR v_job.invoicing_numero IS NOT NULL THEN
    RAISE EXCEPTION 'El pago ya no admite conciliacion WiMAX';
  END IF;
  IF v_cedula <> regexp_replace(
       COALESCE(v_job.paciente->>'cedula', ''), '[^0-9]', '', 'g'
     ) THEN
    RAISE EXCEPTION 'La cedula DBF no coincide con el trabajo';
  END IF;
  IF p_total IS NULL OR round(p_total, 2) <> v_job.monto THEN
    RAISE EXCEPTION 'El total DBF no coincide con el trabajo';
  END IF;
  IF p_emision IS NULL OR p_emision NOT BETWEEN
      (((v_job.paciente->>'payment_created_at')::TIMESTAMPTZ
        AT TIME ZONE 'America/Bogota')::DATE - 2)
      AND LEAST(
        ((v_job.paciente->>'payment_created_at')::TIMESTAMPTZ
          AT TIME ZONE 'America/Bogota')::DATE + 45,
        (now() AT TIME ZONE 'America/Bogota')::DATE + 1
      ) THEN
    RAISE EXCEPTION 'La fecha DBF no corresponde a la ventana del pago';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.payment_invoicing pi
    WHERE pi.wimax_factura_numero = v_numero
      AND pi.payment_id <> v_job.payment_id
  ) OR EXISTS (
    SELECT 1
    FROM public.wimax_invoice_jobs other_job
    WHERE other_job.wimax_factura_numero = v_numero
      AND other_job.id <> v_job.id
      AND other_job.estado <> 'cancelada'
  ) THEN
    RAISE EXCEPTION 'La FE observada ya esta enlazada a otro trabajo';
  END IF;

  INSERT INTO public.wimax_facturas (
    numero, emision, cedula, nombre, total, mes_origen, sync_at, estado_dian
  )
  VALUES (
    v_numero,
    p_emision,
    v_cedula,
    NULLIF(trim(p_nombre), ''),
    round(p_total, 2),
    to_char(p_emision, 'YYYY-MM'),
    now(),
    'cufe_pendiente'
  )
  ON CONFLICT (numero) DO NOTHING;

  SELECT * INTO v_invoice
  FROM public.wimax_facturas
  WHERE numero = v_numero
  FOR UPDATE;
  IF NOT FOUND
     OR regexp_replace(COALESCE(v_invoice.cedula, ''), '[^0-9]', '', 'g') <> v_cedula
     OR v_invoice.total <> round(p_total, 2)
     OR v_invoice.emision <> p_emision THEN
    RAISE EXCEPTION 'La FE ya existe con datos distintos; requiere revision';
  END IF;

  UPDATE public.wimax_invoice_jobs
  SET
    estado = 'emitida_sin_cufe',
    wimax_factura_numero = v_invoice.numero,
    dedup_evidence = COALESCE(dedup_evidence, '{}'::JSONB) ||
      jsonb_build_object(
        'observed_invoice', jsonb_build_object(
          'numero', v_invoice.numero,
          'emision', v_invoice.emision,
          'total', v_invoice.total,
          'source', 'trafac'
        )
      ),
    ui_evidence = COALESCE(ui_evidence, '{}'::JSONB) ||
      jsonb_build_object('supervised_recovery', COALESCE(p_evidence, '{}'::JSONB)),
    last_step = 'emision_observada_en_trafac',
    lease_token = NULL,
    lease_expires_at = NULL,
    error_code = 'CUFE_NO_CAPTURADO',
    error_message = 'FE observada en trafac; esperando verificacion del CUFE en ColFact.',
    completed_at = NULL
  WHERE id = v_job.id;

  RETURN jsonb_build_object(
    'success', true,
    'estado', 'emitida_sin_cufe',
    'numero', v_invoice.numero
  );
END;
$$;

REVOKE ALL ON FUNCTION public.robot_wimax_registrar_emision_observada(
  UUID, TEXT, DATE, TEXT, TEXT, NUMERIC, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.robot_wimax_registrar_emision_observada(
  UUID, TEXT, DATE, TEXT, TEXT, NUMERIC, JSONB
) TO service_role;

COMMENT ON FUNCTION public.robot_wimax_registrar_emision_observada(
  UUID, TEXT, DATE, TEXT, TEXT, NUMERIC, JSONB
) IS
  'Enlaza de forma controlada una FE ya observada en trafac; no emite y no completa el pago hasta verificar CUFE.';

COMMIT;

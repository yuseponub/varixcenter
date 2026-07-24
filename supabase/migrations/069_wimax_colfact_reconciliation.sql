-- Reconcile WiMAX invoices whose transient DBF CUFE was missed by verifying
-- the exact invoice in ColFact and its official XML. This function never
-- emits or retries a fiscal document; it only closes an already linked job.

BEGIN;

CREATE OR REPLACE FUNCTION public.robot_wimax_completar_desde_portal(
  p_job_id UUID,
  p_cufe TEXT,
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
  v_cufe TEXT;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Solo el agente WiMAX puede conciliar desde ColFact';
  END IF;

  v_cufe := lower(trim(COALESCE(p_cufe, '')));
  IF v_cufe !~ '^[0-9a-f]{96}$' THEN
    RAISE EXCEPTION 'CUFE SHA-384 invalido';
  END IF;
  IF pg_column_size(COALESCE(p_evidence, '{}'::JSONB)) > 32768 THEN
    RAISE EXCEPTION 'Evidencia ColFact demasiado grande';
  END IF;

  SELECT * INTO v_job
  FROM public.wimax_invoice_jobs
  WHERE id = p_job_id
    AND estado = 'emitida_sin_cufe'
    AND wimax_factura_numero IS NOT NULL
    AND cufe IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El trabajo no esta esperando CUFE de ColFact';
  END IF;

  SELECT * INTO v_invoice
  FROM public.wimax_facturas
  WHERE numero = v_job.wimax_factura_numero
  FOR UPDATE;
  IF NOT FOUND
     OR regexp_replace(COALESCE(v_invoice.cedula, ''), '[^0-9]', '', 'g') <>
        regexp_replace(COALESCE(v_job.paciente->>'cedula', ''), '[^0-9]', '', 'g')
     OR v_invoice.total <> v_job.monto THEN
    RAISE EXCEPTION 'La factura reflejada no coincide con el trabajo';
  END IF;
  IF v_invoice.cufe IS NOT NULL AND lower(v_invoice.cufe) <> v_cufe THEN
    RAISE EXCEPTION 'La factura ya tiene un CUFE diferente';
  END IF;

  UPDATE public.wimax_facturas
  SET
    cufe = v_cufe,
    estado_dian = 'confirmada_portal',
    sync_at = now()
  WHERE numero = v_invoice.numero;

  UPDATE public.payment_invoicing
  SET
    estado = 'facturada_total',
    monto_a_facturar = v_job.monto,
    wimax_factura_numero = v_invoice.numero
  WHERE payment_id = v_job.payment_id
    AND estado = 'pendiente'
    AND wimax_factura_numero IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pago ya no esta pendiente o tiene otra factura';
  END IF;

  UPDATE public.wimax_invoice_jobs
  SET
    estado = 'completada',
    cufe = v_cufe,
    ui_evidence = COALESCE(ui_evidence, '{}'::JSONB) ||
      jsonb_build_object('portal_confirmation', COALESCE(p_evidence, '{}'::JSONB)),
    completed_at = now(),
    last_step = 'cufe_confirmado_portal',
    lease_token = NULL,
    lease_expires_at = NULL,
    error_code = NULL,
    error_message = NULL
  WHERE id = v_job.id;

  RETURN jsonb_build_object(
    'success', true,
    'estado', 'completada',
    'numero', v_invoice.numero,
    'cufe', v_cufe
  );
END;
$$;

REVOKE ALL ON FUNCTION public.robot_wimax_completar_desde_portal(UUID, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.robot_wimax_completar_desde_portal(UUID, TEXT, JSONB)
  TO service_role;

COMMENT ON FUNCTION public.robot_wimax_completar_desde_portal(UUID, TEXT, JSONB) IS
  'Cierra atomicamente una FE ya emitida y enlazada despues de validar su CUFE en el XML oficial de ColFact.';

COMMIT;

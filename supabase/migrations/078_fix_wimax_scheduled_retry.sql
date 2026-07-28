-- Allow an urgent/closing job that failed safely to be prepared again.
-- The canonical preparer resets existing jobs as supervised before this
-- wrapper assigns the requested scheduled mode. Normalize that intermediate
-- state atomically so the supervision consistency constraint is never broken.

BEGIN;

CREATE OR REPLACE FUNCTION public.preparar_factura_wimax_programada(
  p_payment_id UUID,
  p_items JSONB,
  p_modo TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result JSONB;
  v_job_id UUID;
BEGIN
  IF p_modo NOT IN ('urgente', 'cierre') THEN
    RAISE EXCEPTION 'Modo de ejecucion WiMAX invalido';
  END IF;

  -- preparar_factura_wimax reuses retryable rows and first resets them to a
  -- supervised job. A previous urgent/closing attempt must therefore be put
  -- into the matching structural state before that canonical reset. This is
  -- part of the same transaction and rolls back if any later validation fails.
  UPDATE public.wimax_invoice_jobs
  SET
    modo_ejecucion = 'supervisada',
    supervisada = true
  WHERE payment_id = p_payment_id
    AND estado IN ('en_cola', 'bloqueada_duplicado', 'error')
    AND modo_ejecucion IN ('urgente', 'cierre');

  -- The canonical function owns role, payment, catalog, amount and cloud
  -- dedup validation. Both calls run in this transaction, so no transient
  -- unapproved job is observable if the scheduling update fails.
  v_result := public.preparar_factura_wimax(p_payment_id, p_items);
  v_job_id := (v_result->>'job_id')::UUID;

  UPDATE public.wimax_invoice_jobs
  SET
    modo_ejecucion = p_modo,
    supervisada = false,
    approved_by = auth.uid(),
    approved_at = now(),
    last_step = CASE
      WHEN estado = 'en_cola' THEN 'emision_preautorizada_' || p_modo
      ELSE last_step
    END
  WHERE id = v_job_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No fue posible programar el trabajo WiMAX';
  END IF;

  RETURN v_result || jsonb_build_object(
    'modo_ejecucion', p_modo,
    'emision_preautorizada', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.preparar_factura_wimax_programada(UUID, JSONB, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preparar_factura_wimax_programada(UUID, JSONB, TEXT)
  TO authenticated;

COMMIT;

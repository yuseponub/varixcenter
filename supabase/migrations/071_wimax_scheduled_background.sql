-- Add explicit, auditable execution modes for immediate coordinated emission
-- and unattended end-of-day batches. A final UI confirmation preauthorizes
-- only the exact canonical amount/items stored in the job snapshot.

BEGIN;

ALTER TABLE public.wimax_invoice_jobs
  ADD COLUMN modo_ejecucion TEXT NOT NULL DEFAULT 'supervisada';

ALTER TABLE public.wimax_invoice_jobs
  ADD CONSTRAINT wimax_invoice_jobs_modo_ejecucion_valid CHECK (
    modo_ejecucion IN ('supervisada', 'urgente', 'cierre')
  );

ALTER TABLE public.wimax_invoice_jobs
  DROP CONSTRAINT wimax_invoice_jobs_supervised_initially;

ALTER TABLE public.wimax_invoice_jobs
  ADD CONSTRAINT wimax_invoice_jobs_supervision_consistent CHECK (
    (modo_ejecucion = 'supervisada' AND supervisada = true)
    OR (modo_ejecucion IN ('urgente', 'cierre') AND supervisada = false)
  );

COMMENT ON COLUMN public.wimax_invoice_jobs.modo_ejecucion IS
  'supervisada espera autorizacion con WiMAX preparado; urgente solicita el escritorio; cierre se procesa en el lote nocturno.';
COMMENT ON COLUMN public.wimax_invoice_jobs.approved_at IS
  'En urgente/cierre registra la confirmacion final previa sobre el snapshot exacto; en supervisada registra la aprobacion con WiMAX preparado.';

CREATE INDEX idx_wimax_invoice_jobs_scheduled_queue
  ON public.wimax_invoice_jobs (estado, modo_ejecucion, queued_at, id)
  WHERE estado = 'en_cola';

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

CREATE OR REPLACE FUNCTION public.robot_wimax_reclamar_modos(
  p_agent_id TEXT,
  p_modos TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job RECORD;
  v_token UUID := gen_random_uuid();
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Solo el agente WiMAX puede reclamar trabajos';
  END IF;
  IF p_agent_id IS NULL OR p_agent_id !~ '^[A-Za-z0-9._-]{3,80}$' THEN
    RAISE EXCEPTION 'Identificador de agente invalido';
  END IF;
  IF p_modos IS NULL OR cardinality(p_modos) NOT BETWEEN 1 AND 3 OR EXISTS (
    SELECT 1
    FROM unnest(p_modos) AS requested(modo)
    WHERE requested.modo IS NULL
       OR requested.modo NOT IN ('supervisada', 'urgente', 'cierre')
  ) THEN
    RAISE EXCEPTION 'Modos de ejecucion WiMAX invalidos';
  END IF;

  UPDATE public.wimax_invoice_jobs
  SET
    estado = 'requiere_revision',
    last_step = 'lease_vencido',
    error_code = 'LEASE_EXPIRED',
    error_message = 'El agente dejo vencer el lease. Revise WiMAX y trafac antes de reintentar.',
    lease_token = NULL,
    lease_expires_at = NULL
  WHERE estado IN ('preparando', 'esperando_aprobacion', 'aprobada', 'verificando')
    AND lease_token IS NOT NULL
    AND lease_expires_at <= now();

  SELECT j.*
  INTO v_job
  FROM public.wimax_invoice_jobs j
  JOIN public.payment_invoicing pi ON pi.payment_id = j.payment_id
  JOIN public.payments p ON p.id = j.payment_id
  WHERE j.estado = 'en_cola'
    AND j.modo_ejecucion = ANY(p_modos)
    AND pi.estado = 'pendiente'
    AND p.estado = 'activo'
  ORDER BY
    CASE j.modo_ejecucion
      WHEN 'urgente' THEN 0
      WHEN 'cierre' THEN 1
      ELSE 2
    END,
    j.queued_at,
    j.id
  FOR UPDATE OF j SKIP LOCKED
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'job', NULL);
  END IF;

  UPDATE public.wimax_invoice_jobs
  SET
    estado = 'preparando',
    agent_id = p_agent_id,
    lease_token = v_token,
    lease_expires_at = now() + interval '10 minutes',
    attempt_count = attempt_count + 1,
    last_step = 'reclamada',
    started_at = COALESCE(started_at, now()),
    error_code = NULL,
    error_message = NULL
  WHERE id = v_job.id
  RETURNING * INTO v_job;

  RETURN jsonb_build_object('success', true, 'job', to_jsonb(v_job));
END;
$$;

REVOKE ALL ON FUNCTION public.robot_wimax_reclamar_modos(TEXT, TEXT[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.robot_wimax_reclamar_modos(TEXT, TEXT[])
  TO service_role;

-- Preserve the original recovery/manual API while giving it the same urgent-
-- first ordering as the scheduled agent.
CREATE OR REPLACE FUNCTION public.robot_wimax_reclamar(p_agent_id TEXT)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.robot_wimax_reclamar_modos(
    p_agent_id,
    ARRAY['urgente', 'cierre', 'supervisada']::TEXT[]
  );
$$;

REVOKE ALL ON FUNCTION public.robot_wimax_reclamar(TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.robot_wimax_reclamar(TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.robot_wimax_posponer_al_cierre(p_job_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Solo el agente WiMAX puede posponer trabajos';
  END IF;

  UPDATE public.wimax_invoice_jobs
  SET
    modo_ejecucion = 'cierre',
    last_step = 'urgente_pospuesta_al_cierre'
  WHERE id = p_job_id
    AND estado = 'en_cola'
    AND modo_ejecucion = 'urgente'
    AND lease_token IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La factura urgente ya no esta disponible para posponer';
  END IF;
  RETURN jsonb_build_object(
    'success', true,
    'job_id', p_job_id,
    'modo_ejecucion', 'cierre'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.robot_wimax_posponer_al_cierre(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.robot_wimax_posponer_al_cierre(UUID)
  TO service_role;

CREATE OR REPLACE FUNCTION public.robot_wimax_esperar_aprobacion(
  p_job_id UUID,
  p_lease_token UUID,
  p_ui_evidence JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_estado TEXT;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Solo el agente WiMAX puede pausar antes de emitir';
  END IF;
  IF pg_column_size(COALESCE(p_ui_evidence, '{}'::JSONB)) > 32768 THEN
    RAISE EXCEPTION 'Evidencia UI demasiado grande';
  END IF;

  UPDATE public.wimax_invoice_jobs
  SET
    estado = CASE
      WHEN modo_ejecucion IN ('urgente', 'cierre')
       AND approved_by IS NOT NULL
       AND approved_at IS NOT NULL
        THEN 'aprobada'
      ELSE 'esperando_aprobacion'
    END,
    ui_evidence = COALESCE(p_ui_evidence, '{}'::JSONB),
    last_step = CASE
      WHEN modo_ejecucion IN ('urgente', 'cierre')
       AND approved_by IS NOT NULL
       AND approved_at IS NOT NULL
        THEN 'asiento_contable_listo_preautorizado'
      ELSE 'asiento_contable_listo'
    END,
    lease_expires_at = CASE
      WHEN modo_ejecucion IN ('urgente', 'cierre')
       AND approved_by IS NOT NULL
       AND approved_at IS NOT NULL
        THEN now() + interval '10 minutes'
      ELSE now() + interval '2 hours'
    END
  WHERE id = p_job_id
    AND lease_token = p_lease_token
    AND lease_expires_at > now()
    AND estado = 'preparando'
  RETURNING estado INTO v_estado;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lease WiMAX invalido al esperar aprobacion';
  END IF;
  RETURN jsonb_build_object('success', true, 'estado', v_estado);
END;
$$;

REVOKE ALL ON FUNCTION public.robot_wimax_esperar_aprobacion(UUID, UUID, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.robot_wimax_esperar_aprobacion(UUID, UUID, JSONB)
  TO service_role;

COMMIT;

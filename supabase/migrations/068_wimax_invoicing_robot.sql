-- Migration: 068_wimax_invoicing_robot.sql
-- Purpose: Safe, supervised WiMAX UI robot with an auditable job lease,
--          conservative DBF/cloud deduplication and CUFE-gated completion.

BEGIN;

-- ============================================================================
-- 1. AUTHORITATIVE INVOICE METADATA
-- ============================================================================

ALTER TABLE public.wimax_facturas
  ADD COLUMN cufe TEXT,
  ADD COLUMN estado_dian TEXT;

ALTER TABLE public.wimax_facturas
  ADD CONSTRAINT wimax_facturas_cufe_valid CHECK (
    cufe IS NULL OR cufe ~ '^[0-9A-Fa-f]{64,128}$'
  );

CREATE UNIQUE INDEX idx_wimax_facturas_cufe_unique
  ON public.wimax_facturas (lower(cufe))
  WHERE cufe IS NOT NULL;

COMMENT ON COLUMN public.wimax_facturas.cufe IS
  'CUFE confirmado por WiMAX/DIAN. El robot no completa un trabajo sin este valor.';

-- ============================================================================
-- 2. WIMAX SERVICE CATALOG AND SUPERVISED JOBS
-- ============================================================================

CREATE TABLE public.wimax_service_catalog (
  referencia TEXT PRIMARY KEY,
  descripcion TEXT NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT wimax_service_catalog_reference_not_blank CHECK (
    char_length(trim(referencia)) BETWEEN 1 AND 40
  ),
  CONSTRAINT wimax_service_catalog_description_not_blank CHECK (
    char_length(trim(descripcion)) BETWEEN 1 AND 120
  )
);

INSERT INTO public.wimax_service_catalog (referencia, descripcion)
VALUES
  ('41651001CONSULT', 'CONSULTA VALORACION'),
  ('41651002ECOREA', 'ECO REABSORCION'),
  ('41651003CONTROL', 'CONTROL'),
  ('41651004DUPLEX', 'DUPLEX'),
  ('41651005ECOREAB', 'ECOREABSORCION'),
  ('41651006FLEBECT', 'FLEBECTOMIA'),
  ('41651007FOTOPLE', 'FOTOPLETISMO'),
  ('41651009LASEREN', 'LASER ENDOVASCULAR'),
  ('41651010PRESOT', 'PRESOTERAPIA'),
  ('41651010LASERSU', 'LASER SUPERFICIAL'),
  ('41651011SCANEO', 'SCANEO'),
  ('41651012SCANEPR', 'SCANEO PRE-TTO'),
  ('41651013DEPILAC', 'HIPERTRICOSIS'),
  ('41651014FOTOREJ', 'FOTOREJUVENECIMIENTO'),
  ('41651015ESCLER', 'ESCLEROTERAPIA SESION'),
  ('41651016INSUMO', 'MEDIAS'),
  ('41651017INSUMO', 'FRAGMIN'),
  ('SES', 'SESION'),
  ('CREMA ARNICA', 'CREMA ARNICA'),
  ('FRAXIPARINE', 'FRAXIPARINE'),
  ('VAES', 'VAES');

CREATE TRIGGER tr_wimax_service_catalog_updated_at
  BEFORE UPDATE ON public.wimax_service_catalog
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.wimax_service_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view WiMAX catalog"
  ON public.wimax_service_catalog
  FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT ON public.wimax_service_catalog TO authenticated;
GRANT ALL ON public.wimax_service_catalog TO service_role;

CREATE TABLE public.wimax_invoice_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL UNIQUE
    REFERENCES public.payments(id) ON DELETE RESTRICT,
  estado TEXT NOT NULL DEFAULT 'en_cola',
  items JSONB NOT NULL,
  monto NUMERIC(12,2) NOT NULL,
  paciente JSONB NOT NULL,
  supervisada BOOLEAN NOT NULL DEFAULT true,
  requested_by UUID NOT NULL REFERENCES auth.users(id),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  queued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  agent_id TEXT,
  lease_token UUID,
  lease_expires_at TIMESTAMPTZ,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_step TEXT,
  wimax_cliente_codigo TEXT,
  wimax_factura_numero TEXT REFERENCES public.wimax_facturas(numero)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  cufe TEXT,
  dedup_evidence JSONB NOT NULL DEFAULT '{}'::JSONB,
  ui_evidence JSONB NOT NULL DEFAULT '{}'::JSONB,
  error_code TEXT,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT wimax_invoice_jobs_estado_valid CHECK (estado IN (
    'en_cola',
    'preparando',
    'esperando_aprobacion',
    'aprobada',
    'verificando',
    'completada',
    'bloqueada_duplicado',
    'emitida_sin_cufe',
    'requiere_revision',
    'error',
    'cancelada'
  )),
  CONSTRAINT wimax_invoice_jobs_items_valid CHECK (
    jsonb_typeof(items) = 'array'
    AND jsonb_array_length(items) BETWEEN 1 AND 20
  ),
  CONSTRAINT wimax_invoice_jobs_amount_positive CHECK (monto > 0),
  CONSTRAINT wimax_invoice_jobs_supervised_initially CHECK (supervisada = true),
  CONSTRAINT wimax_invoice_jobs_attempt_nonnegative CHECK (attempt_count >= 0),
  CONSTRAINT wimax_invoice_jobs_error_message_length CHECK (
    error_message IS NULL OR char_length(error_message) <= 1000
  ),
  CONSTRAINT wimax_invoice_jobs_cufe_valid CHECK (
    cufe IS NULL OR cufe ~ '^[0-9A-Fa-f]{64,128}$'
  ),
  CONSTRAINT wimax_invoice_jobs_completed_has_identity CHECK (
    estado <> 'completada'
    OR (wimax_factura_numero IS NOT NULL AND cufe IS NOT NULL AND completed_at IS NOT NULL)
  )
);

COMMENT ON TABLE public.wimax_invoice_jobs IS
  'Trabajos supervisados para el robot UI de WiMAX. Una fila auditable por pago; los pagos permanecen inmutables.';
COMMENT ON COLUMN public.wimax_invoice_jobs.dedup_evidence IS
  'Evidencia sin PII del doble chequeo contra wimax_facturas y tmdir/trafac.';
COMMENT ON COLUMN public.wimax_invoice_jobs.ui_evidence IS
  'Pasos/titulos/huellas de screenshots locales; nunca contiene imagenes ni datos clinicos.';

CREATE INDEX idx_wimax_invoice_jobs_queue
  ON public.wimax_invoice_jobs (estado, queued_at)
  WHERE estado IN ('en_cola', 'preparando', 'esperando_aprobacion', 'aprobada', 'verificando');
CREATE INDEX idx_wimax_invoice_jobs_lease
  ON public.wimax_invoice_jobs (lease_expires_at)
  WHERE lease_token IS NOT NULL;

CREATE TRIGGER tr_wimax_invoice_jobs_updated_at
  BEFORE UPDATE ON public.wimax_invoice_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER tr_audit_wimax_invoice_jobs
  AFTER INSERT OR UPDATE ON public.wimax_invoice_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_trigger_func();

ALTER TABLE public.wimax_invoice_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin and secretaria can view WiMAX robot jobs"
  ON public.wimax_invoice_jobs
  FOR SELECT
  TO authenticated
  USING (public.get_user_role() IN ('admin', 'secretaria'));

GRANT SELECT ON public.wimax_invoice_jobs TO authenticated;
GRANT ALL ON public.wimax_invoice_jobs TO service_role;

-- Keep the mutable invoicing queue consistent with the immutable job snapshot.
-- The UI also disables these edits, but the database guard closes direct
-- PostgREST calls and races between a user action and the background agent.
CREATE OR REPLACE FUNCTION public.proteger_pago_con_trabajo_wimax()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job RECORD;
BEGIN
  IF COALESCE(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  SELECT estado, monto, wimax_factura_numero
  INTO v_job
  FROM public.wimax_invoice_jobs
  WHERE payment_id = OLD.payment_id
    AND estado IN (
      'en_cola', 'preparando', 'esperando_aprobacion', 'aprobada',
      'verificando', 'emitida_sin_cufe', 'requiere_revision'
    );

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- registrar_cufe_factura_wimax first stores a CUFE on the immutable FE and
  -- then closes the payment. This is the only user-driven terminal transition
  -- allowed while a protected job exists.
  IF v_job.estado = 'emitida_sin_cufe'
     AND NEW.estado = 'facturada_total'
     AND NEW.wimax_factura_numero = v_job.wimax_factura_numero
     AND round(NEW.monto_a_facturar, 2) = v_job.monto
     AND EXISTS (
       SELECT 1
       FROM public.wimax_facturas wf
       WHERE wf.numero = v_job.wimax_factura_numero
         AND wf.cufe IS NOT NULL
     ) THEN
    RETURN NEW;
  END IF;

  IF NEW.estado IS DISTINCT FROM OLD.estado
     OR NEW.wimax_factura_numero IS DISTINCT FROM OLD.wimax_factura_numero
     OR NEW.motivo_descarte IS DISTINCT FROM OLD.motivo_descarte
     OR NEW.descartada_por IS DISTINCT FROM OLD.descartada_por
     OR NEW.descartada_at IS DISTINCT FROM OLD.descartada_at
     OR (
       NEW.monto_a_facturar IS DISTINCT FROM OLD.monto_a_facturar
       AND round(NEW.monto_a_facturar, 2) IS DISTINCT FROM v_job.monto
     ) THEN
    RAISE EXCEPTION 'El pago tiene un trabajo WiMAX protegido; resuelva primero el estado del robot';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_guard_payment_invoicing_wimax_job
  BEFORE UPDATE ON public.payment_invoicing
  FOR EACH ROW
  EXECUTE FUNCTION public.proteger_pago_con_trabajo_wimax();

REVOKE ALL ON FUNCTION public.proteger_pago_con_trabajo_wimax() FROM PUBLIC;

-- ============================================================================
-- 3. NORMALIZATION HELPERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.normalizar_nombre_wimax(p_value TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT trim(
    regexp_replace(
      translate(
        upper(COALESCE(p_value, '')),
        'ÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑÇ',
        'AAAAEEEEIIIIOOOOUUUUNC'
      ),
      '[^A-Z0-9]+',
      ' ',
      'g'
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.firma_nombre_wimax(p_value TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT COALESCE(string_agg(token, ' ' ORDER BY token), '')
  FROM regexp_split_to_table(public.normalizar_nombre_wimax(p_value), '\s+') AS token
  WHERE token <> ''
    AND token NOT IN ('DE', 'DEL', 'LA', 'LAS', 'LOS', 'Y');
$$;

REVOKE ALL ON FUNCTION public.normalizar_nombre_wimax(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.firma_nombre_wimax(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalizar_nombre_wimax(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.firma_nombre_wimax(TEXT) TO authenticated, service_role;

-- ============================================================================
-- 4. USER: PREPARE, APPROVE AND MANUALLY COMPLETE A JOB
-- ============================================================================

CREATE OR REPLACE FUNCTION public.preparar_factura_wimax(
  p_payment_id UUID,
  p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role TEXT;
  v_payment RECORD;
  v_existing_job RECORD;
  v_raw JSONB;
  v_reference TEXT;
  v_description TEXT;
  v_quantity INTEGER;
  v_price NUMERIC(12,2);
  v_total NUMERIC(12,2) := 0;
  v_items JSONB := '[]'::JSONB;
  v_cedula TEXT;
  v_candidates JSONB;
  v_state TEXT;
  v_job RECORD;
BEGIN
  v_role := public.get_user_role();
  IF auth.uid() IS NULL OR COALESCE(v_role, '') NOT IN ('admin', 'secretaria') THEN
    RAISE EXCEPTION 'Solo Admin y Secretaria pueden crear facturas WiMAX';
  END IF;

  IF jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'La factura debe tener entre 1 y 20 items';
  END IF;

  SELECT
    p.id,
    p.total,
    p.created_at,
    p.numero_factura,
    p.estado,
    pi.estado AS invoicing_estado,
    pa.cedula,
    pa.nombre,
    pa.apellido,
    pa.celular,
    pa.ciudad
  INTO v_payment
  FROM public.payments p
  JOIN public.payment_invoicing pi ON pi.payment_id = p.id
  JOIN public.patients pa ON pa.id = p.patient_id
  WHERE p.id = p_payment_id
  FOR UPDATE OF pi;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pago no esta en la cola de facturacion';
  END IF;
  IF v_payment.estado <> 'activo' THEN
    RAISE EXCEPTION 'No se puede facturar un pago anulado';
  END IF;
  IF v_payment.invoicing_estado <> 'pendiente' THEN
    RAISE EXCEPTION 'El pago ya no esta pendiente de facturacion';
  END IF;

  v_cedula := NULLIF(regexp_replace(COALESCE(v_payment.cedula, ''), '[^0-9]', '', 'g'), '');
  IF v_cedula IS NULL OR char_length(v_cedula) NOT BETWEEN 5 AND 15 THEN
    RAISE EXCEPTION 'El paciente necesita una cedula valida antes de facturar';
  END IF;

  FOR v_raw IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    IF jsonb_typeof(v_raw) <> 'object' THEN
      RAISE EXCEPTION 'Cada item de factura debe ser un objeto';
    END IF;

    v_reference := upper(trim(COALESCE(v_raw->>'referencia', '')));
    SELECT descripcion
    INTO v_description
    FROM public.wimax_service_catalog
    WHERE referencia = v_reference
      AND activo = true;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Referencia WiMAX no permitida: %', v_reference;
    END IF;

    IF COALESCE(v_raw->>'cantidad', '') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'Cantidad invalida para %', v_reference;
    END IF;
    v_quantity := (v_raw->>'cantidad')::INTEGER;
    IF v_quantity NOT BETWEEN 1 AND 99 THEN
      RAISE EXCEPTION 'Cantidad fuera de rango para %', v_reference;
    END IF;

    BEGIN
      v_price := round((v_raw->>'precio_unitario')::NUMERIC, 2);
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Precio invalido para %', v_reference;
    END;
    IF v_price <= 0 OR v_price > 9999999999.99 THEN
      RAISE EXCEPTION 'Precio fuera de rango para %', v_reference;
    END IF;

    v_total := v_total + (v_quantity * v_price);
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'referencia', v_reference,
      'descripcion', v_description,
      'cantidad', v_quantity,
      'precio_unitario', v_price
    ));
  END LOOP;

  v_total := round(v_total, 2);
  IF v_total <> round(v_payment.total, 2) THEN
    RAISE EXCEPTION 'El total WiMAX (%) debe ser igual al pago registrado (%)',
      v_total, round(v_payment.total, 2);
  END IF;

  SELECT *
  INTO v_existing_job
  FROM public.wimax_invoice_jobs
  WHERE payment_id = p_payment_id
  FOR UPDATE;

  IF FOUND AND v_existing_job.estado IN (
    'preparando', 'esperando_aprobacion', 'aprobada', 'verificando',
    'completada', 'emitida_sin_cufe', 'requiere_revision'
  ) THEN
    RAISE EXCEPTION 'El trabajo WiMAX ya esta en estado %', v_existing_job.estado;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'numero', wf.numero,
    'emision', wf.emision,
    'total', wf.total,
    'origen', 'wimax_facturas'
  ) ORDER BY wf.emision, wf.numero), '[]'::JSONB)
  INTO v_candidates
  FROM public.wimax_facturas wf
  WHERE regexp_replace(COALESCE(wf.cedula, ''), '[^0-9]', '', 'g') = v_cedula
    AND wf.emision BETWEEN
      ((v_payment.created_at AT TIME ZONE 'America/Bogota')::DATE - 2)
      AND ((v_payment.created_at AT TIME ZONE 'America/Bogota')::DATE + 45);

  -- Any recent invoice for the same identity is ambiguous. It may aggregate
  -- several Varix payments, so amount equality alone is not enough to emit.
  v_state := CASE
    WHEN jsonb_array_length(v_candidates) > 0 THEN 'bloqueada_duplicado'
    ELSE 'en_cola'
  END;

  INSERT INTO public.wimax_invoice_jobs (
    payment_id,
    estado,
    items,
    monto,
    paciente,
    supervisada,
    requested_by,
    requested_at,
    queued_at,
    dedup_evidence
  )
  VALUES (
    p_payment_id,
    v_state,
    v_items,
    v_total,
    jsonb_build_object(
      'cedula', v_cedula,
      'nombre', v_payment.nombre,
      'apellido', v_payment.apellido,
      'celular', v_payment.celular,
      'ciudad', v_payment.ciudad,
      'payment_created_at', v_payment.created_at,
      'payment_numero', v_payment.numero_factura
    ),
    true,
    auth.uid(),
    now(),
    now(),
    jsonb_build_object('cloud_candidates', v_candidates)
  )
  ON CONFLICT (payment_id) DO UPDATE
  SET
    estado = EXCLUDED.estado,
    items = EXCLUDED.items,
    monto = EXCLUDED.monto,
    paciente = EXCLUDED.paciente,
    supervisada = true,
    requested_by = EXCLUDED.requested_by,
    requested_at = now(),
    queued_at = now(),
    approved_by = NULL,
    approved_at = NULL,
    agent_id = NULL,
    lease_token = NULL,
    lease_expires_at = NULL,
    last_step = NULL,
    wimax_cliente_codigo = NULL,
    dedup_evidence = EXCLUDED.dedup_evidence,
    ui_evidence = '{}'::JSONB,
    error_code = NULL,
    error_message = NULL,
    started_at = NULL,
    completed_at = NULL
  RETURNING * INTO v_job;

  UPDATE public.payment_invoicing
  SET monto_a_facturar = v_total
  WHERE payment_id = p_payment_id
    AND estado = 'pendiente';

  RETURN jsonb_build_object(
    'success', true,
    'job_id', v_job.id,
    'estado', v_job.estado,
    'candidatas', v_candidates
  );
END;
$$;

REVOKE ALL ON FUNCTION public.preparar_factura_wimax(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preparar_factura_wimax(UUID, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.autorizar_factura_wimax(p_job_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role TEXT;
  v_job RECORD;
BEGIN
  v_role := public.get_user_role();
  IF auth.uid() IS NULL OR COALESCE(v_role, '') NOT IN ('admin', 'secretaria') THEN
    RAISE EXCEPTION 'Solo Admin y Secretaria pueden autorizar la emision';
  END IF;

  SELECT * INTO v_job
  FROM public.wimax_invoice_jobs
  WHERE id = p_job_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Trabajo WiMAX no encontrado'; END IF;
  IF v_job.estado <> 'esperando_aprobacion' THEN
    RAISE EXCEPTION 'El trabajo no esta esperando aprobacion';
  END IF;
  IF v_job.lease_expires_at IS NULL OR v_job.lease_expires_at <= now() THEN
    RAISE EXCEPTION 'El robot ya no esta esperando; revise la pantalla WiMAX';
  END IF;

  UPDATE public.wimax_invoice_jobs
  SET
    estado = 'aprobada',
    approved_by = auth.uid(),
    approved_at = now(),
    last_step = 'emision_autorizada'
  WHERE id = p_job_id;

  RETURN jsonb_build_object('success', true, 'job_id', p_job_id, 'estado', 'aprobada');
END;
$$;

REVOKE ALL ON FUNCTION public.autorizar_factura_wimax(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.autorizar_factura_wimax(UUID) TO authenticated;

-- ============================================================================
-- 5. SERVICE ROLE: ATOMIC CLAIM, HEARTBEAT AND STATE TRANSITIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.robot_wimax_reclamar(p_agent_id TEXT)
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

  -- A dead interactive process must never leave an approved or half-filled
  -- screen eligible for blind continuation. The next poll quarantines every
  -- expired lease; a human must inspect WiMAX before doing anything else.
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
    AND pi.estado = 'pendiente'
    AND p.estado = 'activo'
  ORDER BY j.queued_at, j.id
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

REVOKE ALL ON FUNCTION public.robot_wimax_reclamar(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.robot_wimax_reclamar(TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.robot_wimax_heartbeat(
  p_job_id UUID,
  p_lease_token UUID,
  p_step TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job RECORD;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Solo el agente WiMAX puede renovar trabajos';
  END IF;

  UPDATE public.wimax_invoice_jobs
  SET
    lease_expires_at = now() + CASE
      WHEN estado IN ('esperando_aprobacion', 'aprobada') THEN interval '2 hours'
      ELSE interval '10 minutes'
    END,
    last_step = COALESCE(NULLIF(left(p_step, 120), ''), last_step)
  WHERE id = p_job_id
    AND lease_token = p_lease_token
    AND lease_expires_at > now()
    AND estado IN ('preparando', 'esperando_aprobacion', 'aprobada', 'verificando')
  RETURNING id, estado, lease_expires_at INTO v_job;

  IF NOT FOUND THEN RAISE EXCEPTION 'Lease WiMAX invalido o vencido'; END IF;
  RETURN jsonb_build_object('success', true, 'estado', v_job.estado, 'lease_expires_at', v_job.lease_expires_at);
END;
$$;

REVOKE ALL ON FUNCTION public.robot_wimax_heartbeat(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.robot_wimax_heartbeat(UUID, UUID, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.robot_wimax_registrar_preflight(
  p_job_id UUID,
  p_lease_token UUID,
  p_resultado TEXT,
  p_cliente_codigo TEXT,
  p_evidence JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_state TEXT;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Solo el agente WiMAX puede registrar el preflight';
  END IF;
  IF p_resultado NOT IN ('limpio', 'duplicado', 'ambiguo') THEN
    RAISE EXCEPTION 'Resultado de preflight invalido';
  END IF;
  IF p_cliente_codigo IS NOT NULL AND char_length(trim(p_cliente_codigo)) NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'Codigo de cliente WiMAX invalido';
  END IF;
  IF pg_column_size(COALESCE(p_evidence, '{}'::JSONB)) > 32768 THEN
    RAISE EXCEPTION 'Evidencia de preflight demasiado grande';
  END IF;

  v_state := CASE WHEN p_resultado = 'limpio' THEN 'preparando' ELSE 'bloqueada_duplicado' END;

  UPDATE public.wimax_invoice_jobs
  SET
    estado = v_state,
    wimax_cliente_codigo = NULLIF(trim(p_cliente_codigo), ''),
    dedup_evidence = COALESCE(p_evidence, '{}'::JSONB),
    last_step = 'preflight_' || p_resultado,
    error_code = CASE WHEN p_resultado = 'limpio' THEN NULL ELSE 'DEDUP_' || upper(p_resultado) END,
    error_message = CASE
      WHEN p_resultado = 'duplicado' THEN 'Existe una factura reciente para esta cedula; no se emitio otra.'
      WHEN p_resultado = 'ambiguo' THEN 'La verificacion DBF fue ambigua; se requiere revision humana.'
      ELSE NULL
    END,
    lease_token = CASE WHEN p_resultado = 'limpio' THEN lease_token ELSE NULL END,
    lease_expires_at = CASE WHEN p_resultado = 'limpio' THEN now() + interval '10 minutes' ELSE NULL END
  WHERE id = p_job_id
    AND lease_token = p_lease_token
    AND lease_expires_at > now()
    AND estado = 'preparando';

  IF NOT FOUND THEN RAISE EXCEPTION 'Lease WiMAX invalido para preflight'; END IF;
  RETURN jsonb_build_object('success', true, 'estado', v_state);
END;
$$;

REVOKE ALL ON FUNCTION public.robot_wimax_registrar_preflight(UUID, UUID, TEXT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.robot_wimax_registrar_preflight(UUID, UUID, TEXT, TEXT, JSONB)
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
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Solo el agente WiMAX puede pausar antes de emitir';
  END IF;
  IF pg_column_size(COALESCE(p_ui_evidence, '{}'::JSONB)) > 32768 THEN
    RAISE EXCEPTION 'Evidencia UI demasiado grande';
  END IF;

  UPDATE public.wimax_invoice_jobs
  SET
    estado = 'esperando_aprobacion',
    ui_evidence = COALESCE(p_ui_evidence, '{}'::JSONB),
    last_step = 'asiento_contable_listo',
    lease_expires_at = now() + interval '2 hours'
  WHERE id = p_job_id
    AND lease_token = p_lease_token
    AND lease_expires_at > now()
    AND estado = 'preparando';

  IF NOT FOUND THEN RAISE EXCEPTION 'Lease WiMAX invalido al esperar aprobacion'; END IF;
  RETURN jsonb_build_object('success', true, 'estado', 'esperando_aprobacion');
END;
$$;

REVOKE ALL ON FUNCTION public.robot_wimax_esperar_aprobacion(UUID, UUID, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.robot_wimax_esperar_aprobacion(UUID, UUID, JSONB)
  TO service_role;

CREATE OR REPLACE FUNCTION public.robot_wimax_marcar_verificando(
  p_job_id UUID,
  p_lease_token UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Solo el agente WiMAX puede verificar la emision';
  END IF;

  UPDATE public.wimax_invoice_jobs
  SET
    estado = 'verificando',
    last_step = 'aceptando_emision_dian',
    lease_expires_at = now() + interval '10 minutes'
  WHERE id = p_job_id
    AND lease_token = p_lease_token
    AND lease_expires_at > now()
    AND estado = 'aprobada';

  IF NOT FOUND THEN RAISE EXCEPTION 'La emision no fue autorizada o el lease vencio'; END IF;
  RETURN jsonb_build_object('success', true, 'estado', 'verificando');
END;
$$;

REVOKE ALL ON FUNCTION public.robot_wimax_marcar_verificando(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.robot_wimax_marcar_verificando(UUID, UUID)
  TO service_role;

CREATE OR REPLACE FUNCTION public.robot_wimax_completar(
  p_job_id UUID,
  p_lease_token UUID,
  p_numero TEXT,
  p_emision DATE,
  p_cedula TEXT,
  p_nombre TEXT,
  p_total NUMERIC,
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
  v_cedula TEXT;
  v_invoice RECORD;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Solo el agente WiMAX puede completar trabajos';
  END IF;

  SELECT * INTO v_job
  FROM public.wimax_invoice_jobs
  WHERE id = p_job_id
    AND lease_token = p_lease_token
    AND lease_expires_at > now()
  FOR UPDATE;

  IF NOT FOUND OR v_job.estado <> 'verificando' THEN
    RAISE EXCEPTION 'Trabajo WiMAX no verificable';
  END IF;

  v_cedula := regexp_replace(COALESCE(p_cedula, ''), '[^0-9]', '', 'g');
  IF upper(trim(COALESCE(p_numero, ''))) !~ '^FE[0-9]+$' THEN
    RAISE EXCEPTION 'Numero FE invalido';
  END IF;
  IF p_cufe IS NULL OR p_cufe !~ '^[0-9A-Fa-f]{64,128}$' THEN
    RAISE EXCEPTION 'CUFE invalido o ausente';
  END IF;
  IF v_cedula <> v_job.paciente->>'cedula' THEN
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
  IF pg_column_size(COALESCE(p_evidence, '{}'::JSONB)) > 32768 THEN
    RAISE EXCEPTION 'Evidencia UI demasiado grande';
  END IF;

  INSERT INTO public.wimax_facturas (
    numero, emision, cedula, nombre, total, mes_origen, sync_at, cufe, estado_dian
  )
  VALUES (
    upper(trim(p_numero)), p_emision, v_cedula, NULLIF(trim(p_nombre), ''),
    round(p_total, 2), to_char(p_emision, 'YYYY-MM'), now(), lower(p_cufe), 'confirmada_robot'
  )
  ON CONFLICT (numero) DO UPDATE
  SET
    sync_at = now(),
    cufe = COALESCE(public.wimax_facturas.cufe, EXCLUDED.cufe),
    estado_dian = 'confirmada_robot'
  WHERE regexp_replace(COALESCE(public.wimax_facturas.cedula, ''), '[^0-9]', '', 'g') = EXCLUDED.cedula
    AND public.wimax_facturas.total = EXCLUDED.total
    AND public.wimax_facturas.emision = EXCLUDED.emision
  RETURNING * INTO v_invoice;

  IF NOT FOUND OR lower(v_invoice.cufe) <> lower(p_cufe) THEN
    RAISE EXCEPTION 'La FE ya existe con datos distintos; requiere revision';
  END IF;

  UPDATE public.payment_invoicing
  SET
    estado = 'facturada_total',
    monto_a_facturar = v_job.monto,
    wimax_factura_numero = v_invoice.numero
  WHERE payment_id = v_job.payment_id
    AND estado = 'pendiente';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pago ya no esta pendiente; no se completo el trabajo';
  END IF;

  UPDATE public.wimax_invoice_jobs
  SET
    estado = 'completada',
    wimax_factura_numero = v_invoice.numero,
    cufe = lower(p_cufe),
    ui_evidence = COALESCE(ui_evidence, '{}'::JSONB) || COALESCE(p_evidence, '{}'::JSONB),
    last_step = 'cufe_confirmado',
    completed_at = now(),
    lease_token = NULL,
    lease_expires_at = NULL,
    error_code = NULL,
    error_message = NULL
  WHERE id = p_job_id;

  RETURN jsonb_build_object(
    'success', true,
    'estado', 'completada',
    'numero', v_invoice.numero,
    'cufe', lower(p_cufe)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.robot_wimax_completar(UUID, UUID, TEXT, DATE, TEXT, TEXT, NUMERIC, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.robot_wimax_completar(UUID, UUID, TEXT, DATE, TEXT, TEXT, NUMERIC, TEXT, JSONB)
  TO service_role;

CREATE OR REPLACE FUNCTION public.robot_wimax_emitida_sin_cufe(
  p_job_id UUID,
  p_lease_token UUID,
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
  v_cedula TEXT;
  v_invoice RECORD;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Solo el agente WiMAX puede registrar una emision incompleta';
  END IF;

  SELECT * INTO v_job
  FROM public.wimax_invoice_jobs
  WHERE id = p_job_id
    AND lease_token = p_lease_token
    AND lease_expires_at > now()
    AND estado = 'verificando'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Trabajo WiMAX no verificable'; END IF;

  v_cedula := regexp_replace(COALESCE(p_cedula, ''), '[^0-9]', '', 'g');
  IF upper(trim(COALESCE(p_numero, ''))) !~ '^FE[0-9]+$'
     OR v_cedula <> v_job.paciente->>'cedula'
     OR p_total IS NULL
     OR round(p_total, 2) <> v_job.monto THEN
    RAISE EXCEPTION 'La evidencia DBF no coincide con el trabajo';
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
  IF pg_column_size(COALESCE(p_evidence, '{}'::JSONB)) > 32768 THEN
    RAISE EXCEPTION 'Evidencia UI demasiado grande';
  END IF;

  INSERT INTO public.wimax_facturas (
    numero, emision, cedula, nombre, total, mes_origen, sync_at, estado_dian
  )
  VALUES (
    upper(trim(p_numero)), p_emision, v_cedula, NULLIF(trim(p_nombre), ''),
    round(p_total, 2), to_char(p_emision, 'YYYY-MM'), now(), 'cufe_pendiente'
  )
  ON CONFLICT (numero) DO NOTHING;

  SELECT * INTO v_invoice
  FROM public.wimax_facturas
  WHERE numero = upper(trim(p_numero));
  IF NOT FOUND
     OR regexp_replace(COALESCE(v_invoice.cedula, ''), '[^0-9]', '', 'g') <> v_cedula
     OR v_invoice.total <> round(p_total, 2)
     OR v_invoice.emision <> p_emision THEN
    RAISE EXCEPTION 'La FE ya existe con datos distintos; requiere revision';
  END IF;

  UPDATE public.wimax_invoice_jobs
  SET
    estado = 'emitida_sin_cufe',
    wimax_factura_numero = upper(trim(p_numero)),
    ui_evidence = COALESCE(ui_evidence, '{}'::JSONB) || COALESCE(p_evidence, '{}'::JSONB),
    last_step = 'emitida_sin_cufe',
    lease_token = NULL,
    lease_expires_at = NULL,
    error_code = 'CUFE_NO_CAPTURADO',
    error_message = 'WiMAX creo la FE, pero el CUFE temporal no pudo capturarse. Consultelo en ConexusIT.'
  WHERE id = p_job_id;

  RETURN jsonb_build_object('success', true, 'estado', 'emitida_sin_cufe', 'numero', upper(trim(p_numero)));
END;
$$;

REVOKE ALL ON FUNCTION public.robot_wimax_emitida_sin_cufe(UUID, UUID, TEXT, DATE, TEXT, TEXT, NUMERIC, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.robot_wimax_emitida_sin_cufe(UUID, UUID, TEXT, DATE, TEXT, TEXT, NUMERIC, JSONB)
  TO service_role;

CREATE OR REPLACE FUNCTION public.robot_wimax_fallar(
  p_job_id UUID,
  p_lease_token UUID,
  p_error_code TEXT,
  p_error_message TEXT,
  p_resultado_ambiguo BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_state TEXT;
  v_previous_state TEXT;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Solo el agente WiMAX puede fallar trabajos';
  END IF;

  SELECT estado INTO v_previous_state
  FROM public.wimax_invoice_jobs
  WHERE id = p_job_id
    AND lease_token = p_lease_token
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lease WiMAX invalido al registrar error'; END IF;

  v_state := CASE
    WHEN p_resultado_ambiguo OR v_previous_state IN ('aprobada', 'verificando')
      THEN 'requiere_revision'
    ELSE 'error'
  END;

  UPDATE public.wimax_invoice_jobs
  SET
    estado = v_state,
    error_code = left(COALESCE(NULLIF(trim(p_error_code), ''), 'ROBOT_ERROR'), 80),
    error_message = left(COALESCE(NULLIF(trim(p_error_message), ''), 'Error no especificado'), 1000),
    last_step = 'error',
    lease_token = NULL,
    lease_expires_at = NULL
  WHERE id = p_job_id;

  RETURN jsonb_build_object('success', true, 'estado', v_state);
END;
$$;

REVOKE ALL ON FUNCTION public.robot_wimax_fallar(UUID, UUID, TEXT, TEXT, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.robot_wimax_fallar(UUID, UUID, TEXT, TEXT, BOOLEAN)
  TO service_role;

CREATE OR REPLACE FUNCTION public.registrar_cufe_factura_wimax(
  p_job_id UUID,
  p_cufe TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role TEXT;
  v_job RECORD;
BEGIN
  v_role := public.get_user_role();
  IF auth.uid() IS NULL OR COALESCE(v_role, '') NOT IN ('admin', 'secretaria') THEN
    RAISE EXCEPTION 'Solo Admin y Secretaria pueden registrar el CUFE';
  END IF;
  IF p_cufe IS NULL OR p_cufe !~ '^[0-9A-Fa-f]{64,128}$' THEN
    RAISE EXCEPTION 'CUFE invalido';
  END IF;

  SELECT * INTO v_job
  FROM public.wimax_invoice_jobs
  WHERE id = p_job_id
  FOR UPDATE;
  IF NOT FOUND OR v_job.estado <> 'emitida_sin_cufe' OR v_job.wimax_factura_numero IS NULL THEN
    RAISE EXCEPTION 'El trabajo no esta esperando CUFE';
  END IF;

  UPDATE public.wimax_facturas
  SET cufe = lower(p_cufe), estado_dian = 'confirmada_manual', sync_at = now()
  WHERE numero = v_job.wimax_factura_numero
    AND (cufe IS NULL OR lower(cufe) = lower(p_cufe));
  IF NOT FOUND THEN RAISE EXCEPTION 'La FE tiene un CUFE diferente'; END IF;

  UPDATE public.payment_invoicing
  SET
    estado = 'facturada_total',
    monto_a_facturar = v_job.monto,
    wimax_factura_numero = v_job.wimax_factura_numero
  WHERE payment_id = v_job.payment_id
    AND estado = 'pendiente';
  IF NOT FOUND THEN RAISE EXCEPTION 'El pago ya no esta pendiente'; END IF;

  UPDATE public.wimax_invoice_jobs
  SET
    estado = 'completada',
    cufe = lower(p_cufe),
    completed_at = now(),
    last_step = 'cufe_confirmado_manual',
    error_code = NULL,
    error_message = NULL
  WHERE id = p_job_id;

  RETURN jsonb_build_object(
    'success', true,
    'estado', 'completada',
    'numero', v_job.wimax_factura_numero
  );
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_cufe_factura_wimax(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_cufe_factura_wimax(UUID, TEXT) TO authenticated;

-- ============================================================================
-- 6. SAFE RECONCILIATION: EXACT, ONE-TO-ONE, NEVER PARTIAL
-- ============================================================================

-- Migration 064's partial matcher could consume an invoice that was an exact
-- match for a later payment. Re-open those two-state automatic results so the
-- exact matcher can allocate invoices without hiding a remaining balance.
UPDATE public.payment_invoicing
SET
  estado = 'pendiente',
  wimax_factura_numero = NULL
WHERE estado = 'facturada_parcial';

CREATE OR REPLACE FUNCTION public.cruzar_facturacion_wimax()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_candidate RECORD;
  v_matches INTEGER := 0;
  v_checked INTEGER := 0;
  v_remaining INTEGER := 0;
  v_role TEXT;
BEGIN
  v_role := public.get_user_role();

  IF COALESCE(auth.role(), '') <> 'service_role'
     AND COALESCE(v_role, '') NOT IN ('admin', 'secretaria') THEN
    RAISE EXCEPTION 'Solo Admin, Secretaria o el agente pueden cruzar facturacion WiMAX';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('cruzar_facturacion_wimax'));

  SELECT count(*)::INTEGER INTO v_checked
  FROM public.payment_invoicing pi
  JOIN public.payments p ON p.id = pi.payment_id
  WHERE pi.estado = 'pendiente' AND p.estado = 'activo';

  -- Exact amount only. Cedula wins; an order-insensitive normalized full name
  -- is accepted only when the mirror has no cedula. Candidate order is global,
  -- so a partial amount can never steal an invoice from an exact payment.
  FOR v_candidate IN
    SELECT
      pi.id AS invoicing_id,
      wf.numero,
      CASE
        WHEN regexp_replace(COALESCE(wf.cedula, ''), '[^0-9]', '', 'g') =
             regexp_replace(COALESCE(pa.cedula, ''), '[^0-9]', '', 'g')
          THEN 0
        ELSE 1
      END AS identity_rank,
      abs(wf.emision - (p.created_at AT TIME ZONE 'America/Bogota')::DATE) AS date_distance,
      p.created_at
    FROM public.payment_invoicing pi
    JOIN public.payments p ON p.id = pi.payment_id
    JOIN public.patients pa ON pa.id = p.patient_id
    CROSS JOIN public.wimax_facturas wf
    WHERE pi.estado = 'pendiente'
      AND p.estado = 'activo'
      AND NOT EXISTS (
        SELECT 1 FROM public.wimax_invoice_jobs j WHERE j.payment_id = pi.payment_id
      )
      AND wf.total = round(COALESCE(pi.monto_a_facturar, p.total), 2)
      AND wf.emision BETWEEN
        ((p.created_at AT TIME ZONE 'America/Bogota')::DATE - 2)
        AND ((p.created_at AT TIME ZONE 'America/Bogota')::DATE + 45)
      AND (
        (
          NULLIF(regexp_replace(COALESCE(pa.cedula, ''), '[^0-9]', '', 'g'), '') IS NOT NULL
          AND regexp_replace(COALESCE(wf.cedula, ''), '[^0-9]', '', 'g') =
              regexp_replace(pa.cedula, '[^0-9]', '', 'g')
        )
        OR (
          NULLIF(regexp_replace(COALESCE(wf.cedula, ''), '[^0-9]', '', 'g'), '') IS NULL
          AND char_length(public.firma_nombre_wimax(pa.nombre || ' ' || pa.apellido)) >= 8
          AND public.firma_nombre_wimax(wf.nombre) =
              public.firma_nombre_wimax(pa.nombre || ' ' || pa.apellido)
        )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.payment_invoicing used
        WHERE used.wimax_factura_numero = wf.numero
          AND used.id <> pi.id
      )
    ORDER BY identity_rank, date_distance, p.created_at, wf.emision, wf.numero, pi.id
  LOOP
    UPDATE public.payment_invoicing pi
    SET
      estado = 'facturada_total',
      wimax_factura_numero = v_candidate.numero
    WHERE pi.id = v_candidate.invoicing_id
      AND pi.estado = 'pendiente'
      AND NOT EXISTS (
        SELECT 1
        FROM public.wimax_invoice_jobs j
        WHERE j.payment_id = pi.payment_id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.payment_invoicing used
        WHERE used.wimax_factura_numero = v_candidate.numero
          AND used.id <> pi.id
      );

    IF FOUND THEN v_matches := v_matches + 1; END IF;
  END LOOP;

  SELECT count(*)::INTEGER INTO v_remaining
  FROM public.payment_invoicing pi
  JOIN public.payments p ON p.id = pi.payment_id
  WHERE pi.estado = 'pendiente' AND p.estado = 'activo';

  RETURN jsonb_build_object(
    'success', true,
    'revisados', v_checked,
    'facturadas_total', v_matches,
    'facturadas_parcial', 0,
    'pendientes', v_remaining
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cruzar_facturacion_wimax() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cruzar_facturacion_wimax() TO authenticated, service_role;

COMMENT ON FUNCTION public.cruzar_facturacion_wimax() IS
  'Cruza FE exactas 1-a-1 por cedula (o nombre normalizado si falta cedula), monto y ventana [-2,+45]. Nunca crea cruces parciales ni toca trabajos del robot.';

COMMIT;

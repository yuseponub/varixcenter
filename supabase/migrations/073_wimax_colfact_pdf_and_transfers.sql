-- Migration: 073_wimax_colfact_pdf_and_transfers.sql
-- Purpose: include transfers in WiMAX eligibility, keep ColFact audit state,
--          and persist official invoice PDFs in private Supabase Storage.

BEGIN;

-- ============================================================================
-- 1. PRIVATE, IMMUTABLE INVOICE DOCUMENTS
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'wimax-invoices',
  'wimax-invoices',
  false,
  10485760,
  ARRAY['application/pdf']::TEXT[]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Billing staff can read WiMAX invoice PDFs'
  ) THEN
    CREATE POLICY "Billing staff can read WiMAX invoice PDFs"
      ON storage.objects
      FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'wimax-invoices'
        AND public.get_user_role() IN ('admin', 'secretaria')
      );
  END IF;
END;
$$;

ALTER TABLE public.wimax_facturas
  ADD COLUMN pdf_storage_path TEXT,
  ADD COLUMN pdf_sha256 TEXT,
  ADD COLUMN pdf_size_bytes BIGINT,
  ADD COLUMN pdf_saved_at TIMESTAMPTZ;

ALTER TABLE public.wimax_facturas
  ADD CONSTRAINT wimax_facturas_pdf_path_valid CHECK (
    pdf_storage_path IS NULL
    OR pdf_storage_path ~ '^facturas/FE[0-9]+-[0-9a-f]{96}\.pdf$'
  ),
  ADD CONSTRAINT wimax_facturas_pdf_sha256_valid CHECK (
    pdf_sha256 IS NULL OR pdf_sha256 ~ '^[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT wimax_facturas_pdf_size_valid CHECK (
    pdf_size_bytes IS NULL
    OR pdf_size_bytes BETWEEN 5 AND 10485760
  ),
  ADD CONSTRAINT wimax_facturas_pdf_complete CHECK (
    (pdf_storage_path IS NULL AND pdf_sha256 IS NULL
      AND pdf_size_bytes IS NULL AND pdf_saved_at IS NULL)
    OR
    (pdf_storage_path IS NOT NULL AND pdf_sha256 IS NOT NULL
      AND pdf_size_bytes IS NOT NULL AND pdf_saved_at IS NOT NULL)
  );

COMMENT ON COLUMN public.wimax_facturas.pdf_storage_path IS
  'Ruta privada e inmutable del PDF oficial descargado de ColFact.';
COMMENT ON COLUMN public.wimax_facturas.pdf_sha256 IS
  'SHA-256 del PDF oficial guardado, para detectar sustituciones o corrupcion.';

-- ============================================================================
-- 2. COLFACT REVIEW STATE ON ELIGIBLE PAYMENTS
-- ============================================================================

ALTER TABLE public.payment_invoicing
  ADD COLUMN colfact_revision_estado TEXT NOT NULL DEFAULT 'no_revisada',
  ADD COLUMN colfact_revision_at TIMESTAMPTZ,
  ADD COLUMN colfact_evidence JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE public.payment_invoicing
  ADD CONSTRAINT payment_invoicing_colfact_revision_valid CHECK (
    colfact_revision_estado IN (
      'no_revisada',
      'sin_coincidencia',
      'coincidencia_ambigua',
      'confirmada'
    )
  ),
  ADD CONSTRAINT payment_invoicing_colfact_evidence_size CHECK (
    pg_column_size(colfact_evidence) <= 32768
  );

-- ============================================================================
-- 3. CARD OR TRANSFER: FUTURE TRIGGER + HISTORICAL BACKFILL
-- ============================================================================

DROP TRIGGER IF EXISTS tr_queue_card_payment_for_invoicing
  ON public.payment_methods;

CREATE OR REPLACE FUNCTION public.queue_electronic_payment_for_invoicing()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.metodo IN ('tarjeta', 'transferencia') THEN
    INSERT INTO public.payment_invoicing (payment_id, estado)
    VALUES (NEW.payment_id, 'pendiente')
    ON CONFLICT (payment_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_queue_electronic_payment_for_invoicing
  AFTER INSERT ON public.payment_methods
  FOR EACH ROW
  WHEN (NEW.metodo IN ('tarjeta', 'transferencia'))
  EXECUTE FUNCTION public.queue_electronic_payment_for_invoicing();

REVOKE ALL ON FUNCTION public.queue_electronic_payment_for_invoicing()
  FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.queue_card_payment_for_invoicing();

COMMENT ON TRIGGER tr_queue_electronic_payment_for_invoicing
  ON public.payment_methods IS
  'Encola cualquier pago activo con una porcion en tarjeta o transferencia.';

INSERT INTO public.payment_invoicing (payment_id, estado)
SELECT DISTINCT p.id, 'pendiente'
FROM public.payments p
JOIN public.payment_methods pm ON pm.payment_id = p.id
WHERE p.estado = 'activo'
  AND pm.metodo IN ('tarjeta', 'transferencia')
ON CONFLICT (payment_id) DO NOTHING;

-- ============================================================================
-- 4. SERVICE-ROLE-ONLY COLFACT AUDIT AND DOCUMENT REGISTRATION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.robot_wimax_registrar_revision_colfact(
  p_payment_id UUID,
  p_estado TEXT,
  p_evidence JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Solo el agente WiMAX puede registrar la revision ColFact';
  END IF;
  IF p_estado NOT IN ('sin_coincidencia', 'coincidencia_ambigua') THEN
    RAISE EXCEPTION 'Estado de revision ColFact invalido';
  END IF;
  IF pg_column_size(COALESCE(p_evidence, '{}'::JSONB)) > 32768 THEN
    RAISE EXCEPTION 'Evidencia ColFact demasiado grande';
  END IF;

  UPDATE public.payment_invoicing pi
  SET
    colfact_revision_estado = p_estado,
    colfact_revision_at = now(),
    colfact_evidence = COALESCE(p_evidence, '{}'::JSONB)
  FROM public.payments p
  WHERE pi.payment_id = p_payment_id
    AND p.id = pi.payment_id
    AND p.estado = 'activo'
    AND pi.estado = 'pendiente';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pago ya no esta pendiente para revision ColFact';
  END IF;

  RETURN jsonb_build_object('success', true, 'estado', p_estado);
END;
$$;

REVOKE ALL ON FUNCTION public.robot_wimax_registrar_revision_colfact(UUID, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.robot_wimax_registrar_revision_colfact(UUID, TEXT, JSONB)
  TO service_role;

CREATE OR REPLACE FUNCTION public.robot_wimax_registrar_documento_colfact(
  p_numero TEXT,
  p_emision DATE,
  p_cedula TEXT,
  p_total NUMERIC,
  p_cufe TEXT,
  p_pdf_path TEXT,
  p_pdf_sha256 TEXT,
  p_pdf_size BIGINT,
  p_evidence JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invoice public.wimax_facturas%ROWTYPE;
  v_numero TEXT := upper(trim(COALESCE(p_numero, '')));
  v_cedula TEXT := regexp_replace(COALESCE(p_cedula, ''), '[^0-9]', '', 'g');
  v_cufe TEXT := lower(trim(COALESCE(p_cufe, '')));
  v_sha TEXT := lower(trim(COALESCE(p_pdf_sha256, '')));
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Solo el agente WiMAX puede guardar documentos ColFact';
  END IF;
  IF v_numero !~ '^FE[0-9]+$' OR v_cufe !~ '^[0-9a-f]{96}$'
     OR v_sha !~ '^[0-9a-f]{64}$'
     OR p_pdf_path <> format('facturas/%s-%s.pdf', v_numero, v_cufe)
     OR p_pdf_size NOT BETWEEN 5 AND 10485760 THEN
    RAISE EXCEPTION 'Identidad o PDF ColFact invalido';
  END IF;
  IF COALESCE((p_evidence->>'colfact_confirmed')::BOOLEAN, false) <> true
     OR COALESCE((p_evidence->>'xml_cufe_verified')::BOOLEAN, false) <> true
     OR COALESCE((p_evidence->>'pdf_verified')::BOOLEAN, false) <> true THEN
    RAISE EXCEPTION 'Falta evidencia oficial XML/PDF de ColFact';
  END IF;

  SELECT * INTO v_invoice
  FROM public.wimax_facturas
  WHERE numero = v_numero
  FOR UPDATE;

  IF NOT FOUND
     OR v_invoice.emision <> p_emision
     OR regexp_replace(COALESCE(v_invoice.cedula, ''), '[^0-9]', '', 'g') <> v_cedula
     OR round(v_invoice.total, 2) <> round(p_total, 2) THEN
    RAISE EXCEPTION 'El documento ColFact no coincide con la factura reflejada';
  END IF;
  IF v_invoice.cufe IS NOT NULL AND lower(v_invoice.cufe) <> v_cufe THEN
    RAISE EXCEPTION 'La factura reflejada ya tiene otro CUFE';
  END IF;
  IF v_invoice.pdf_sha256 IS NOT NULL AND v_invoice.pdf_sha256 <> v_sha THEN
    RAISE EXCEPTION 'La factura reflejada ya tiene otro PDF';
  END IF;

  UPDATE public.wimax_facturas
  SET
    cufe = v_cufe,
    estado_dian = 'confirmada_portal',
    pdf_storage_path = p_pdf_path,
    pdf_sha256 = v_sha,
    pdf_size_bytes = p_pdf_size,
    pdf_saved_at = COALESCE(pdf_saved_at, now()),
    sync_at = now()
  WHERE numero = v_numero;

  UPDATE public.payment_invoicing
  SET
    colfact_revision_estado = 'confirmada',
    colfact_revision_at = now(),
    colfact_evidence = COALESCE(p_evidence, '{}'::JSONB)
  WHERE wimax_factura_numero = v_numero;

  RETURN jsonb_build_object(
    'success', true,
    'numero', v_numero,
    'pdf_path', p_pdf_path
  );
END;
$$;

REVOKE ALL ON FUNCTION public.robot_wimax_registrar_documento_colfact(
  TEXT, DATE, TEXT, NUMERIC, TEXT, TEXT, TEXT, BIGINT, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.robot_wimax_registrar_documento_colfact(
  TEXT, DATE, TEXT, NUMERIC, TEXT, TEXT, TEXT, BIGINT, JSONB
) TO service_role;

CREATE OR REPLACE FUNCTION public.robot_wimax_consolidar_pago_colfact(
  p_payment_id UUID,
  p_numero TEXT,
  p_emision DATE,
  p_cedula TEXT,
  p_nombre TEXT,
  p_total NUMERIC,
  p_cufe TEXT,
  p_pdf_path TEXT,
  p_pdf_sha256 TEXT,
  p_pdf_size BIGINT,
  p_evidence JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment RECORD;
  v_invoicing public.payment_invoicing%ROWTYPE;
  v_existing public.wimax_facturas%ROWTYPE;
  v_numero TEXT := upper(trim(COALESCE(p_numero, '')));
  v_cedula TEXT := regexp_replace(COALESCE(p_cedula, ''), '[^0-9]', '', 'g');
  v_cufe TEXT := lower(trim(COALESCE(p_cufe, '')));
  v_sha TEXT := lower(trim(COALESCE(p_pdf_sha256, '')));
  v_electronic_total NUMERIC(12,2);
  v_payment_date DATE;
  v_estado TEXT;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Solo el agente WiMAX puede consolidar desde ColFact';
  END IF;
  IF v_numero !~ '^FE[0-9]+$' OR v_cufe !~ '^[0-9a-f]{96}$'
     OR v_sha !~ '^[0-9a-f]{64}$'
     OR p_pdf_path <> format('facturas/%s-%s.pdf', v_numero, v_cufe)
     OR p_pdf_size NOT BETWEEN 5 AND 10485760 THEN
    RAISE EXCEPTION 'Identidad o PDF ColFact invalido';
  END IF;
  IF COALESCE((p_evidence->>'colfact_confirmed')::BOOLEAN, false) <> true
     OR COALESCE((p_evidence->>'xml_cufe_verified')::BOOLEAN, false) <> true
     OR COALESCE((p_evidence->>'pdf_verified')::BOOLEAN, false) <> true
     OR COALESCE((p_evidence->>'unique_match')::BOOLEAN, false) <> true THEN
    RAISE EXCEPTION 'La consolidacion exige coincidencia unica y evidencia oficial';
  END IF;
  IF pg_column_size(COALESCE(p_evidence, '{}'::JSONB)) > 32768 THEN
    RAISE EXCEPTION 'Evidencia ColFact demasiado grande';
  END IF;

  SELECT
    p.id,
    p.total,
    p.created_at,
    p.estado,
    pa.cedula,
    COALESCE(sum(pm.monto) FILTER (
      WHERE pm.metodo IN ('tarjeta', 'transferencia')
    ), 0)::NUMERIC(12,2) AS electronic_total
  INTO v_payment
  FROM public.payments p
  JOIN public.patients pa ON pa.id = p.patient_id
  LEFT JOIN public.payment_methods pm ON pm.payment_id = p.id
  WHERE p.id = p_payment_id
  GROUP BY p.id, p.total, p.created_at, p.estado, pa.cedula;

  IF NOT FOUND OR v_payment.estado <> 'activo' THEN
    RAISE EXCEPTION 'El pago no existe o no esta activo';
  END IF;

  SELECT * INTO v_invoicing
  FROM public.payment_invoicing
  WHERE payment_id = p_payment_id
  FOR UPDATE;
  IF NOT FOUND OR v_invoicing.estado <> 'pendiente'
     OR v_invoicing.wimax_factura_numero IS NOT NULL THEN
    RAISE EXCEPTION 'El pago ya no esta pendiente de consolidacion';
  END IF;

  v_electronic_total := round(v_payment.electronic_total, 2);
  v_payment_date := (v_payment.created_at AT TIME ZONE 'America/Bogota')::DATE;
  IF regexp_replace(COALESCE(v_payment.cedula, ''), '[^0-9]', '', 'g') <> v_cedula
     OR p_emision NOT BETWEEN (v_payment_date - 2) AND (v_payment_date + 45)
     OR round(p_total, 2) <= 0
     OR round(p_total, 2) > round(v_payment.total, 2)
     OR NOT (
       round(p_total, 2) = round(v_payment.total, 2)
       OR round(p_total, 2) = v_electronic_total
       OR (
         v_invoicing.monto_a_facturar IS NOT NULL
         AND round(p_total, 2) = round(v_invoicing.monto_a_facturar, 2)
       )
     ) THEN
    RAISE EXCEPTION 'La factura ColFact no coincide exactamente con el pago';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.payment_invoicing used
    WHERE used.wimax_factura_numero = v_numero
      AND used.payment_id <> p_payment_id
  ) THEN
    RAISE EXCEPTION 'La factura ColFact ya esta vinculada a otro pago';
  END IF;

  SELECT * INTO v_existing
  FROM public.wimax_facturas
  WHERE numero = v_numero
  FOR UPDATE;
  IF FOUND AND (
    v_existing.emision <> p_emision
    OR regexp_replace(COALESCE(v_existing.cedula, ''), '[^0-9]', '', 'g') <> v_cedula
    OR round(v_existing.total, 2) <> round(p_total, 2)
    OR (v_existing.cufe IS NOT NULL AND lower(v_existing.cufe) <> v_cufe)
    OR (v_existing.pdf_sha256 IS NOT NULL AND v_existing.pdf_sha256 <> v_sha)
  ) THEN
    RAISE EXCEPTION 'La identidad ColFact contradice el espejo WiMAX';
  END IF;

  INSERT INTO public.wimax_facturas (
    numero, emision, cedula, nombre, total, mes_origen, sync_at,
    cufe, estado_dian, pdf_storage_path, pdf_sha256, pdf_size_bytes, pdf_saved_at
  ) VALUES (
    v_numero, p_emision, v_cedula, NULLIF(trim(COALESCE(p_nombre, '')), ''),
    round(p_total, 2), to_char(p_emision, 'YYYY-MM'), now(),
    v_cufe, 'confirmada_portal', p_pdf_path, v_sha, p_pdf_size, now()
  )
  ON CONFLICT (numero) DO UPDATE SET
    cufe = EXCLUDED.cufe,
    estado_dian = EXCLUDED.estado_dian,
    pdf_storage_path = EXCLUDED.pdf_storage_path,
    pdf_sha256 = EXCLUDED.pdf_sha256,
    pdf_size_bytes = EXCLUDED.pdf_size_bytes,
    pdf_saved_at = COALESCE(public.wimax_facturas.pdf_saved_at, now()),
    sync_at = now();

  v_estado := CASE
    WHEN round(p_total, 2) < round(v_payment.total, 2)
      THEN 'facturada_parcial'
    ELSE 'facturada_total'
  END;

  UPDATE public.payment_invoicing
  SET
    estado = v_estado,
    monto_a_facturar = round(p_total, 2),
    wimax_factura_numero = v_numero,
    colfact_revision_estado = 'confirmada',
    colfact_revision_at = now(),
    colfact_evidence = COALESCE(p_evidence, '{}'::JSONB)
  WHERE payment_id = p_payment_id;

  RETURN jsonb_build_object(
    'success', true,
    'estado', v_estado,
    'numero', v_numero,
    'pdf_path', p_pdf_path
  );
END;
$$;

REVOKE ALL ON FUNCTION public.robot_wimax_consolidar_pago_colfact(
  UUID, TEXT, DATE, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, BIGINT, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.robot_wimax_consolidar_pago_colfact(
  UUID, TEXT, DATE, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, BIGINT, JSONB
) TO service_role;

-- Atomic completion used by the normal post-emission reconciler when ColFact
-- supplies both CUFE and PDF. The original three-argument RPC stays available
-- for backwards-compatible manual recovery.
CREATE OR REPLACE FUNCTION public.robot_wimax_completar_desde_portal_pdf(
  p_job_id UUID,
  p_cufe TEXT,
  p_pdf_path TEXT,
  p_pdf_sha256 TEXT,
  p_pdf_size BIGINT,
  p_evidence JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result JSONB;
  v_numero TEXT;
  v_invoice public.wimax_facturas%ROWTYPE;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Solo el agente WiMAX puede completar desde ColFact';
  END IF;

  SELECT wimax_factura_numero INTO v_numero
  FROM public.wimax_invoice_jobs
  WHERE id = p_job_id
  FOR UPDATE;
  IF v_numero IS NULL THEN
    RAISE EXCEPTION 'El trabajo no tiene factura observada';
  END IF;

  SELECT * INTO v_invoice
  FROM public.wimax_facturas
  WHERE numero = v_numero;

  v_result := public.robot_wimax_completar_desde_portal(
    p_job_id,
    p_cufe,
    p_evidence
  );

  PERFORM public.robot_wimax_registrar_documento_colfact(
    v_invoice.numero,
    v_invoice.emision,
    v_invoice.cedula,
    v_invoice.total,
    p_cufe,
    p_pdf_path,
    p_pdf_sha256,
    p_pdf_size,
    p_evidence
  );

  RETURN v_result || jsonb_build_object('pdf_path', p_pdf_path);
END;
$$;

REVOKE ALL ON FUNCTION public.robot_wimax_completar_desde_portal_pdf(
  UUID, TEXT, TEXT, TEXT, BIGINT, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.robot_wimax_completar_desde_portal_pdf(
  UUID, TEXT, TEXT, TEXT, BIGINT, JSONB
) TO service_role;

-- ============================================================================
-- 5. SAFE ONE-TO-ONE DBF RECONCILIATION
-- ============================================================================

-- The original reconciliation selected the first lower-value invoice and
-- could therefore consume an ambiguous historical FE. From now on it accepts
-- only an exact amount (explicit target, full payment or electronic portion),
-- exactly one candidate for the payment, and an invoice contested by no other
-- pending payment.
CREATE OR REPLACE FUNCTION public.cruzar_facturacion_wimax()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_checked INTEGER;
  v_total_matches INTEGER;
  v_partial_matches INTEGER;
  v_remaining INTEGER;
  v_role TEXT;
BEGIN
  v_role := public.get_user_role();
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND v_role NOT IN ('admin', 'secretaria') THEN
    RAISE EXCEPTION 'Solo Admin, Secretaria o el agente pueden cruzar facturacion WiMAX';
  END IF;

  SELECT count(*)::INTEGER INTO v_checked
  FROM public.payment_invoicing pi
  JOIN public.payments p ON p.id = pi.payment_id
  WHERE pi.estado = 'pendiente' AND p.estado = 'activo';

  WITH pending AS (
    SELECT
      pi.id AS invoicing_id,
      pi.payment_id,
      pi.monto_a_facturar,
      round(p.total, 2) AS payment_total,
      (p.created_at AT TIME ZONE 'America/Bogota')::DATE AS payment_date,
      regexp_replace(COALESCE(pa.cedula, ''), '[^0-9]', '', 'g') AS cedula,
      round(COALESCE((
        SELECT sum(pm.monto)
        FROM public.payment_methods pm
        WHERE pm.payment_id = p.id
          AND pm.metodo IN ('tarjeta', 'transferencia')
      ), 0), 2) AS electronic_total
    FROM public.payment_invoicing pi
    JOIN public.payments p ON p.id = pi.payment_id
    JOIN public.patients pa ON pa.id = p.patient_id
    WHERE pi.estado = 'pendiente'
      AND p.estado = 'activo'
  ), candidates AS (
    SELECT
      pending.*,
      wf.numero,
      round(wf.total, 2) AS invoice_total,
      wf.estado_dian,
      count(*) OVER (PARTITION BY pending.invoicing_id) AS candidate_count,
      count(*) OVER (PARTITION BY wf.numero) AS invoice_claim_count
    FROM pending
    JOIN public.wimax_facturas wf
      ON wf.cedula = pending.cedula
     AND wf.emision BETWEEN (pending.payment_date - 2) AND (pending.payment_date + 45)
     AND (
       (
         pending.monto_a_facturar IS NOT NULL
         AND round(wf.total, 2) = round(pending.monto_a_facturar, 2)
       )
       OR (
         pending.monto_a_facturar IS NULL
         AND round(wf.total, 2) IN (pending.payment_total, pending.electronic_total)
       )
     )
    WHERE pending.cedula <> ''
      AND wf.total > 0
      AND NOT EXISTS (
        SELECT 1
        FROM public.payment_invoicing used
        WHERE used.wimax_factura_numero = wf.numero
          AND used.id <> pending.invoicing_id
      )
  ), safe AS (
    SELECT *
    FROM candidates
    WHERE candidate_count = 1 AND invoice_claim_count = 1
  ), updated AS (
    UPDATE public.payment_invoicing pi
    SET
      estado = CASE
        WHEN safe.invoice_total < safe.payment_total
          THEN 'facturada_parcial'
        ELSE 'facturada_total'
      END,
      monto_a_facturar = safe.invoice_total,
      wimax_factura_numero = safe.numero,
      colfact_revision_estado = CASE
        WHEN safe.estado_dian = 'confirmada_portal' THEN 'confirmada'
        ELSE pi.colfact_revision_estado
      END,
      colfact_revision_at = CASE
        WHEN safe.estado_dian = 'confirmada_portal' THEN now()
        ELSE pi.colfact_revision_at
      END
    FROM safe
    WHERE pi.id = safe.invoicing_id
      AND pi.estado = 'pendiente'
    RETURNING pi.estado
  )
  SELECT
    count(*) FILTER (WHERE estado = 'facturada_total')::INTEGER,
    count(*) FILTER (WHERE estado = 'facturada_parcial')::INTEGER
  INTO v_total_matches, v_partial_matches
  FROM updated;

  SELECT count(*)::INTEGER INTO v_remaining
  FROM public.payment_invoicing pi
  JOIN public.payments p ON p.id = pi.payment_id
  WHERE pi.estado = 'pendiente' AND p.estado = 'activo';

  RETURN jsonb_build_object(
    'success', true,
    'revisados', v_checked,
    'facturadas_total', COALESCE(v_total_matches, 0),
    'facturadas_parcial', COALESCE(v_partial_matches, 0),
    'pendientes', v_remaining
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cruzar_facturacion_wimax()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cruzar_facturacion_wimax()
  TO authenticated, service_role;

COMMENT ON FUNCTION public.cruzar_facturacion_wimax() IS
  'Cruza solo una FE exacta, unica y no disputada por pago; nunca elige parciales ambiguos.';

COMMIT;

-- Allow an operator to choose a positive WiMAX amount up to the payment total,
-- and ignore recent FE documents that are already consumed by another payment.
-- Completion state is normalized centrally so every CUFE path (DBF, portal or
-- manual) marks a lower amount as facturada_parcial.

BEGIN;

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
  v_consumed JSONB;
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
  IF v_total > round(v_payment.total, 2) THEN
    RAISE EXCEPTION 'El total WiMAX (%) no puede superar el pago registrado (%)',
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
    'payment_id', used.payment_id
  ) ORDER BY wf.emision, wf.numero), '[]'::JSONB)
  INTO v_consumed
  FROM public.wimax_facturas wf
  JOIN public.payment_invoicing used
    ON used.wimax_factura_numero = wf.numero
   AND used.payment_id <> p_payment_id
   AND used.estado IN ('facturada_total', 'facturada_parcial')
  WHERE regexp_replace(COALESCE(wf.cedula, ''), '[^0-9]', '', 'g') = v_cedula
    AND wf.emision BETWEEN
      ((v_payment.created_at AT TIME ZONE 'America/Bogota')::DATE - 2)
      AND ((v_payment.created_at AT TIME ZONE 'America/Bogota')::DATE + 45);

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
      AND ((v_payment.created_at AT TIME ZONE 'America/Bogota')::DATE + 45)
    AND NOT EXISTS (
      SELECT 1
      FROM public.payment_invoicing used
      WHERE used.wimax_factura_numero = wf.numero
        AND used.payment_id <> p_payment_id
        AND used.estado IN ('facturada_total', 'facturada_parcial')
    );

  -- An unconsumed recent invoice remains ambiguous regardless of its amount.
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
    jsonb_build_object(
      'cloud_candidates', v_candidates,
      'consumed_invoices', v_consumed
    )
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
    'monto', v_total,
    'facturacion_parcial', v_total < round(v_payment.total, 2),
    'candidatas', v_candidates
  );
END;
$$;

REVOKE ALL ON FUNCTION public.preparar_factura_wimax(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preparar_factura_wimax(UUID, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.normalizar_estado_facturacion_parcial_wimax()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment_total NUMERIC(12,2);
BEGIN
  IF NEW.estado NOT IN ('facturada_total', 'facturada_parcial') THEN
    RETURN NEW;
  END IF;
  IF NEW.monto_a_facturar IS NULL OR NEW.wimax_factura_numero IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT round(total, 2)
  INTO v_payment_total
  FROM public.payments
  WHERE id = NEW.payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe el pago de la conciliacion WiMAX';
  END IF;
  IF round(NEW.monto_a_facturar, 2) > v_payment_total THEN
    RAISE EXCEPTION 'El monto facturado en WiMAX supera el pago';
  END IF;

  NEW.estado := CASE
    WHEN round(NEW.monto_a_facturar, 2) < v_payment_total
      THEN 'facturada_parcial'
    ELSE 'facturada_total'
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_normalize_wimax_partial_state
  ON public.payment_invoicing;
CREATE TRIGGER tr_normalize_wimax_partial_state
  BEFORE UPDATE ON public.payment_invoicing
  FOR EACH ROW
  EXECUTE FUNCTION public.normalizar_estado_facturacion_parcial_wimax();

REVOKE ALL ON FUNCTION public.normalizar_estado_facturacion_parcial_wimax()
  FROM PUBLIC;

COMMENT ON FUNCTION public.normalizar_estado_facturacion_parcial_wimax() IS
  'Marca facturada_parcial cuando la FE confirmada es menor que el pago original.';

COMMIT;

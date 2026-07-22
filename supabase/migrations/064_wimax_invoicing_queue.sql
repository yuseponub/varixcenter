-- Migration: 064_wimax_invoicing_queue.sql
-- Purpose: Queue Varix payments that must be invoiced in WiMAX and reconcile
--          them against the read-only WiMAX invoice mirror.
-- Safety: public.payments remains untouched and immutable.

BEGIN;

-- ============================================================================
-- 1. WIMAX INVOICE MIRROR
-- ============================================================================

CREATE TABLE public.wimax_facturas (
  numero TEXT PRIMARY KEY,
  emision DATE NOT NULL,
  cedula TEXT,
  nombre TEXT,
  total NUMERIC(12,2) NOT NULL,
  mes_origen TEXT NOT NULL,
  sync_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT wimax_facturas_total_nonnegative CHECK (total >= 0)
);

COMMENT ON TABLE public.wimax_facturas IS
  'Espejo solo nube de facturas electronicas FE de WiMAX. Lo actualiza el agente con service_role; nunca escribe en FoxPro.';
COMMENT ON COLUMN public.wimax_facturas.cedula IS
  'Cedula normalizada a solo digitos desde tmdir.DIREC4, enlazada por CLAVE.';
COMMENT ON COLUMN public.wimax_facturas.mes_origen IS
  'Mes del archivo trafacMM.dbf del que se leyo la factura, en formato YYYY-MM.';

CREATE INDEX idx_wimax_facturas_match
  ON public.wimax_facturas (cedula, emision, total);
CREATE INDEX idx_wimax_facturas_sync_at
  ON public.wimax_facturas (sync_at DESC);

ALTER TABLE public.wimax_facturas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin and secretaria can view WiMAX invoices"
  ON public.wimax_facturas
  FOR SELECT
  TO authenticated
  USING (public.get_user_role() IN ('admin', 'secretaria'));

GRANT SELECT ON public.wimax_facturas TO authenticated;
GRANT ALL ON public.wimax_facturas TO service_role;

-- ============================================================================
-- 2. PAYMENT INVOICING QUEUE (payments itself stays immutable)
-- ============================================================================

CREATE TABLE public.payment_invoicing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL UNIQUE
    REFERENCES public.payments(id) ON DELETE RESTRICT,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  monto_a_facturar NUMERIC(12,2),
  wimax_factura_numero TEXT UNIQUE
    REFERENCES public.wimax_facturas(numero) ON UPDATE CASCADE ON DELETE RESTRICT,
  pidio_factura BOOLEAN NOT NULL DEFAULT false,
  motivo_descarte TEXT,
  descartada_por UUID REFERENCES auth.users(id),
  descartada_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT payment_invoicing_estado_valid CHECK (
    estado IN ('pendiente', 'facturada_total', 'facturada_parcial', 'descartada')
  ),
  CONSTRAINT payment_invoicing_monto_positive CHECK (
    monto_a_facturar IS NULL OR monto_a_facturar > 0
  ),
  CONSTRAINT payment_invoicing_discard_requires_reason CHECK (
    estado <> 'descartada'
    OR (
      motivo_descarte IS NOT NULL
      AND char_length(trim(motivo_descarte)) >= 5
      AND descartada_at IS NOT NULL
    )
  ),
  CONSTRAINT payment_invoicing_match_requires_invoice CHECK (
    estado NOT IN ('facturada_total', 'facturada_parcial')
    OR wimax_factura_numero IS NOT NULL
  )
);

COMMENT ON TABLE public.payment_invoicing IS
  'Estado mutable de facturacion externa para pagos inmutables. Una fila por pago.';
COMMENT ON COLUMN public.payment_invoicing.monto_a_facturar IS
  'Monto editable verificado a ojo antes de digitar en WiMAX; NULL usa payments.total como sugerido.';
COMMENT ON COLUMN public.payment_invoicing.motivo_descarte IS
  'Motivo obligatorio cuando la secretaria o el administrador descarta un pendiente.';

CREATE INDEX idx_payment_invoicing_estado_created
  ON public.payment_invoicing (estado, created_at);
CREATE INDEX idx_payment_invoicing_updated
  ON public.payment_invoicing (updated_at DESC);

CREATE TRIGGER tr_payment_invoicing_updated_at
  BEFORE UPDATE ON public.payment_invoicing
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER tr_audit_payment_invoicing
  AFTER INSERT OR UPDATE ON public.payment_invoicing
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_trigger_func();

ALTER TABLE public.payment_invoicing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin and secretaria can view payment invoicing"
  ON public.payment_invoicing
  FOR SELECT
  TO authenticated
  USING (public.get_user_role() IN ('admin', 'secretaria'));

CREATE POLICY "Admin and secretaria can enqueue payment invoicing"
  ON public.payment_invoicing
  FOR INSERT
  TO authenticated
  WITH CHECK (public.get_user_role() IN ('admin', 'secretaria'));

CREATE POLICY "Admin and secretaria can update payment invoicing"
  ON public.payment_invoicing
  FOR UPDATE
  TO authenticated
  USING (public.get_user_role() IN ('admin', 'secretaria'))
  WITH CHECK (public.get_user_role() IN ('admin', 'secretaria'));

GRANT SELECT, INSERT ON public.payment_invoicing TO authenticated;
GRANT UPDATE (
  estado,
  monto_a_facturar,
  wimax_factura_numero,
  pidio_factura,
  motivo_descarte,
  descartada_por,
  descartada_at,
  updated_at
) ON public.payment_invoicing TO authenticated;
GRANT ALL ON public.payment_invoicing TO service_role;

-- ============================================================================
-- 3. AUTOMATIC CARD QUEUEING
-- ============================================================================

CREATE OR REPLACE FUNCTION public.queue_card_payment_for_invoicing()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.metodo = 'tarjeta' THEN
    INSERT INTO public.payment_invoicing (payment_id, estado)
    VALUES (NEW.payment_id, 'pendiente')
    ON CONFLICT (payment_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_queue_card_payment_for_invoicing
  AFTER INSERT ON public.payment_methods
  FOR EACH ROW
  WHEN (NEW.metodo = 'tarjeta')
  EXECUTE FUNCTION public.queue_card_payment_for_invoicing();

REVOKE ALL ON FUNCTION public.queue_card_payment_for_invoicing() FROM PUBLIC;

COMMENT ON TRIGGER tr_queue_card_payment_for_invoicing ON public.payment_methods IS
  'Encola pagos con tarjeta sin modificar payments ni create_payment_with_invoice.';

-- Explicit RPC used by the payment form when the patient asks for an invoice.
-- On conflict it only raises the request flag: it never reverts a terminal state.
CREATE OR REPLACE FUNCTION public.encolar_pago_facturacion(
  p_payment_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_role TEXT;
BEGIN
  v_role := public.get_user_role();

  IF auth.uid() IS NULL
     OR v_role NOT IN ('admin', 'medico', 'enfermera', 'secretaria') THEN
    RAISE EXCEPTION 'No autorizado para solicitar factura electronica';
  END IF;

  SELECT *
  INTO v_payment
  FROM public.payments
  WHERE id = p_payment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pago no encontrado';
  END IF;

  IF v_payment.estado <> 'activo' THEN
    RAISE EXCEPTION 'No se puede facturar un pago anulado';
  END IF;

  INSERT INTO public.payment_invoicing (
    payment_id,
    estado,
    pidio_factura
  )
  VALUES (
    p_payment_id,
    'pendiente',
    true
  )
  ON CONFLICT (payment_id) DO UPDATE
  SET
    pidio_factura = true,
    updated_at = now();

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', p_payment_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.encolar_pago_facturacion(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.encolar_pago_facturacion(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.encolar_pago_facturacion(UUID) TO authenticated;

-- ============================================================================
-- 4. WIMAX RECONCILIATION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cruzar_facturacion_wimax()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pending RECORD;
  v_factura_numero TEXT;
  v_factura_total NUMERIC(12,2);
  v_target NUMERIC(12,2);
  v_payment_date DATE;
  v_total_matches INTEGER := 0;
  v_partial_matches INTEGER := 0;
  v_checked INTEGER := 0;
  v_remaining INTEGER := 0;
  v_role TEXT;
BEGIN
  v_role := public.get_user_role();

  IF COALESCE(auth.role(), '') <> 'service_role'
     AND v_role NOT IN ('admin', 'secretaria') THEN
    RAISE EXCEPTION 'Solo Admin, Secretaria o el agente pueden cruzar facturacion WiMAX';
  END IF;

  FOR v_pending IN
    SELECT
      pi.id,
      pi.payment_id,
      pi.monto_a_facturar,
      p.total AS payment_total,
      p.created_at AS payment_created_at,
      pa.cedula
    FROM public.payment_invoicing pi
    JOIN public.payments p ON p.id = pi.payment_id
    JOIN public.patients pa ON pa.id = p.patient_id
    WHERE pi.estado = 'pendiente'
      AND p.estado = 'activo'
    ORDER BY p.created_at, pi.id
    FOR UPDATE OF pi SKIP LOCKED
  LOOP
    v_checked := v_checked + 1;
    v_target := round(COALESCE(v_pending.monto_a_facturar, v_pending.payment_total), 2);
    v_payment_date := (v_pending.payment_created_at AT TIME ZONE 'America/Bogota')::DATE;
    v_factura_numero := NULL;
    v_factura_total := NULL;

    IF NULLIF(regexp_replace(COALESCE(v_pending.cedula, ''), '[^0-9]', '', 'g'), '') IS NULL THEN
      CONTINUE;
    END IF;

    SELECT wf.numero, wf.total
    INTO v_factura_numero, v_factura_total
    FROM public.wimax_facturas wf
    WHERE wf.cedula = regexp_replace(v_pending.cedula, '[^0-9]', '', 'g')
      AND wf.emision BETWEEN (v_payment_date - 2) AND (v_payment_date + 45)
      AND wf.total <= v_target
      AND NOT EXISTS (
        SELECT 1
        FROM public.payment_invoicing used
        WHERE used.wimax_factura_numero = wf.numero
          AND used.id <> v_pending.id
      )
    ORDER BY
      CASE WHEN wf.total = v_target THEN 0 ELSE 1 END,
      abs(wf.emision - v_payment_date),
      wf.total DESC,
      wf.numero
    LIMIT 1;

    IF v_factura_numero IS NULL THEN
      CONTINUE;
    END IF;

    IF v_factura_total = v_target THEN
      UPDATE public.payment_invoicing
      SET
        estado = 'facturada_total',
        wimax_factura_numero = v_factura_numero
      WHERE id = v_pending.id
        AND estado = 'pendiente';

      IF FOUND THEN
        v_total_matches := v_total_matches + 1;
      END IF;
    ELSE
      UPDATE public.payment_invoicing
      SET
        estado = 'facturada_parcial',
        wimax_factura_numero = v_factura_numero
      WHERE id = v_pending.id
        AND estado = 'pendiente';

      IF FOUND THEN
        v_partial_matches := v_partial_matches + 1;
      END IF;
    END IF;
  END LOOP;

  SELECT count(*)::INTEGER
  INTO v_remaining
  FROM public.payment_invoicing pi
  JOIN public.payments p ON p.id = pi.payment_id
  WHERE pi.estado = 'pendiente'
    AND p.estado = 'activo';

  RETURN jsonb_build_object(
    'success', true,
    'revisados', v_checked,
    'facturadas_total', v_total_matches,
    'facturadas_parcial', v_partial_matches,
    'pendientes', v_remaining
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cruzar_facturacion_wimax() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cruzar_facturacion_wimax() FROM anon;
GRANT EXECUTE ON FUNCTION public.cruzar_facturacion_wimax() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cruzar_facturacion_wimax() TO service_role;

COMMENT ON FUNCTION public.cruzar_facturacion_wimax() IS
  'Cruza solo pendientes activos por cedula, monto y ventana [-2,+45] dias. Nunca revierte estados terminales.';

COMMIT;

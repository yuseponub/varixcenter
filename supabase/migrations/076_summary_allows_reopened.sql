-- Migration: 076_summary_allows_reopened.sql
-- Purpose: Completa el fix de la 075. `get_closing_summary` marcaba
--          has_existing_closing = true tambien cuando el cierre del dia estaba
--          REABIERTO, asi que la pantalla de "Nuevo Cierre" seguia mostrando
--          "Ya existe un cierre" y no dejaba rehacerlo, aunque el RPC ya lo
--          permitiera.
--
-- Fix: has_existing_closing solo cuenta los cierres en estado 'cerrado'.
--      Se agrega `existing_closing_estado` para que la UI pueda avisar que el
--      dia esta reabierto y se va a corregir.
-- Depends on: 075_fix_reclose_after_reopen.sql

CREATE OR REPLACE FUNCTION public.get_closing_summary(p_fecha date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  DECLARE
    v_total_efectivo DECIMAL(12,2);
    v_total_tarjeta DECIMAL(12,2);
    v_total_transferencia DECIMAL(12,2);
    v_total_nequi DECIMAL(12,2);
    v_total_descuentos DECIMAL(12,2);
    v_total_anulaciones DECIMAL(12,2);
    v_grand_total DECIMAL(12,2);
    v_payment_count INTEGER;
    v_existing_closing UUID;
    v_existing_estado TEXT;
  BEGIN
    SELECT id, estado::TEXT
      INTO v_existing_closing, v_existing_estado
    FROM public.cash_closings
    WHERE fecha_cierre = p_fecha;

    SELECT
      COALESCE(SUM(CASE WHEN pm.metodo = 'efectivo' THEN pm.monto ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN pm.metodo = 'tarjeta' THEN pm.monto ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN pm.metodo = 'transferencia' THEN pm.monto ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN pm.metodo = 'nequi' THEN pm.monto ELSE 0 END), 0)
    INTO v_total_efectivo, v_total_tarjeta, v_total_transferencia, v_total_nequi
    FROM public.payments p
    JOIN public.payment_methods pm ON pm.payment_id = p.id
    WHERE DATE(p.created_at AT TIME ZONE 'America/Bogota') = p_fecha
    AND p.estado = 'activo';

    SELECT COALESCE(SUM(descuento), 0)
    INTO v_total_descuentos
    FROM public.payments
    WHERE DATE(created_at AT TIME ZONE 'America/Bogota') = p_fecha
    AND estado = 'activo';

    SELECT COALESCE(SUM(total), 0)
    INTO v_total_anulaciones
    FROM public.payments
    WHERE DATE(created_at AT TIME ZONE 'America/Bogota') = p_fecha
    AND estado = 'anulado';

    SELECT COUNT(*)
    INTO v_payment_count
    FROM public.payments
    WHERE DATE(created_at AT TIME ZONE 'America/Bogota') = p_fecha
    AND estado = 'activo';

    v_grand_total := v_total_efectivo + v_total_tarjeta + v_total_transferencia + v_total_nequi;

    RETURN jsonb_build_object(
      'fecha', p_fecha,
      'total_efectivo', v_total_efectivo,
      'total_tarjeta', v_total_tarjeta,
      'total_transferencia', v_total_transferencia,
      'total_nequi', v_total_nequi,
      'total_descuentos', v_total_descuentos,
      'total_anulaciones', v_total_anulaciones,
      'grand_total', v_grand_total,
      'payment_count', v_payment_count,
      -- CAMBIO 076: un cierre REABIERTO no bloquea; se puede rehacer.
      'has_existing_closing', (v_existing_closing IS NOT NULL AND v_existing_estado = 'cerrado'),
      'existing_closing_id', v_existing_closing,
      'existing_closing_estado', v_existing_estado
    );
  END;
  $function$;

COMMENT ON FUNCTION public.get_closing_summary(date) IS
  'Resumen del dia para la pantalla de cierre. has_existing_closing solo es true si el cierre esta CERRADO: si esta reabierto se permite rehacerlo.';

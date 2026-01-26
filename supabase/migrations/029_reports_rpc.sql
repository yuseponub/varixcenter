-- Migration: 029_reports_rpc.sql
-- Purpose: RPC functions for income report aggregation
-- Phase: 08-reports-alerts
-- Created: 2026-01-26
-- Depends on: 004_payments.sql, 005_appointments.sql

-- ============================================================================
-- GET INCOME REPORT RPC
-- ============================================================================
-- Returns aggregated income totals for a date range
-- Used by: Reports dashboard for financial summaries

CREATE OR REPLACE FUNCTION public.get_income_report(p_start_date DATE, p_end_date DATE)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_efectivo DECIMAL(12,2) := 0;
  v_total_tarjeta DECIMAL(12,2) := 0;
  v_total_transferencia DECIMAL(12,2) := 0;
  v_total_nequi DECIMAL(12,2) := 0;
  v_total_descuentos DECIMAL(12,2) := 0;
  v_total_anulaciones DECIMAL(12,2) := 0;
  v_grand_total DECIMAL(12,2) := 0;
  v_payment_count INTEGER := 0;
  v_citas_atendidas INTEGER := 0;
BEGIN
  -- Validate date range
  IF p_start_date > p_end_date THEN
    RAISE EXCEPTION 'Fecha inicial no puede ser mayor a fecha final';
  END IF;

  -- Get totals by payment method for active payments in date range
  SELECT
    COALESCE(SUM(CASE WHEN pm.metodo = 'efectivo' THEN pm.monto ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN pm.metodo = 'tarjeta' THEN pm.monto ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN pm.metodo = 'transferencia' THEN pm.monto ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN pm.metodo = 'nequi' THEN pm.monto ELSE 0 END), 0)
  INTO v_total_efectivo, v_total_tarjeta, v_total_transferencia, v_total_nequi
  FROM public.payments p
  JOIN public.payment_methods pm ON pm.payment_id = p.id
  WHERE DATE(p.created_at) BETWEEN p_start_date AND p_end_date
  AND p.estado = 'activo';

  -- Get total discounts for active payments
  SELECT COALESCE(SUM(descuento), 0)
  INTO v_total_descuentos
  FROM public.payments
  WHERE DATE(created_at) BETWEEN p_start_date AND p_end_date
  AND estado = 'activo';

  -- Get total of voided payments (for reporting)
  SELECT COALESCE(SUM(total), 0)
  INTO v_total_anulaciones
  FROM public.payments
  WHERE DATE(created_at) BETWEEN p_start_date AND p_end_date
  AND estado = 'anulado';

  -- Get active payment count
  SELECT COUNT(*)
  INTO v_payment_count
  FROM public.payments
  WHERE DATE(created_at) BETWEEN p_start_date AND p_end_date
  AND estado = 'activo';

  -- Get completed appointments count
  SELECT COUNT(*)
  INTO v_citas_atendidas
  FROM public.appointments
  WHERE DATE(fecha_hora_inicio) BETWEEN p_start_date AND p_end_date
  AND estado = 'completada';

  -- Calculate grand total (only from active payments)
  v_grand_total := v_total_efectivo + v_total_tarjeta + v_total_transferencia + v_total_nequi;

  RETURN json_build_object(
    'total_efectivo', v_total_efectivo,
    'total_tarjeta', v_total_tarjeta,
    'total_transferencia', v_total_transferencia,
    'total_nequi', v_total_nequi,
    'total_descuentos', v_total_descuentos,
    'total_anulaciones', v_total_anulaciones,
    'grand_total', v_grand_total,
    'payment_count', v_payment_count,
    'citas_atendidas', v_citas_atendidas
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_income_report(DATE, DATE) TO authenticated;

COMMENT ON FUNCTION public.get_income_report IS
  'Retorna totales de ingresos agregados por metodo de pago para un rango de fechas.';

-- ============================================================================
-- GET DAILY INCOME BREAKDOWN RPC
-- ============================================================================
-- Returns daily totals by payment method for a date range
-- Used by: Reports dashboard for charts and daily breakdown tables

CREATE OR REPLACE FUNCTION public.get_daily_income_breakdown(p_start_date DATE, p_end_date DATE)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
BEGIN
  -- Validate date range
  IF p_start_date > p_end_date THEN
    RAISE EXCEPTION 'Fecha inicial no puede ser mayor a fecha final';
  END IF;

  SELECT COALESCE(json_agg(
    json_build_object(
      'fecha', payment_date,
      'efectivo', total_efectivo,
      'tarjeta', total_tarjeta,
      'transferencia', total_transferencia,
      'nequi', total_nequi,
      'total', total_dia
    )
    ORDER BY payment_date ASC
  ), '[]'::json)
  INTO v_result
  FROM (
    SELECT
      DATE(p.created_at) as payment_date,
      COALESCE(SUM(CASE WHEN pm.metodo = 'efectivo' THEN pm.monto ELSE 0 END), 0) as total_efectivo,
      COALESCE(SUM(CASE WHEN pm.metodo = 'tarjeta' THEN pm.monto ELSE 0 END), 0) as total_tarjeta,
      COALESCE(SUM(CASE WHEN pm.metodo = 'transferencia' THEN pm.monto ELSE 0 END), 0) as total_transferencia,
      COALESCE(SUM(CASE WHEN pm.metodo = 'nequi' THEN pm.monto ELSE 0 END), 0) as total_nequi,
      COALESCE(SUM(pm.monto), 0) as total_dia
    FROM public.payments p
    JOIN public.payment_methods pm ON pm.payment_id = p.id
    WHERE DATE(p.created_at) BETWEEN p_start_date AND p_end_date
    AND p.estado = 'activo'
    GROUP BY DATE(p.created_at)
  ) daily_totals;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_daily_income_breakdown(DATE, DATE) TO authenticated;

COMMENT ON FUNCTION public.get_daily_income_breakdown IS
  'Retorna desglose diario de ingresos por metodo de pago para un rango de fechas.';

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
BEGIN
  -- Verify get_income_report function exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'get_income_report'
  ) THEN
    RAISE EXCEPTION 'get_income_report function not created';
  END IF;

  -- Verify get_daily_income_breakdown function exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'get_daily_income_breakdown'
  ) THEN
    RAISE EXCEPTION 'get_daily_income_breakdown function not created';
  END IF;

  RAISE NOTICE 'Report RPC functions verified successfully';
END;
$$;

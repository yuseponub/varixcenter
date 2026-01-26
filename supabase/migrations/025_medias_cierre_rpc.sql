-- Migration: 025_medias_cierre_rpc.sql
-- Purpose: RPC functions for medias cash closing operations
-- Phase: 12-cash-closing-medias, Plan: 02
-- Created: 2026-01-26
-- Depends on: 024_medias_cierres.sql, 021_medias_sales.sql
--
-- Requirements covered by this migration:
--   get_medias_cierre_summary: Calculate totals by payment method for date preview
--   create_medias_cierre: Atomic closing creation with zero-tolerance validation
--   reopen_medias_cierre: Admin-only reopen with mandatory justification
--
-- NOTE: Follows 016_cash_closing_rpc.sql pattern adapted for medias
-- CRITICAL: Queries medias_sale_methods (NOT medias_sales.total) for payment method breakdown

-- ============================================================================
-- 1. GET MEDIAS CIERRE SUMMARY RPC
-- ============================================================================
-- Returns calculated totals for a date (preview before closing)
-- Does NOT create any records - just calculates from medias_sale_methods

CREATE OR REPLACE FUNCTION public.get_medias_cierre_summary(p_fecha DATE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_efectivo DECIMAL(12,2) := 0;
  v_total_tarjeta DECIMAL(12,2) := 0;
  v_total_transferencia DECIMAL(12,2) := 0;
  v_total_nequi DECIMAL(12,2) := 0;
  v_grand_total DECIMAL(12,2) := 0;
  v_sale_count INTEGER := 0;
  v_existing_closing UUID;
BEGIN
  -- Check if closing already exists for this date
  SELECT id INTO v_existing_closing
  FROM public.medias_cierres
  WHERE fecha_cierre = p_fecha;

  -- CRITICAL: Get totals from medias_sale_methods (NOT medias_sales.total)
  -- This gives payment method breakdown for reconciliation
  SELECT
    COALESCE(SUM(CASE WHEN msm.metodo = 'efectivo' THEN msm.monto ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN msm.metodo = 'tarjeta' THEN msm.monto ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN msm.metodo = 'transferencia' THEN msm.monto ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN msm.metodo = 'nequi' THEN msm.monto ELSE 0 END), 0)
  INTO v_total_efectivo, v_total_tarjeta, v_total_transferencia, v_total_nequi
  FROM public.medias_sales ms
  JOIN public.medias_sale_methods msm ON msm.sale_id = ms.id
  WHERE DATE(ms.created_at) = p_fecha
  AND ms.estado = 'activo';  -- Only active sales (exclude anuladas)

  -- Get sale count (not payment_count - medias uses sale_count)
  SELECT COUNT(*)
  INTO v_sale_count
  FROM public.medias_sales
  WHERE DATE(created_at) = p_fecha
  AND estado = 'activo';

  -- Calculate grand total
  v_grand_total := v_total_efectivo + v_total_tarjeta + v_total_transferencia + v_total_nequi;

  RETURN jsonb_build_object(
    'fecha', p_fecha,
    'total_efectivo', v_total_efectivo,
    'total_tarjeta', v_total_tarjeta,
    'total_transferencia', v_total_transferencia,
    'total_nequi', v_total_nequi,
    'grand_total', v_grand_total,
    'sale_count', v_sale_count,
    'has_existing_closing', v_existing_closing IS NOT NULL,
    'existing_closing_id', v_existing_closing
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_medias_cierre_summary(DATE) TO authenticated;

COMMENT ON FUNCTION public.get_medias_cierre_summary IS
  'Calcula totales de ventas medias por metodo de pago para preview antes de cerrar. No crea registros.';

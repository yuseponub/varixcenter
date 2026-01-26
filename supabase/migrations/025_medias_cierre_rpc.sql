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

-- ============================================================================
-- 2. CREATE MEDIAS CIERRE RPC
-- ============================================================================
-- Atomically creates a cash closing with all validations
-- CIE-04: ZERO TOLERANCE - any difference requires justification (no threshold)

CREATE OR REPLACE FUNCTION public.create_medias_cierre(
  p_fecha DATE,
  p_conteo_fisico DECIMAL,
  p_diferencia_justificacion TEXT,
  p_cierre_photo_path TEXT,
  p_notas TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_closing_id UUID;
  v_cierre_numero TEXT;
  v_total_efectivo DECIMAL(12,2);
  v_total_tarjeta DECIMAL(12,2);
  v_total_transferencia DECIMAL(12,2);
  v_total_nequi DECIMAL(12,2);
  v_grand_total DECIMAL(12,2);
  v_diferencia DECIMAL(12,2);
  v_user_id UUID;
  v_user_role TEXT;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  -- Check user role (only secretaria and admin can close)
  SELECT role INTO v_user_role
  FROM public.user_roles
  WHERE user_id = v_user_id;

  IF v_user_role NOT IN ('admin', 'secretaria') THEN
    RAISE EXCEPTION 'Solo Secretaria y Admin pueden cerrar caja de medias';
  END IF;

  -- Validate date is not in the future
  IF p_fecha > CURRENT_DATE THEN
    RAISE EXCEPTION 'No se puede cerrar un dia futuro';
  END IF;

  -- Check if closing already exists for this date
  IF EXISTS (SELECT 1 FROM public.medias_cierres WHERE fecha_cierre = p_fecha) THEN
    RAISE EXCEPTION 'Ya existe un cierre de medias para la fecha %', p_fecha;
  END IF;

  -- Validate photo path is provided (required per schema)
  IF p_cierre_photo_path IS NULL OR TRIM(p_cierre_photo_path) = '' THEN
    RAISE EXCEPTION 'La foto del cierre es obligatoria';
  END IF;

  -- Validate conteo is not negative
  IF p_conteo_fisico < 0 THEN
    RAISE EXCEPTION 'El conteo fisico no puede ser negativo';
  END IF;

  -- Calculate totals from medias_sale_methods (for active sales only)
  SELECT
    COALESCE(SUM(CASE WHEN msm.metodo = 'efectivo' THEN msm.monto ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN msm.metodo = 'tarjeta' THEN msm.monto ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN msm.metodo = 'transferencia' THEN msm.monto ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN msm.metodo = 'nequi' THEN msm.monto ELSE 0 END), 0)
  INTO v_total_efectivo, v_total_tarjeta, v_total_transferencia, v_total_nequi
  FROM public.medias_sales ms
  JOIN public.medias_sale_methods msm ON msm.sale_id = ms.id
  WHERE DATE(ms.created_at) = p_fecha
  AND ms.estado = 'activo';

  -- Calculate grand total and difference
  v_grand_total := v_total_efectivo + v_total_tarjeta + v_total_transferencia + v_total_nequi;
  v_diferencia := p_conteo_fisico - v_total_efectivo;

  -- CIE-04: ZERO TOLERANCE - If there's ANY difference, justification is required
  -- NOTE: This differs from clinic (which has $10k threshold) - medias has ZERO tolerance
  IF v_diferencia != 0 THEN
    IF p_diferencia_justificacion IS NULL OR LENGTH(TRIM(p_diferencia_justificacion)) < 10 THEN
      RAISE EXCEPTION 'Hay una diferencia de %. Se requiere justificacion (minimo 10 caracteres)', v_diferencia;
    END IF;
  END IF;

  -- Set lock timeout
  SET LOCAL lock_timeout = '10s';

  -- Get next cierre number (locks counter row) - uses CIM prefix
  v_cierre_numero := get_next_medias_cierre_number();

  -- Insert the closing record
  INSERT INTO public.medias_cierres (
    cierre_numero,
    fecha_cierre,
    total_efectivo,
    total_tarjeta,
    total_transferencia,
    total_nequi,
    grand_total,
    conteo_fisico_efectivo,
    diferencia,
    diferencia_justificacion,
    cierre_photo_path,
    estado,
    notas,
    closed_by
  ) VALUES (
    v_cierre_numero,
    p_fecha,
    v_total_efectivo,
    v_total_tarjeta,
    v_total_transferencia,
    v_total_nequi,
    v_grand_total,
    p_conteo_fisico,
    v_diferencia,
    NULLIF(TRIM(p_diferencia_justificacion), ''),
    p_cierre_photo_path,
    'cerrado',
    NULLIF(TRIM(p_notas), ''),
    v_user_id
  )
  RETURNING id INTO v_closing_id;

  RETURN jsonb_build_object(
    'id', v_closing_id,
    'cierre_numero', v_cierre_numero,
    'fecha_cierre', p_fecha,
    'total_efectivo', v_total_efectivo,
    'total_tarjeta', v_total_tarjeta,
    'total_transferencia', v_total_transferencia,
    'total_nequi', v_total_nequi,
    'grand_total', v_grand_total,
    'conteo_fisico_efectivo', p_conteo_fisico,
    'diferencia', v_diferencia
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_medias_cierre(DATE, DECIMAL, TEXT, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.create_medias_cierre IS
  'Crea cierre de caja de medias atomico. Tolerancia CERO para diferencias (CIE-04). Usa numeracion CIM- independiente.';

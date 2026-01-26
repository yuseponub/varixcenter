-- Migration: 016_cash_closing_rpc.sql
-- Purpose: RPC functions for cash closing operations
-- Phase: 05-cash-closing
-- Created: 2026-01-24
-- Depends on: 015_cash_closings.sql

-- ============================================================================
-- GET CLOSING SUMMARY RPC
-- ============================================================================
-- Returns calculated totals for a date (preview before closing)
-- Does NOT create any records - just calculates from payments

CREATE OR REPLACE FUNCTION public.get_closing_summary(p_fecha DATE)
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
  v_total_descuentos DECIMAL(12,2) := 0;
  v_total_anulaciones DECIMAL(12,2) := 0;
  v_grand_total DECIMAL(12,2) := 0;
  v_payment_count INTEGER := 0;
  v_existing_closing UUID;
BEGIN
  -- Check if closing already exists for this date
  SELECT id INTO v_existing_closing
  FROM public.cash_closings
  WHERE fecha_cierre = p_fecha;

  -- Get totals by payment method for active payments on this date
  SELECT
    COALESCE(SUM(CASE WHEN pm.metodo = 'efectivo' THEN pm.monto ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN pm.metodo = 'tarjeta' THEN pm.monto ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN pm.metodo = 'transferencia' THEN pm.monto ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN pm.metodo = 'nequi' THEN pm.monto ELSE 0 END), 0)
  INTO v_total_efectivo, v_total_tarjeta, v_total_transferencia, v_total_nequi
  FROM public.payments p
  JOIN public.payment_methods pm ON pm.payment_id = p.id
  WHERE DATE(p.created_at) = p_fecha
  AND p.estado = 'activo';

  -- Get total discounts for active payments
  SELECT COALESCE(SUM(descuento), 0)
  INTO v_total_descuentos
  FROM public.payments
  WHERE DATE(created_at) = p_fecha
  AND estado = 'activo';

  -- Get total of voided payments (for reporting)
  SELECT COALESCE(SUM(total), 0)
  INTO v_total_anulaciones
  FROM public.payments
  WHERE DATE(created_at) = p_fecha
  AND estado = 'anulado';

  -- Get payment count
  SELECT COUNT(*)
  INTO v_payment_count
  FROM public.payments
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
    'total_descuentos', v_total_descuentos,
    'total_anulaciones', v_total_anulaciones,
    'grand_total', v_grand_total,
    'payment_count', v_payment_count,
    'has_existing_closing', v_existing_closing IS NOT NULL,
    'existing_closing_id', v_existing_closing
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_closing_summary(DATE) TO authenticated;

COMMENT ON FUNCTION public.get_closing_summary IS
  'Calcula totales del dia para preview antes de cerrar. No crea registros.';

-- ============================================================================
-- CREATE CASH CLOSING RPC
-- ============================================================================
-- Atomically creates a cash closing with all validations

CREATE OR REPLACE FUNCTION public.create_cash_closing(
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
  v_total_descuentos DECIMAL(12,2);
  v_total_anulaciones DECIMAL(12,2);
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
    RAISE EXCEPTION 'Solo Secretaria y Admin pueden cerrar caja';
  END IF;

  -- Validate date is not in the future
  IF p_fecha > CURRENT_DATE THEN
    RAISE EXCEPTION 'No se puede cerrar un dia futuro';
  END IF;

  -- Check if closing already exists for this date
  IF EXISTS (SELECT 1 FROM public.cash_closings WHERE fecha_cierre = p_fecha) THEN
    RAISE EXCEPTION 'Ya existe un cierre para la fecha %', p_fecha;
  END IF;

  -- Validate photo path is provided
  IF p_cierre_photo_path IS NULL OR TRIM(p_cierre_photo_path) = '' THEN
    RAISE EXCEPTION 'La foto del reporte firmado es obligatoria';
  END IF;

  -- Validate conteo is not negative
  IF p_conteo_fisico < 0 THEN
    RAISE EXCEPTION 'El conteo fisico no puede ser negativo';
  END IF;

  -- Calculate totals from payments
  SELECT
    COALESCE(SUM(CASE WHEN pm.metodo = 'efectivo' THEN pm.monto ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN pm.metodo = 'tarjeta' THEN pm.monto ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN pm.metodo = 'transferencia' THEN pm.monto ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN pm.metodo = 'nequi' THEN pm.monto ELSE 0 END), 0)
  INTO v_total_efectivo, v_total_tarjeta, v_total_transferencia, v_total_nequi
  FROM public.payments p
  JOIN public.payment_methods pm ON pm.payment_id = p.id
  WHERE DATE(p.created_at) = p_fecha
  AND p.estado = 'activo';

  -- Get total discounts
  SELECT COALESCE(SUM(descuento), 0)
  INTO v_total_descuentos
  FROM public.payments
  WHERE DATE(created_at) = p_fecha
  AND estado = 'activo';

  -- Get total anulaciones
  SELECT COALESCE(SUM(total), 0)
  INTO v_total_anulaciones
  FROM public.payments
  WHERE DATE(created_at) = p_fecha
  AND estado = 'anulado';

  -- Calculate grand total and difference
  v_grand_total := v_total_efectivo + v_total_tarjeta + v_total_transferencia + v_total_nequi;
  v_diferencia := p_conteo_fisico - v_total_efectivo;

  -- ZERO TOLERANCE: If there's a difference, justification is required
  IF v_diferencia != 0 THEN
    IF p_diferencia_justificacion IS NULL OR LENGTH(TRIM(p_diferencia_justificacion)) < 10 THEN
      RAISE EXCEPTION 'Hay una diferencia de %. Se requiere justificacion (minimo 10 caracteres)', v_diferencia;
    END IF;
  END IF;

  -- Set lock timeout
  SET LOCAL lock_timeout = '10s';

  -- Get next closing number (locks counter row)
  v_cierre_numero := get_next_closing_number();

  -- Insert the closing record
  INSERT INTO public.cash_closings (
    cierre_numero,
    fecha_cierre,
    total_efectivo,
    total_tarjeta,
    total_transferencia,
    total_nequi,
    total_descuentos,
    total_anulaciones,
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
    v_total_descuentos,
    v_total_anulaciones,
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

GRANT EXECUTE ON FUNCTION public.create_cash_closing(DATE, DECIMAL, TEXT, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.create_cash_closing IS
  'Crea cierre de caja atomico. Calcula totales, valida diferencias, genera numero secuencial.';

-- ============================================================================
-- REOPEN CASH CLOSING RPC
-- ============================================================================
-- Only admin can reopen a closing (with mandatory justification)

CREATE OR REPLACE FUNCTION public.reopen_cash_closing(
  p_cierre_id UUID,
  p_justificacion TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_user_role TEXT;
  v_closing RECORD;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  -- Check user role (only admin can reopen)
  SELECT role INTO v_user_role
  FROM public.user_roles
  WHERE user_id = v_user_id;

  IF v_user_role != 'admin' THEN
    RAISE EXCEPTION 'Solo Admin puede reabrir cierres de caja';
  END IF;

  -- Validate justification
  IF p_justificacion IS NULL OR LENGTH(TRIM(p_justificacion)) < 10 THEN
    RAISE EXCEPTION 'La justificacion debe tener al menos 10 caracteres';
  END IF;

  -- Get the closing
  SELECT * INTO v_closing
  FROM public.cash_closings
  WHERE id = p_cierre_id;

  IF v_closing IS NULL THEN
    RAISE EXCEPTION 'Cierre no encontrado';
  END IF;

  IF v_closing.estado = 'reabierto' THEN
    RAISE EXCEPTION 'El cierre ya esta reabierto';
  END IF;

  -- Update the closing to reabierto
  UPDATE public.cash_closings
  SET
    estado = 'reabierto',
    reopened_by = v_user_id,
    reopen_justificacion = TRIM(p_justificacion),
    reopened_at = now()
  WHERE id = p_cierre_id;

  RETURN jsonb_build_object(
    'id', p_cierre_id,
    'cierre_numero', v_closing.cierre_numero,
    'estado', 'reabierto',
    'reopened_by', v_user_id,
    'reopened_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reopen_cash_closing(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.reopen_cash_closing IS
  'Reabre un cierre de caja. Solo admin, requiere justificacion.';

-- ============================================================================
-- GET UNCLOSED DAYS RPC
-- ============================================================================
-- Returns dates with payments but no closing (for alerts)

CREATE OR REPLACE FUNCTION public.get_unclosed_days(p_limit INTEGER DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unclosed_days JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'fecha', payment_date,
      'payment_count', payment_count,
      'total', total_amount
    )
    ORDER BY payment_date DESC
  ), '[]'::jsonb)
  INTO v_unclosed_days
  FROM (
    SELECT
      DATE(p.created_at) as payment_date,
      COUNT(*) as payment_count,
      SUM(p.total) as total_amount
    FROM public.payments p
    WHERE p.estado = 'activo'
    AND DATE(p.created_at) < CURRENT_DATE  -- Only past days
    AND NOT EXISTS (
      SELECT 1 FROM public.cash_closings c
      WHERE c.fecha_cierre = DATE(p.created_at)
      AND c.estado = 'cerrado'
    )
    GROUP BY DATE(p.created_at)
    ORDER BY DATE(p.created_at) DESC
    LIMIT p_limit
  ) sub;

  RETURN v_unclosed_days;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_unclosed_days(INTEGER) TO authenticated;

COMMENT ON FUNCTION public.get_unclosed_days IS
  'Retorna dias con pagos pero sin cierre (para alertas).';

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
BEGIN
  -- Verify all functions exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'get_closing_summary'
  ) THEN
    RAISE EXCEPTION 'get_closing_summary function not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'create_cash_closing'
  ) THEN
    RAISE EXCEPTION 'create_cash_closing function not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'reopen_cash_closing'
  ) THEN
    RAISE EXCEPTION 'reopen_cash_closing function not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'get_unclosed_days'
  ) THEN
    RAISE EXCEPTION 'get_unclosed_days function not created';
  END IF;

  RAISE NOTICE 'Cash closing RPC functions verified successfully';
END;
$$;

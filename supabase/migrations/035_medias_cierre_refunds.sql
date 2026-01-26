-- Migration: 035_medias_cierre_refunds.sql
-- Purpose: Update cierre summary RPC to subtract approved cash refunds from efectivo
-- Phase: 14-returns-workflow, Plan: 04
-- Created: 2026-01-26
-- Depends on: 025_medias_cierre_rpc.sql, 034_medias_returns_rpc.sql
--
-- Requirements covered by this migration:
--   DEV-06: Approved cash refunds reduce expected efectivo in cierre
--   CIE-04: Zero tolerance still applies - now against efectivo_neto
--
-- CRITICAL: Cash refunds are tracked by aprobado_at (approval date), NOT created_at
--           This ensures refunds affect the cierre of the day they were APPROVED
-- ============================================================================

-- ============================================================================
-- 1. UPDATE get_medias_cierre_summary TO SUBTRACT CASH REFUNDS
-- ============================================================================
-- Returns calculated totals for a date (preview before closing)
-- NEW: Includes total_devoluciones_efectivo and efectivo_neto fields
-- NEW: Includes return_count for the date

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
  v_total_devoluciones_efectivo DECIMAL(12,2) := 0;
  v_grand_total DECIMAL(12,2) := 0;
  v_sale_count INTEGER := 0;
  v_return_count INTEGER := 0;
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

  -- NEW: Get approved cash refunds for this date
  -- CRITICAL: Uses aprobado_at (approval date), NOT created_at (request date)
  -- This ensures refunds affect the cierre of the day they were APPROVED
  SELECT COALESCE(SUM(monto_devolucion), 0)
  INTO v_total_devoluciones_efectivo
  FROM public.medias_returns
  WHERE DATE(aprobado_at) = p_fecha
  AND estado = 'aprobada'
  AND metodo_reembolso = 'efectivo';

  -- Get sale count (not payment_count - medias uses sale_count)
  SELECT COUNT(*)
  INTO v_sale_count
  FROM public.medias_sales
  WHERE DATE(created_at) = p_fecha
  AND estado = 'activo';

  -- NEW: Get approved return count for this date (all methods, not just efectivo)
  SELECT COUNT(*)
  INTO v_return_count
  FROM public.medias_returns
  WHERE DATE(aprobado_at) = p_fecha
  AND estado = 'aprobada';

  -- Calculate grand total (total sales - unchanged)
  v_grand_total := v_total_efectivo + v_total_tarjeta + v_total_transferencia + v_total_nequi;

  RETURN jsonb_build_object(
    'fecha', p_fecha,
    'total_efectivo', v_total_efectivo,
    'total_tarjeta', v_total_tarjeta,
    'total_transferencia', v_total_transferencia,
    'total_nequi', v_total_nequi,
    'total_devoluciones_efectivo', v_total_devoluciones_efectivo,  -- NEW field
    'efectivo_neto', v_total_efectivo - v_total_devoluciones_efectivo,  -- NEW field: what should match conteo
    'grand_total', v_grand_total,
    'sale_count', v_sale_count,
    'return_count', v_return_count,  -- NEW field
    'has_existing_closing', v_existing_closing IS NOT NULL,
    'existing_closing_id', v_existing_closing
  );
END;
$$;

COMMENT ON FUNCTION public.get_medias_cierre_summary IS
  'Calcula totales de ventas medias por metodo de pago, restando devoluciones en efectivo. efectivo_neto es lo que debe cuadrar con conteo fisico.';

-- ============================================================================
-- 2. UPDATE create_medias_cierre TO USE efectivo_neto FOR RECONCILIATION
-- ============================================================================
-- CIE-04: ZERO TOLERANCE - any difference requires justification (no threshold)
-- CRITICAL: Now compares conteo_fisico against efectivo_neto (NOT raw total_efectivo)

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
  v_total_devoluciones_efectivo DECIMAL(12,2);
  v_efectivo_neto DECIMAL(12,2);
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

  -- NEW: Calculate approved cash refunds for this date
  -- CRITICAL: Uses aprobado_at (approval date), NOT created_at
  SELECT COALESCE(SUM(monto_devolucion), 0)
  INTO v_total_devoluciones_efectivo
  FROM public.medias_returns
  WHERE DATE(aprobado_at) = p_fecha
  AND estado = 'aprobada'
  AND metodo_reembolso = 'efectivo';

  -- NEW: Calculate efectivo_neto (what should be in drawer after refunds)
  v_efectivo_neto := v_total_efectivo - v_total_devoluciones_efectivo;

  -- Calculate grand total and difference
  v_grand_total := v_total_efectivo + v_total_tarjeta + v_total_transferencia + v_total_nequi;

  -- CRITICAL: Compare conteo against efectivo_neto (NOT raw total_efectivo)
  -- This accounts for cash that left the drawer due to refunds
  v_diferencia := p_conteo_fisico - v_efectivo_neto;

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
  -- NOTE: We store both total_efectivo (gross) and the calculated diferencia (against neto)
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
    v_total_efectivo,  -- Gross efectivo (before refunds)
    v_total_tarjeta,
    v_total_transferencia,
    v_total_nequi,
    v_grand_total,
    p_conteo_fisico,
    v_diferencia,  -- Difference against efectivo_neto
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
    'total_devoluciones_efectivo', v_total_devoluciones_efectivo,
    'efectivo_neto', v_efectivo_neto,
    'total_tarjeta', v_total_tarjeta,
    'total_transferencia', v_total_transferencia,
    'total_nequi', v_total_nequi,
    'grand_total', v_grand_total,
    'conteo_fisico_efectivo', p_conteo_fisico,
    'diferencia', v_diferencia
  );
END;
$$;

COMMENT ON FUNCTION public.create_medias_cierre IS
  'Crea cierre de caja de medias atomico. Tolerancia CERO para diferencias contra efectivo_neto (efectivo - devoluciones). Usa numeracion CIM-.';

-- ============================================================================
-- 3. VERIFICATION
-- ============================================================================

DO $$
DECLARE
  v_summary JSONB;
BEGIN
  -- Verify get_medias_cierre_summary returns new fields
  -- We can call it with any date - it will return zeros if no data
  v_summary := get_medias_cierre_summary(CURRENT_DATE);

  -- Check efectivo_neto field exists
  IF NOT v_summary ? 'efectivo_neto' THEN
    RAISE EXCEPTION 'get_medias_cierre_summary missing efectivo_neto field';
  END IF;

  -- Check total_devoluciones_efectivo field exists
  IF NOT v_summary ? 'total_devoluciones_efectivo' THEN
    RAISE EXCEPTION 'get_medias_cierre_summary missing total_devoluciones_efectivo field';
  END IF;

  -- Check return_count field exists
  IF NOT v_summary ? 'return_count' THEN
    RAISE EXCEPTION 'get_medias_cierre_summary missing return_count field';
  END IF;

  RAISE NOTICE 'Medias cierre refunds integration verified successfully';
  RAISE NOTICE '- get_medias_cierre_summary: Returns efectivo_neto (efectivo - devoluciones_efectivo)';
  RAISE NOTICE '- get_medias_cierre_summary: Returns return_count (approved returns on date)';
  RAISE NOTICE '- create_medias_cierre: Compares conteo against efectivo_neto (DEV-06)';
  RAISE NOTICE '- Refunds tracked by aprobado_at (approval date) for correct cierre assignment';
END;
$$;

-- ============================================================================
-- Summary of changes:
-- get_medias_cierre_summary now returns:
--   - total_devoluciones_efectivo: Sum of approved cash refunds on the date
--   - efectivo_neto: total_efectivo - total_devoluciones_efectivo
--   - return_count: Count of approved returns on the date
--
-- create_medias_cierre now:
--   - Calculates v_efectivo_neto before comparing with conteo_fisico
--   - v_diferencia = p_conteo_fisico - v_efectivo_neto (not v_total_efectivo)
--   - Returns efectivo_neto and total_devoluciones_efectivo in response
--
-- CRITICAL: Refunds are attributed to cierre based on aprobado_at date
-- ============================================================================

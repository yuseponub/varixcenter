-- Migration: 017_cierre_photo_optional.sql
-- Purpose: Make cierre_photo_path optional
-- Phase: 05-cash-closing
-- Created: 2026-01-24

-- Make photo path nullable
ALTER TABLE public.cash_closings
ALTER COLUMN cierre_photo_path DROP NOT NULL;

-- Update the RPC function to not require photo
CREATE OR REPLACE FUNCTION public.create_cash_closing(
  p_fecha DATE,
  p_conteo_fisico DECIMAL,
  p_diferencia_justificacion TEXT,
  p_cierre_photo_path TEXT DEFAULT NULL,
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
    NULLIF(TRIM(p_cierre_photo_path), ''),
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

COMMENT ON FUNCTION public.create_cash_closing IS
  'Crea cierre de caja atomico. Calcula totales, valida diferencias, genera numero secuencial. Foto opcional.';

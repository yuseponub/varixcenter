-- Migration: 027_remove_medias_cierre_role_check.sql
-- Purpose: Remove role check from create_medias_cierre - all authenticated users can close
-- Phase: 12-cash-closing-medias (adjustment)

-- Drop and recreate the function WITHOUT role check
DROP FUNCTION IF EXISTS public.create_medias_cierre(DATE, DECIMAL, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.create_medias_cierre(
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
  v_grand_total DECIMAL(12,2);
  v_diferencia DECIMAL(12,2);
  v_user_id UUID;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  -- NO ROLE CHECK - All authenticated users can close caja

  -- Validate date is not in the future
  IF p_fecha > CURRENT_DATE THEN
    RAISE EXCEPTION 'No se puede cerrar un dia futuro';
  END IF;

  -- Check if closing already exists for this date
  IF EXISTS (SELECT 1 FROM public.medias_cierres WHERE fecha_cierre = p_fecha) THEN
    RAISE EXCEPTION 'Ya existe un cierre de medias para la fecha %', p_fecha;
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

COMMENT ON FUNCTION public.create_medias_cierre IS
  'Crea cierre de caja de medias atomico. Tolerancia CERO para diferencias. Todos los usuarios autenticados pueden cerrar.';

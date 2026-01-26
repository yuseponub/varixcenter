-- Migration: 028_alert_triggers.sql
-- Purpose: Automatic alert generation triggers for payment anulacion and cierre diferencia
-- Phase: 08-reports-alerts, Plan: 01
-- Created: 2026-01-26
-- Depends on: 027_alerts_table.sql (alerts table and ENUMs)
-- NOTE: Uses SECURITY DEFINER to bypass RLS for alert insertion

-- ============================================
-- 1. PAYMENT ANULACION ALERT FUNCTION
-- ============================================

-- Generates alert when a payment is annulled (estado: activo -> anulado)
CREATE OR REPLACE FUNCTION public.generate_payment_anulacion_alert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only trigger when estado changes from 'activo' to 'anulado'
  IF OLD.estado = 'activo' AND NEW.estado = 'anulado' THEN
    INSERT INTO public.alerts (
      tipo,
      severidad,
      titulo,
      descripcion,
      referencia_tipo,
      referencia_id
    ) VALUES (
      'pago_anulado',
      'advertencia',
      'Pago Anulado',
      format(
        'Factura %s por $%s ha sido anulada. Motivo: %s',
        NEW.numero_factura,
        to_char(NEW.total, 'FM999,999,999'),
        COALESCE(NEW.anulacion_justificacion, 'Sin motivo')
      ),
      'payment',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.generate_payment_anulacion_alert() IS
  'Genera alerta automatica cuando un pago es anulado';

-- ============================================
-- 2. PAYMENT ANULACION TRIGGER
-- ============================================

CREATE TRIGGER tr_alert_payment_anulacion
  AFTER UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_payment_anulacion_alert();

COMMENT ON TRIGGER tr_alert_payment_anulacion ON public.payments IS
  'Trigger que genera alerta automatica cuando un pago cambia a estado anulado';

-- ============================================
-- 3. CIERRE DIFERENCIA ALERT FUNCTION
-- ============================================

-- Generates alert when a cash closing has any difference (faltante or sobrante)
CREATE OR REPLACE FUNCTION public.generate_cierre_diferencia_alert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_severidad public.alert_severidad;
  v_titulo TEXT;
  v_tipo_diferencia TEXT;
BEGIN
  -- Only generate alert if there's a difference
  IF NEW.diferencia != 0 THEN
    -- Determine severity and title based on difference direction
    IF NEW.diferencia < 0 THEN
      -- Faltante (negative difference = less cash than expected)
      v_severidad := 'critico';
      v_titulo := 'Faltante en Cierre';
      v_tipo_diferencia := 'faltante';
    ELSE
      -- Sobrante (positive difference = more cash than expected)
      v_severidad := 'advertencia';
      v_titulo := 'Sobrante en Cierre';
      v_tipo_diferencia := 'sobrante';
    END IF;

    INSERT INTO public.alerts (
      tipo,
      severidad,
      titulo,
      descripcion,
      referencia_tipo,
      referencia_id
    ) VALUES (
      'diferencia_cierre',
      v_severidad,
      v_titulo,
      format(
        'Cierre %s del %s tiene %s de $%s. Justificacion: %s',
        NEW.cierre_numero,
        to_char(NEW.fecha_cierre, 'DD/MM/YYYY'),
        v_tipo_diferencia,
        to_char(ABS(NEW.diferencia), 'FM999,999,999'),
        COALESCE(NEW.diferencia_justificacion, 'Sin justificacion')
      ),
      'cash_closing',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.generate_cierre_diferencia_alert() IS
  'Genera alerta automatica cuando un cierre de caja tiene diferencia (faltante o sobrante)';

-- ============================================
-- 4. CIERRE DIFERENCIA TRIGGER
-- ============================================

CREATE TRIGGER tr_alert_cierre_diferencia
  AFTER INSERT ON public.cash_closings
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_cierre_diferencia_alert();

COMMENT ON TRIGGER tr_alert_cierre_diferencia ON public.cash_closings IS
  'Trigger que genera alerta automatica cuando un cierre tiene diferencia';

-- ============================================
-- 5. VERIFICATION
-- ============================================

DO $$
BEGIN
  -- Check payment anulacion function exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'generate_payment_anulacion_alert'
  ) THEN
    RAISE EXCEPTION 'generate_payment_anulacion_alert function not created';
  END IF;

  -- Check cierre diferencia function exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'generate_cierre_diferencia_alert'
  ) THEN
    RAISE EXCEPTION 'generate_cierre_diferencia_alert function not created';
  END IF;

  -- Check payment trigger exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'tr_alert_payment_anulacion'
  ) THEN
    RAISE EXCEPTION 'tr_alert_payment_anulacion trigger not created';
  END IF;

  -- Check cierre trigger exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'tr_alert_cierre_diferencia'
  ) THEN
    RAISE EXCEPTION 'tr_alert_cierre_diferencia trigger not created';
  END IF;

  RAISE NOTICE 'Alert triggers migration verified successfully';
END;
$$;

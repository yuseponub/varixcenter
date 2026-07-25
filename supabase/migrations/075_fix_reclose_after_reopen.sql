-- Migration: 075_fix_reclose_after_reopen.sql
-- Purpose: BUG: despues de REABRIR un cierre no se podia volver a cerrar el dia.
--          `create_cash_closing` rechazaba con "Ya existe un cierre para la
--          fecha X" mirando SOLO si existia una fila para esa fecha, sin
--          importar que estuviera en estado 'reabierto'. Resultado: reabrir
--          no servia para su unico proposito (corregir un cierre) y recepcion
--          quedaba sin forma de rehacer el cierre del dia.
--
-- Fix: si el cierre existente para la fecha esta 'reabierto', se ACTUALIZA esa
--      misma fila con los totales recalculados y vuelve a estado 'cerrado'
--      (conserva cierre_numero y el historial de reapertura; no consume un
--      numero nuevo del contador ni borra nada). Si esta 'cerrado', se sigue
--      rechazando, ahora con un mensaje que explica que hay que reabrirlo.
--
-- El resto de la funcion es IDENTICO a la definicion viva en produccion
-- (firma, roles admin/secretaria/enfermera, calculo de totales, NULLIF/TRIM,
-- lock_timeout y forma del JSON de retorno) para no cambiar comportamiento.
-- Depends on: 016_cash_closing_rpc.sql, 017_cierre_photo_optional.sql

CREATE OR REPLACE FUNCTION public.create_cash_closing(
  p_fecha date,
  p_conteo_fisico numeric,
  p_diferencia_justificacion text,
  p_cierre_photo_path text DEFAULT NULL::text,
  p_notas text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    v_existing_id UUID;
    v_existing_numero TEXT;
    v_existing_estado TEXT;
    v_recierre BOOLEAN := false;
  BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
      RAISE EXCEPTION 'No autorizado';
    END IF;

    SELECT role INTO v_user_role
    FROM public.user_roles
    WHERE user_id = v_user_id;

    IF v_user_role NOT IN ('admin', 'secretaria', 'enfermera') THEN
      RAISE EXCEPTION 'Solo Secretaria, Enfermera y Admin pueden cerrar caja';
    END IF;

    IF p_fecha > CURRENT_DATE THEN
      RAISE EXCEPTION 'No se puede cerrar un dia futuro';
    END IF;

    -- CAMBIO 075: un cierre REABIERTO se puede volver a cerrar (se corrige en
    -- sitio). Uno ya 'cerrado' sigue bloqueado.
    SELECT id, cierre_numero, estado::TEXT
      INTO v_existing_id, v_existing_numero, v_existing_estado
    FROM public.cash_closings
    WHERE fecha_cierre = p_fecha;

    IF v_existing_id IS NOT NULL THEN
      IF v_existing_estado = 'reabierto' THEN
        v_recierre := true;
        v_closing_id := v_existing_id;
        v_cierre_numero := v_existing_numero;
      ELSE
        RAISE EXCEPTION 'Ya existe un cierre para la fecha %. Un administrador debe reabrirlo para poder corregirlo.', p_fecha;
      END IF;
    END IF;

    IF p_conteo_fisico < 0 THEN
      RAISE EXCEPTION 'El conteo fisico no puede ser negativo';
    END IF;

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

    v_grand_total := v_total_efectivo + v_total_tarjeta + v_total_transferencia + v_total_nequi;
    v_diferencia := p_conteo_fisico - v_total_efectivo;

    IF v_diferencia != 0 THEN
      IF p_diferencia_justificacion IS NULL OR LENGTH(TRIM(p_diferencia_justificacion)) < 10 THEN
        RAISE EXCEPTION 'Hay una diferencia de %. Se requiere justificacion (minimo 10 caracteres)', v_diferencia;
      END IF;
    END IF;

    IF v_recierre THEN
      -- Re-cierre de un dia reabierto: se recalcula y se vuelve a cerrar
      -- conservando el numero original. El trigger de inmutabilidad permite
      -- este camino porque la fila esta en estado 'reabierto'.
      UPDATE public.cash_closings
      SET total_efectivo = v_total_efectivo,
          total_tarjeta = v_total_tarjeta,
          total_transferencia = v_total_transferencia,
          total_nequi = v_total_nequi,
          total_descuentos = v_total_descuentos,
          total_anulaciones = v_total_anulaciones,
          grand_total = v_grand_total,
          conteo_fisico_efectivo = p_conteo_fisico,
          diferencia = v_diferencia,
          diferencia_justificacion = NULLIF(TRIM(p_diferencia_justificacion), ''),
          cierre_photo_path = COALESCE(
            NULLIF(TRIM(COALESCE(p_cierre_photo_path, '')), ''),
            cierre_photo_path
          ),
          notas = NULLIF(TRIM(p_notas), ''),
          estado = 'cerrado',
          closed_by = v_user_id,
          updated_at = now()
      WHERE id = v_closing_id;
    ELSE
      SET LOCAL lock_timeout = '10s';
      v_cierre_numero := get_next_closing_number();

      INSERT INTO public.cash_closings (
        cierre_numero, fecha_cierre,
        total_efectivo, total_tarjeta, total_transferencia, total_nequi,
        total_descuentos, total_anulaciones, grand_total,
        conteo_fisico_efectivo, diferencia, diferencia_justificacion,
        cierre_photo_path, estado, notas, closed_by
      ) VALUES (
        v_cierre_numero, p_fecha,
        v_total_efectivo, v_total_tarjeta, v_total_transferencia, v_total_nequi,
        v_total_descuentos, v_total_anulaciones, v_grand_total,
        p_conteo_fisico, v_diferencia,
        NULLIF(TRIM(p_diferencia_justificacion), ''),
        NULLIF(TRIM(COALESCE(p_cierre_photo_path, '')), ''),
        'cerrado', NULLIF(TRIM(p_notas), ''), v_user_id
      )
      RETURNING id INTO v_closing_id;
    END IF;

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
      'diferencia', v_diferencia,
      'recierre', v_recierre
    );
  END;
  $function$;

COMMENT ON FUNCTION public.create_cash_closing(date, numeric, text, text, text) IS
  'Crea el cierre del dia. Si el cierre de esa fecha esta REABIERTO, lo recalcula y lo vuelve a cerrar conservando su numero (permite corregir un cierre). Roles: admin, secretaria, enfermera.';

-- ============================================================================
-- Trigger de inmutabilidad: permitir el RECALCULO solo en el re-cierre
-- (reabierto -> cerrado). Antes bloqueaba cualquier cambio de totales, con lo
-- que reabrir un cierre no permitia corregir las cifras: solo volver a marcarlo
-- como cerrado con los MISMOS numeros viejos.
--
-- Se conserva intacto: prohibido DELETE; los cierres en estado 'cerrado' son
-- inmutables; cierre_numero, fecha_cierre y created_at nunca cambian; reabrir
-- exige admin (RLS) + justificacion (constraint) + reopened_by.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.enforce_cash_closing_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_es_recierre BOOLEAN := false;
BEGIN
  -- Cannot delete cash closings
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'No se pueden eliminar cierres de caja';
  END IF;

  -- UPDATE restrictions
  IF TG_OP = 'UPDATE' THEN
    -- Re-cierre: el dia estaba reabierto y se vuelve a cerrar. Solo en este
    -- caso se permite reescribir totales/conteo/diferencia (el punto de
    -- reabrir es justamente poder corregirlos).
    v_es_recierre := (OLD.estado = 'reabierto' AND NEW.estado = 'cerrado');

    -- Core fields are immutable (siempre)
    IF OLD.cierre_numero IS DISTINCT FROM NEW.cierre_numero THEN
      RAISE EXCEPTION 'No se puede modificar el numero de cierre';
    END IF;

    IF OLD.fecha_cierre IS DISTINCT FROM NEW.fecha_cierre THEN
      RAISE EXCEPTION 'No se puede modificar la fecha de cierre';
    END IF;

    IF OLD.created_at IS DISTINCT FROM NEW.created_at THEN
      RAISE EXCEPTION 'No se puede modificar la fecha de creacion';
    END IF;

    IF NOT v_es_recierre THEN
      IF OLD.closed_by IS DISTINCT FROM NEW.closed_by THEN
        RAISE EXCEPTION 'No se puede modificar quien cerro';
      END IF;

      IF OLD.total_efectivo IS DISTINCT FROM NEW.total_efectivo
         OR OLD.total_tarjeta IS DISTINCT FROM NEW.total_tarjeta
         OR OLD.total_transferencia IS DISTINCT FROM NEW.total_transferencia
         OR OLD.total_nequi IS DISTINCT FROM NEW.total_nequi
         OR OLD.total_descuentos IS DISTINCT FROM NEW.total_descuentos
         OR OLD.total_anulaciones IS DISTINCT FROM NEW.total_anulaciones
         OR OLD.grand_total IS DISTINCT FROM NEW.grand_total THEN
        RAISE EXCEPTION 'No se pueden modificar los totales del cierre';
      END IF;

      IF OLD.conteo_fisico_efectivo IS DISTINCT FROM NEW.conteo_fisico_efectivo THEN
        RAISE EXCEPTION 'No se puede modificar el conteo fisico';
      END IF;

      IF OLD.diferencia IS DISTINCT FROM NEW.diferencia THEN
        RAISE EXCEPTION 'No se puede modificar la diferencia';
      END IF;

      IF OLD.diferencia_justificacion IS DISTINCT FROM NEW.diferencia_justificacion THEN
        RAISE EXCEPTION 'No se puede modificar la justificacion de diferencia';
      END IF;

      IF OLD.cierre_photo_path IS DISTINCT FROM NEW.cierre_photo_path THEN
        RAISE EXCEPTION 'No se puede modificar la foto del cierre';
      END IF;
    END IF;

    -- Estado transitions
    IF OLD.estado IS DISTINCT FROM NEW.estado THEN
      IF OLD.estado = 'cerrado' AND NEW.estado = 'reabierto' THEN
        IF NEW.reopened_by IS NULL THEN
          RAISE EXCEPTION 'Se requiere registrar quien reabre el cierre';
        END IF;
        NEW.reopened_at := now();
      ELSIF OLD.estado = 'reabierto' AND NEW.estado = 'cerrado' THEN
        -- Valid: re-closing (permite recalculo, ver v_es_recierre)
        NULL;
      ELSE
        RAISE EXCEPTION 'Transicion de estado no permitida: % -> %', OLD.estado, NEW.estado;
      END IF;
    END IF;

    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.enforce_cash_closing_immutability IS
  'Cierres inmutables: nunca se borran y los cerrados no se editan. Unica excepcion: al re-cerrar un cierre REABIERTO se permite reescribir totales/conteo/diferencia (corregir), conservando numero, fecha y trazabilidad de la reapertura.';

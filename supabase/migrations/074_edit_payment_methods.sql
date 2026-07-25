-- Migration: 074_edit_payment_methods.sql
-- Purpose: Permitir CORREGIR el metodo de pago de un pago ya registrado
--          (ej. se registro como efectivo pero fue tarjeta) sin abrir la
--          puerta a borrar o alterar el pago en si.
--          Decision del dueno (25-jul-2026): secretaria tambien puede editar
--          el metodo; anular/eliminar sigue restringido a admin/medico.
--
-- Diseno:
--   - NO se otorga UPDATE/DELETE directo sobre payment_methods a authenticated.
--     El cambio pasa por un RPC SECURITY DEFINER que valida rol, estado del
--     pago y que la suma de metodos siga cuadrando con el total del pago.
--   - Todo cambio queda en audit_log (append-only) con el detalle anterior y
--     el nuevo, para poder auditar quien cambio que.
--   - Se conserva la regla anti-fraude: los pagos electronicos requieren
--     comprobante (constraint comprobante_required_for_electronic).
-- Depends on: 009_payments_tables.sql, 002_audit_infrastructure.sql

-- ============================================================================
-- editar_metodos_pago
-- Reemplaza los metodos de un pago activo por el set recibido.
-- p_methods: [{"metodo":"tarjeta","monto":150000,"comprobante_path":"..."}]
-- ============================================================================
CREATE OR REPLACE FUNCTION public.editar_metodos_pago(
  p_payment_id UUID,
  p_methods JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_payment RECORD;
  v_method JSONB;
  v_methods_total DECIMAL := 0;
  v_old_methods JSONB;
  v_new_methods JSONB;
  v_metodo public.payment_method_type;
  v_monto DECIMAL;
  v_comprobante TEXT;
BEGIN
  -- ------------------------------------------------------------------
  -- 1. Rol: admin, medico y secretaria pueden CORREGIR el metodo.
  -- ------------------------------------------------------------------
  SELECT role INTO v_role
  FROM public.user_roles
  WHERE user_id = auth.uid();

  IF v_role IS NULL OR v_role NOT IN ('admin', 'medico', 'secretaria') THEN
    RAISE EXCEPTION 'No tiene permiso para editar el metodo de pago';
  END IF;

  -- ------------------------------------------------------------------
  -- 2. El pago debe existir y estar activo (los anulados no se tocan).
  -- ------------------------------------------------------------------
  SELECT id, total, estado INTO v_payment
  FROM public.payments
  WHERE id = p_payment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pago no encontrado';
  END IF;

  IF v_payment.estado <> 'activo' THEN
    RAISE EXCEPTION 'El pago fue anulado y no puede modificarse';
  END IF;

  IF p_methods IS NULL OR jsonb_array_length(p_methods) = 0 THEN
    RAISE EXCEPTION 'Debe incluir al menos un metodo de pago';
  END IF;

  -- Si ya se facturo en WiMAX (o hay una emision en curso), el metodo no se
  -- puede cambiar: la factura electronica ya salio con esa forma de pago.
  IF EXISTS (
    SELECT 1 FROM public.payment_invoicing
    WHERE payment_id = p_payment_id
      AND (estado IN ('facturada_total', 'facturada_parcial')
           OR wimax_factura_numero IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Este pago ya fue facturado en WiMAX y su metodo no puede cambiarse';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.wimax_invoice_jobs
    WHERE payment_id = p_payment_id
      AND estado IN ('en_cola', 'preparando', 'esperando_aprobacion', 'aprobada', 'verificando')
  ) THEN
    RAISE EXCEPTION 'Hay una facturacion en curso para este pago. Intente cuando termine.';
  END IF;

  -- ------------------------------------------------------------------
  -- 3. Validar cada metodo y que la suma cuadre con el total del pago.
  --    (el monto del pago NO cambia aqui: solo COMO se pago)
  -- ------------------------------------------------------------------
  FOR v_method IN SELECT * FROM jsonb_array_elements(p_methods)
  LOOP
    v_monto := (v_method->>'monto')::DECIMAL;
    v_comprobante := NULLIF(v_method->>'comprobante_path', '');

    IF v_monto IS NULL OR v_monto <= 0 THEN
      RAISE EXCEPTION 'Cada metodo debe tener un monto mayor a cero';
    END IF;

    BEGIN
      v_metodo := (v_method->>'metodo')::public.payment_method_type;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Metodo de pago invalido: %', v_method->>'metodo';
    END;

    v_methods_total := v_methods_total + v_monto;
  END LOOP;

  IF ROUND(v_methods_total, 2) <> ROUND(v_payment.total, 2) THEN
    RAISE EXCEPTION 'La suma de los metodos (%) debe ser igual al total del pago (%)',
      v_methods_total, v_payment.total;
  END IF;

  -- ------------------------------------------------------------------
  -- 4. Snapshot anterior para la auditoria.
  -- ------------------------------------------------------------------
  SELECT jsonb_agg(jsonb_build_object(
           'metodo', metodo,
           'monto', monto,
           'comprobante_path', comprobante_path
         ))
    INTO v_old_methods
  FROM public.payment_methods
  WHERE payment_id = p_payment_id;

  -- ------------------------------------------------------------------
  -- 5. Reemplazar los metodos (DELETE + INSERT dentro de la transaccion).
  --    payment_methods no tiene trigger de inmutabilidad; la proteccion
  --    real es que authenticated no tiene UPDATE/DELETE y este RPC valida.
  -- ------------------------------------------------------------------
  DELETE FROM public.payment_methods WHERE payment_id = p_payment_id;

  FOR v_method IN SELECT * FROM jsonb_array_elements(p_methods)
  LOOP
    INSERT INTO public.payment_methods (payment_id, metodo, monto, comprobante_path)
    VALUES (
      p_payment_id,
      (v_method->>'metodo')::public.payment_method_type,
      (v_method->>'monto')::DECIMAL,
      NULLIF(v_method->>'comprobante_path', '')
    );
  END LOOP;

  SELECT jsonb_agg(jsonb_build_object(
           'metodo', metodo,
           'monto', monto,
           'comprobante_path', comprobante_path
         ))
    INTO v_new_methods
  FROM public.payment_methods
  WHERE payment_id = p_payment_id;

  -- ------------------------------------------------------------------
  -- 6. Cola de facturacion WiMAX: si el pago dejo de tener porcion
  --    electronica (ej. se corrigio tarjeta -> efectivo), retirar la
  --    fila pendiente para no facturar algo que ya no fue electronico.
  --    Solo se toca 'pendiente': lo ya facturado NO se altera.
  --    (el trigger de INSERT vuelve a encolar si aplica, con ON CONFLICT)
  -- ------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM public.payment_methods
    WHERE payment_id = p_payment_id
      AND metodo IN ('tarjeta', 'transferencia')
  ) THEN
    DELETE FROM public.payment_invoicing
    WHERE payment_id = p_payment_id
      AND estado = 'pendiente'
      AND wimax_factura_numero IS NULL;
  END IF;

  -- ------------------------------------------------------------------
  -- 7. Auditoria (append-only).
  -- ------------------------------------------------------------------
  INSERT INTO public.audit_log (
    table_name, record_id, action, old_data, new_data, changed_fields, changed_by
  ) VALUES (
    'payment_methods',
    p_payment_id::text,
    'UPDATE',
    jsonb_build_object('methods', v_old_methods),
    jsonb_build_object('methods', v_new_methods),
    ARRAY['metodo', 'monto', 'comprobante_path'],
    auth.uid()
  );

  RETURN jsonb_build_object('success', true, 'methods', v_new_methods);
END;
$$;

COMMENT ON FUNCTION public.editar_metodos_pago IS
  'Corrige COMO se pago (metodo/monto por metodo) sin alterar el total del pago. Roles: admin, medico, secretaria. Auditado en audit_log.';

REVOKE ALL ON FUNCTION public.editar_metodos_pago(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.editar_metodos_pago(UUID, JSONB) TO authenticated;

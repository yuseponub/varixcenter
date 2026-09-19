-- Migration: 081_payments_corregir_valor.sql
-- Purpose: Permitir CORREGIR el valor de un pago de consulta/procedimiento que
--          se registro mal (precio o cantidad de un servicio, total y montos
--          por metodo) sin anularlo. El pago queda marcado en el registro como
--          "Valor editado por error", con quien lo corrigio, cuando y los
--          valores anteriores.
--          Decision del dueno (19-sep-2026): las empleadas (secretaria,
--          enfermera) tambien pueden corregir; anular sigue siendo admin/medico.
--
-- Diseno (mismo patron que 074_edit_payment_methods):
--   - La inmutabilidad de payments (010) se mantiene para todo el mundo. La
--     UNICA puerta es el RPC corregir_valor_pago, que marca la sesion con
--     set_config('varix.corrigiendo_pago', <id>) y el trigger deja pasar solo
--     subtotal/total y las columnas de rastro de ESE pago. Paciente, numero de
--     factura, descuento, fecha, creador y estado siguen inmutables.
--   - NO se otorga UPDATE/DELETE directo sobre payment_items/payment_methods.
--   - Se conservan las reglas vigentes de creacion (061): suma de items =
--     subtotal, suma de metodos = total, total >= 0.
--   - Bloqueado si el pago esta anulado, si ya se facturo en WiMAX o si hay un
--     trabajo del robot en curso (la factura electronica ya salio asi).
--   - Cada correccion queda en payment_value_edits (append-only, con snapshot
--     anterior y nuevo) y en audit_log; el trigger tr_audit_payments ademas
--     registra el UPDATE de la fila del pago.
-- Depends on: 009_payments_tables.sql, 010_payments_immutability.sql,
--             061_relax_price_validation.sql, 073_wimax_colfact_pdf_and_transfers.sql,
--             074_edit_payment_methods.sql, 002_audit_infrastructure.sql

-- ============================================================================
-- 1. RESUMEN DE LA CORRECCION EN EL PAGO Y EN SUS ITEMS
-- ============================================================================

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS valor_editado_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS valor_editado_por UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS total_original DECIMAL(12,2);

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_valor_editado_fields_consistent;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_valor_editado_fields_consistent CHECK (
    (valor_editado_at IS NULL AND valor_editado_por IS NULL AND total_original IS NULL) OR
    (valor_editado_at IS NOT NULL AND valor_editado_por IS NOT NULL AND total_original IS NOT NULL)
  );

COMMENT ON COLUMN public.payments.valor_editado_at IS 'Ultima correccion de valor ("Valor editado por error"); NULL si nunca se edito';
COMMENT ON COLUMN public.payments.valor_editado_por IS 'Usuario que hizo la ultima correccion de valor';
COMMENT ON COLUMN public.payments.total_original IS 'Total con el que se registro el pago antes de la primera correccion';

ALTER TABLE public.payment_items
  ADD COLUMN IF NOT EXISTS unit_price_original DECIMAL(12,2);

COMMENT ON COLUMN public.payment_items.unit_price_original IS 'Precio unitario con el que se registro el item antes de la primera correccion; NULL si nunca cambio';

-- ============================================================================
-- 2. HISTORIAL DE CORRECCIONES (APPEND-ONLY)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.payment_value_edits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE RESTRICT,

  -- Quien y cuando (nombre en snapshot para no depender de auth.users al leer)
  editado_por UUID NOT NULL REFERENCES auth.users(id),
  editado_por_nombre TEXT NOT NULL,
  editado_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Etiqueta fija que pide la clinica + nota opcional
  motivo TEXT NOT NULL DEFAULT 'Valor editado por error',
  nota TEXT,

  -- El dia del pago ya tenia cierre de caja cerrado al momento de corregir
  dia_cerrado BOOLEAN NOT NULL DEFAULT false,

  -- Antes y despues
  subtotal_anterior DECIMAL(12,2) NOT NULL,
  subtotal_nuevo DECIMAL(12,2) NOT NULL,
  total_anterior DECIMAL(12,2) NOT NULL,
  total_nuevo DECIMAL(12,2) NOT NULL,
  items_anteriores JSONB NOT NULL,   -- [{item_id, service_name, quantity, unit_price, subtotal}]
  items_nuevos JSONB NOT NULL,
  metodos_anteriores JSONB NOT NULL, -- [{metodo, monto, comprobante_path}]
  metodos_nuevos JSONB NOT NULL,

  CONSTRAINT payment_value_edits_nota_length CHECK (nota IS NULL OR LENGTH(nota) <= 300)
);

COMMENT ON TABLE public.payment_value_edits IS 'Historial inmutable de correcciones de valor de pagos ("Valor editado por error")';

CREATE INDEX IF NOT EXISTS idx_payment_value_edits_payment
  ON public.payment_value_edits(payment_id, editado_at DESC);

ALTER TABLE public.payment_value_edits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view payment value edits"
  ON public.payment_value_edits;

CREATE POLICY "Authenticated users can view payment value edits"
  ON public.payment_value_edits FOR SELECT
  TO authenticated
  USING (true);

-- Sin politicas de INSERT/UPDATE/DELETE: solo escribe el RPC (SECURITY DEFINER).
-- Y aun para el dueno de la tabla, el historial no se altera ni se borra.
CREATE OR REPLACE FUNCTION public.protect_payment_value_edits()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'El historial de correcciones de valor es inmutable';
END;
$$;

DROP TRIGGER IF EXISTS tr_protect_payment_value_edits ON public.payment_value_edits;

CREATE TRIGGER tr_protect_payment_value_edits
  BEFORE UPDATE OR DELETE ON public.payment_value_edits
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_payment_value_edits();

GRANT SELECT ON public.payment_value_edits TO authenticated;

-- ============================================================================
-- 3. INMUTABILIDAD DE PAYMENTS: MISMAS REGLAS DE LA 010 + UNA PUERTA ACOTADA
--    Solo cuando la sesion esta marcada por corregir_valor_pago para ESTE pago
--    se permite cambiar subtotal, total y las columnas de rastro. Nada mas.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_payment_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_corrigiendo BOOLEAN;
BEGIN
    -- RULE 1: DELETE is NEVER allowed
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Los pagos no pueden ser eliminados. Use anulacion.';
    END IF;

    IF TG_OP = 'UPDATE' THEN
        v_corrigiendo := COALESCE(current_setting('varix.corrigiendo_pago', true), '') = OLD.id::text;

        -- RULE 2: campos inmutables bajo cualquier circunstancia
        IF OLD.patient_id IS DISTINCT FROM NEW.patient_id THEN
            RAISE EXCEPTION 'Los pagos son inmutables. Solo se permite anulacion.';
        END IF;

        IF OLD.numero_factura IS DISTINCT FROM NEW.numero_factura THEN
            RAISE EXCEPTION 'Los pagos son inmutables. Solo se permite anulacion.';
        END IF;

        IF OLD.descuento IS DISTINCT FROM NEW.descuento THEN
            RAISE EXCEPTION 'Los pagos son inmutables. Solo se permite anulacion.';
        END IF;

        IF OLD.descuento_justificacion IS DISTINCT FROM NEW.descuento_justificacion THEN
            RAISE EXCEPTION 'Los pagos son inmutables. Solo se permite anulacion.';
        END IF;

        IF OLD.created_by IS DISTINCT FROM NEW.created_by THEN
            RAISE EXCEPTION 'Los pagos son inmutables. Solo se permite anulacion.';
        END IF;

        IF OLD.created_at IS DISTINCT FROM NEW.created_at THEN
            RAISE EXCEPTION 'Los pagos son inmutables. Solo se permite anulacion.';
        END IF;

        -- RULE 2b: valores y rastro de correccion: solo via corregir_valor_pago
        IF NOT v_corrigiendo THEN
            IF OLD.subtotal IS DISTINCT FROM NEW.subtotal
               OR OLD.total IS DISTINCT FROM NEW.total
               OR OLD.valor_editado_at IS DISTINCT FROM NEW.valor_editado_at
               OR OLD.valor_editado_por IS DISTINCT FROM NEW.valor_editado_por
               OR OLD.total_original IS DISTINCT FROM NEW.total_original THEN
                RAISE EXCEPTION 'Los pagos son inmutables. Solo se permite anulacion.';
            END IF;
        ELSE
            -- Mientras se corrige el valor no se puede tocar el estado ni la anulacion
            IF OLD.estado IS DISTINCT FROM NEW.estado
               OR OLD.anulado_por IS DISTINCT FROM NEW.anulado_por
               OR OLD.anulado_at IS DISTINCT FROM NEW.anulado_at
               OR OLD.anulacion_justificacion IS DISTINCT FROM NEW.anulacion_justificacion THEN
                RAISE EXCEPTION 'No se puede cambiar el estado del pago mientras se corrige su valor.';
            END IF;
            RETURN NEW;
        END IF;

        -- RULE 3: solo se permite la transicion activo -> anulado
        IF OLD.estado IS DISTINCT FROM NEW.estado THEN
            IF OLD.estado != 'activo' THEN
                RAISE EXCEPTION 'El pago ya fue anulado y no puede modificarse.';
            END IF;

            IF NEW.estado != 'anulado' THEN
                RAISE EXCEPTION 'Solo se permite cambiar estado a anulado.';
            END IF;

            IF NEW.anulacion_justificacion IS NULL OR TRIM(NEW.anulacion_justificacion) = '' THEN
                RAISE EXCEPTION 'La anulacion requiere una justificacion.';
            END IF;

            IF NEW.anulado_por IS NULL THEN
                RAISE EXCEPTION 'La anulacion requiere el usuario que anula (anulado_por).';
            END IF;

            IF NEW.anulado_at IS NULL THEN
                NEW.anulado_at := now();
            END IF;
        ELSE
            IF OLD.anulado_por IS DISTINCT FROM NEW.anulado_por
               OR OLD.anulado_at IS DISTINCT FROM NEW.anulado_at
               OR OLD.anulacion_justificacion IS DISTINCT FROM NEW.anulacion_justificacion THEN
                RAISE EXCEPTION 'Los pagos son inmutables. Solo se permite anulacion.';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_payment_immutability() IS
    'Enforces payment immutability: only anulacion allowed; subtotal/total solo via corregir_valor_pago (081)';

-- ============================================================================
-- 4. RPC: corregir_valor_pago
-- p_items:   [{"item_id": "<uuid>", "unit_price": 150000, "quantity": 1}, ...]
--            Los items que no vengan conservan sus valores.
-- p_methods: [{"metodo": "efectivo", "monto": 150000, "comprobante_path": null}, ...]
--            Reemplaza los metodos del pago; la suma debe ser igual a p_total.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.corregir_valor_pago(
  p_payment_id UUID,
  p_items JSONB,
  p_total DECIMAL(12,2),
  p_methods JSONB,
  p_nota TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
  v_user_nombre TEXT;
  v_payment RECORD;
  v_item RECORD;
  v_input RECORD;
  v_method JSONB;
  v_metodo public.payment_method_type;
  v_monto DECIMAL;
  v_methods_total DECIMAL := 0;
  v_subtotal_nuevo DECIMAL(12,2);
  v_nota TEXT;
  v_dia_cerrado BOOLEAN;
  v_changes INTEGER := 0;
  v_items_anteriores JSONB;
  v_items_nuevos JSONB;
  v_metodos_anteriores JSONB;
  v_metodos_nuevos JSONB;
  v_edit_id UUID;
BEGIN
  -- ------------------------------------------------------------------
  -- 1. Usuario y rol: todo el personal con rol puede corregir valores.
  -- ------------------------------------------------------------------
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  SELECT role::text INTO v_role
  FROM public.user_roles
  WHERE user_id = v_user_id;

  IF v_role IS NULL OR v_role NOT IN ('admin', 'medico', 'secretaria', 'enfermera') THEN
    RAISE EXCEPTION 'No tiene permiso para corregir el valor de un pago';
  END IF;

  SELECT COALESCE(
           NULLIF(TRIM(CONCAT_WS(' ',
             u.raw_user_meta_data->>'nombre',
             u.raw_user_meta_data->>'apellido')), ''),
           split_part(u.email, '@', 1)
         )
    INTO v_user_nombre
  FROM auth.users u
  WHERE u.id = v_user_id;

  -- ------------------------------------------------------------------
  -- 2. Validar entrada.
  -- ------------------------------------------------------------------
  IF p_payment_id IS NULL THEN
    RAISE EXCEPTION 'ID de pago es requerido';
  END IF;

  IF p_total IS NULL OR p_total < 0 THEN
    RAISE EXCEPTION 'El total no puede ser negativo';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Items invalidos';
  END IF;

  IF p_methods IS NULL OR jsonb_typeof(p_methods) <> 'array' OR jsonb_array_length(p_methods) = 0 THEN
    RAISE EXCEPTION 'Debe incluir al menos un metodo de pago';
  END IF;

  v_nota := NULLIF(TRIM(COALESCE(p_nota, '')), '');
  IF v_nota IS NOT NULL AND LENGTH(v_nota) > 300 THEN
    RAISE EXCEPTION 'La nota es muy larga (maximo 300 caracteres)';
  END IF;

  SET LOCAL lock_timeout = '10s';

  -- ------------------------------------------------------------------
  -- 3. El pago debe existir, estar activo y no estar facturado en WiMAX.
  -- ------------------------------------------------------------------
  SELECT * INTO v_payment
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pago no encontrado';
  END IF;

  IF v_payment.estado <> 'activo' THEN
    RAISE EXCEPTION 'El pago fue anulado y no puede modificarse';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.payment_invoicing
    WHERE payment_id = p_payment_id
      AND (estado IN ('facturada_total', 'facturada_parcial')
           OR wimax_factura_numero IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Este pago ya fue facturado en WiMAX y su valor no puede cambiarse';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.wimax_invoice_jobs
    WHERE payment_id = p_payment_id
      AND estado IN ('en_cola', 'preparando', 'esperando_aprobacion', 'aprobada',
                     'verificando', 'emitida_sin_cufe', 'requiere_revision')
  ) THEN
    RAISE EXCEPTION 'Hay una facturacion en curso para este pago. Intente cuando termine.';
  END IF;

  -- El dia ya cerrado no bloquea (igual que corregir el metodo), pero queda
  -- registrado: el cierre conserva las cifras del momento en que se hizo.
  SELECT EXISTS (
    SELECT 1 FROM public.cash_closings
    WHERE fecha_cierre = DATE(v_payment.created_at)
      AND estado = 'cerrado'
  ) INTO v_dia_cerrado;

  -- ------------------------------------------------------------------
  -- 4. Snapshots anteriores.
  -- ------------------------------------------------------------------
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'item_id', id,
           'service_name', service_name,
           'quantity', quantity,
           'unit_price', unit_price,
           'subtotal', subtotal
         ) ORDER BY created_at, id), '[]'::jsonb)
    INTO v_items_anteriores
  FROM public.payment_items
  WHERE payment_id = p_payment_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'metodo', metodo,
           'monto', monto,
           'comprobante_path', comprobante_path
         ) ORDER BY created_at, id), '[]'::jsonb)
    INTO v_metodos_anteriores
  FROM public.payment_methods
  WHERE payment_id = p_payment_id;

  -- ------------------------------------------------------------------
  -- 5. Aplicar precio/cantidad a cada item recibido (solo si cambia).
  -- ------------------------------------------------------------------
  FOR v_input IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
    item_id UUID, unit_price DECIMAL(12,2), quantity INTEGER
  )
  LOOP
    IF v_input.item_id IS NULL THEN
      RAISE EXCEPTION 'Item invalido';
    END IF;

    IF v_input.unit_price IS NULL OR v_input.unit_price < 0 THEN
      RAISE EXCEPTION 'El precio unitario no puede ser negativo';
    END IF;

    IF v_input.quantity IS NULL OR v_input.quantity < 1 THEN
      RAISE EXCEPTION 'La cantidad debe ser al menos 1';
    END IF;

    SELECT * INTO v_item
    FROM public.payment_items
    WHERE id = v_input.item_id
      AND payment_id = p_payment_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'El servicio no pertenece a este pago';
    END IF;

    IF ROUND(v_item.unit_price, 2) <> ROUND(v_input.unit_price, 2)
       OR v_item.quantity <> v_input.quantity THEN
      UPDATE public.payment_items
      SET unit_price = v_input.unit_price,
          quantity = v_input.quantity,
          subtotal = v_input.quantity * v_input.unit_price,
          unit_price_original = COALESCE(unit_price_original, unit_price)
      WHERE id = v_item.id;

      v_changes := v_changes + 1;
    END IF;
  END LOOP;

  SELECT COALESCE(SUM(subtotal), 0) INTO v_subtotal_nuevo
  FROM public.payment_items
  WHERE payment_id = p_payment_id;

  IF ROUND(v_payment.total, 2) <> ROUND(p_total, 2) THEN
    v_changes := v_changes + 1;
  END IF;

  -- ------------------------------------------------------------------
  -- 6. Validar metodos: cada uno con monto > 0 y la suma igual al total.
  -- ------------------------------------------------------------------
  FOR v_method IN SELECT * FROM jsonb_array_elements(p_methods)
  LOOP
    v_monto := (v_method->>'monto')::DECIMAL;

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

  IF ROUND(v_methods_total, 2) <> ROUND(p_total, 2) THEN
    RAISE EXCEPTION 'La suma de los metodos (%) debe ser igual al total del pago (%)',
      v_methods_total, p_total;
  END IF;

  -- Metodos distintos a los actuales tambien cuentan como cambio
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'metodo', m->>'metodo',
           'monto', ROUND((m->>'monto')::DECIMAL, 2),
           'comprobante_path', NULLIF(m->>'comprobante_path', '')
         ) ORDER BY m->>'metodo', (m->>'monto')::DECIMAL), '[]'::jsonb)
    INTO v_metodos_nuevos
  FROM jsonb_array_elements(p_methods) AS m;

  IF v_changes = 0 AND (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'metodo', metodo::text,
             'monto', ROUND(monto, 2),
             'comprobante_path', comprobante_path
           ) ORDER BY metodo::text, monto), '[]'::jsonb)
    FROM public.payment_methods WHERE payment_id = p_payment_id
  ) = v_metodos_nuevos THEN
    RAISE EXCEPTION 'No hay ningun valor distinto al registrado';
  END IF;

  -- ------------------------------------------------------------------
  -- 7. Actualizar el pago (puerta acotada en el trigger de inmutabilidad).
  -- ------------------------------------------------------------------
  PERFORM set_config('varix.corrigiendo_pago', p_payment_id::text, true);

  UPDATE public.payments
  SET subtotal = v_subtotal_nuevo,
      total = p_total,
      total_original = COALESCE(total_original, total),
      valor_editado_at = now(),
      valor_editado_por = v_user_id
  WHERE id = p_payment_id;

  PERFORM set_config('varix.corrigiendo_pago', '', true);

  -- ------------------------------------------------------------------
  -- 8. Reemplazar los metodos (DELETE + INSERT, como en 074). El trigger de
  --    INSERT vuelve a encolar la facturacion si hay porcion electronica.
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
  -- 9. Historial + auditoria (ambos append-only).
  -- ------------------------------------------------------------------
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'item_id', id,
           'service_name', service_name,
           'quantity', quantity,
           'unit_price', unit_price,
           'subtotal', subtotal
         ) ORDER BY created_at, id), '[]'::jsonb)
    INTO v_items_nuevos
  FROM public.payment_items
  WHERE payment_id = p_payment_id;

  INSERT INTO public.payment_value_edits (
    payment_id, editado_por, editado_por_nombre, nota, dia_cerrado,
    subtotal_anterior, subtotal_nuevo, total_anterior, total_nuevo,
    items_anteriores, items_nuevos, metodos_anteriores, metodos_nuevos
  ) VALUES (
    p_payment_id, v_user_id, COALESCE(v_user_nombre, 'usuario'), v_nota, v_dia_cerrado,
    v_payment.subtotal, v_subtotal_nuevo, v_payment.total, p_total,
    v_items_anteriores, v_items_nuevos, v_metodos_anteriores, v_metodos_nuevos
  ) RETURNING id INTO v_edit_id;

  INSERT INTO public.audit_log (
    table_name, record_id, action, old_data, new_data, changed_fields, changed_by
  ) VALUES (
    'payment_items',
    p_payment_id::text,
    'UPDATE',
    jsonb_build_object('subtotal', v_payment.subtotal, 'total', v_payment.total,
                       'items', v_items_anteriores, 'methods', v_metodos_anteriores),
    jsonb_build_object('subtotal', v_subtotal_nuevo, 'total', p_total,
                       'items', v_items_nuevos, 'methods', v_metodos_nuevos,
                       'motivo', 'Valor editado por error', 'nota', v_nota,
                       'dia_cerrado', v_dia_cerrado),
    ARRAY['unit_price', 'quantity', 'subtotal', 'total', 'monto'],
    v_user_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'edit_id', v_edit_id,
    'subtotal', v_subtotal_nuevo,
    'total', p_total,
    'dia_cerrado', v_dia_cerrado
  );
END;
$$;

COMMENT ON FUNCTION public.corregir_valor_pago IS
  'Corrige precio/cantidad de servicios, total y montos por metodo de un pago activo no facturado. Queda marcado como "Valor editado por error" con historial en payment_value_edits y audit_log. Roles: admin, medico, secretaria, enfermera.';

REVOKE ALL ON FUNCTION public.corregir_valor_pago(UUID, JSONB, DECIMAL, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.corregir_valor_pago(UUID, JSONB, DECIMAL, JSONB, TEXT) TO authenticated;

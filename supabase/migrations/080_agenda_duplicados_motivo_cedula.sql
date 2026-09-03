-- Migration: 080_agenda_duplicados_motivo_cedula.sql
-- Purpose: tres arreglos de agenda pedidos por la clinica (sep-2026):
--
-- 1. La recepcion puede guardar el procedimiento que elige al agendar.
--    La barra de "cita rapida" ofrece el selector "Procedimiento" a todos los
--    roles, pero la politica de INSERT de appointment_services (013) solo
--    admitia admin/medico/enfermera. Para 'secretaria' el insert fallaba en
--    silencio (solo un console.error) y la cita quedaba sin procedimiento:
--    en los ultimos 90 dias, 0 de 363 citas creadas por secretaria lo
--    conservaron, frente a 391 de 530 creadas por medico. Por eso el
--    "motivo" de la cita aparecia de forma irregular en la agenda.
--
-- 2. Cualquier miembro del equipo puede borrar una cita REPETIDA: otra cita
--    viva de la misma persona (mismo paciente, misma cedula, mismo celular o
--    mismo nombre completo) el mismo dia de Bogota. El borrado fisico sigue
--    reservado a admin por RLS (007); el RPC delete_duplicate_appointment es
--    la unica puerta para los demas roles y verifica la repeticion en el
--    servidor. No borra citas ya atendidas ni con historia, pagos o
--    procedimientos pagados: en ese caso la repetida es la otra.
--
-- 3. El outbox de Outlook (065) sobrevive al borrado fisico. Su FK tenia
--    ON DELETE CASCADE: al borrar la cita se perdia la orden 'delete' y el
--    evento quedaba vivo en el calendario de recepcion. Ahora la orden guarda
--    un snapshot (connection_id, graph_event_id) del evento remoto y el
--    procesador lo retira aunque la cita ya no exista.

-- ============================================
-- 1. SECRETARIA PUEDE REGISTRAR PROCEDIMIENTOS
-- ============================================

DROP POLICY IF EXISTS "Medico and admin can create appointment services"
  ON public.appointment_services;

CREATE POLICY "Staff can create appointment services"
  ON public.appointment_services FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'medico', 'enfermera', 'secretaria')
    )
  );

-- ============================================
-- 2. OUTBOX OUTLOOK: SNAPSHOT DEL EVENTO REMOTO
-- ============================================

ALTER TABLE public.outlook_sync_outbox
  ADD COLUMN IF NOT EXISTS connection_id UUID
    REFERENCES public.outlook_connections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS graph_event_id TEXT;

COMMENT ON COLUMN public.outlook_sync_outbox.graph_event_id IS
  'Evento de Graph a retirar cuando la cita ya fue borrada (cita repetida).';

-- La FK con CASCADE borraba la orden junto con la cita. El id se conserva como
-- referencia historica; el procesador ya tolera una cita inexistente.
DO $$
DECLARE
  v_constraint TEXT;
BEGIN
  SELECT conname INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.outlook_sync_outbox'::regclass
    AND contype = 'f'
    AND confrelid = 'public.appointments'::regclass;

  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.outlook_sync_outbox DROP CONSTRAINT %I', v_constraint);
  END IF;
END;
$$;

-- ============================================
-- 3. BORRAR UNA CITA REPETIDA
-- ============================================

-- Nombre completo comparable: minusculas, sin tildes, espacios colapsados.
CREATE OR REPLACE FUNCTION public.normalize_person_name(p_nombre TEXT, p_apellido TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(
    translate(
      lower(trim(coalesce(p_nombre, '') || ' ' || coalesce(p_apellido, ''))),
      'áéíóúàèìòùäëïöüñ',
      'aeiouaeiouaeioun'
    ),
    '\s+', ' ', 'g'
  )
$$;

CREATE OR REPLACE FUNCTION public.delete_duplicate_appointment(p_appointment_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_apt public.appointments%ROWTYPE;
  v_patient public.patients%ROWTYPE;
  v_day DATE;
  v_keep UUID;
  v_mirror RECORD;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin', 'medico', 'enfermera', 'secretaria')
  ) THEN
    RAISE EXCEPTION 'No autorizado para borrar citas' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_apt FROM public.appointments WHERE id = p_appointment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La cita ya no existe' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_patient FROM public.patients WHERE id = v_apt.patient_id;

  -- Solo se borra la copia que no dejo rastro clinico ni de caja.
  IF v_apt.estado IN ('en_atencion', 'completada') THEN
    RAISE EXCEPTION 'Esta cita ya se atendio. Borre la otra cita repetida.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.medical_records WHERE appointment_id = v_apt.id) THEN
    RAISE EXCEPTION 'Esta cita tiene historia clinica. Borre la otra cita repetida.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.payments WHERE appointment_id = v_apt.id) THEN
    RAISE EXCEPTION 'Esta cita tiene pagos registrados. Borre la otra cita repetida.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.appointment_services
    WHERE appointment_id = v_apt.id AND estado_pago = 'pagado'
  ) THEN
    RAISE EXCEPTION 'Esta cita tiene procedimientos pagados. Borre la otra cita repetida.';
  END IF;

  -- Repetida = otra cita viva de la misma persona el mismo dia (Bogota).
  v_day := (v_apt.fecha_hora_inicio AT TIME ZONE 'America/Bogota')::date;

  SELECT b.id INTO v_keep
  FROM public.appointments b
  JOIN public.patients pb ON pb.id = b.patient_id
  WHERE b.id <> v_apt.id
    AND b.estado <> 'cancelada'
    AND (b.fecha_hora_inicio AT TIME ZONE 'America/Bogota')::date = v_day
    AND (
      b.patient_id = v_apt.patient_id
      OR (v_patient.cedula IS NOT NULL AND pb.cedula = v_patient.cedula)
      OR (
        v_patient.celular IS NOT NULL
        AND length(v_patient.celular) >= 7
        AND pb.celular = v_patient.celular
      )
      OR public.normalize_person_name(pb.nombre, pb.apellido)
         = public.normalize_person_name(v_patient.nombre, v_patient.apellido)
    )
  ORDER BY (b.estado IN ('en_atencion', 'completada')) DESC, b.created_at ASC
  LIMIT 1;

  IF v_keep IS NULL THEN
    RAISE EXCEPTION 'La cita no esta repetida: no hay otra cita de la misma persona ese dia.';
  END IF;

  -- Outlook (Graph): la orden de borrado guarda el evento remoto y el espejo
  -- se oculta de inmediato para que la agenda no lo muestre como cita suelta.
  FOR v_mirror IN
    SELECT id, connection_id, graph_event_id
    FROM public.outlook_events
    WHERE appointment_id = v_apt.id AND deleted_at IS NULL
  LOOP
    INSERT INTO public.outlook_sync_outbox AS existing (
      appointment_id, operation, attempts, available_at, processed_at, last_error,
      connection_id, graph_event_id
    ) VALUES (
      v_apt.id, 'delete', 0, now(), NULL, NULL,
      v_mirror.connection_id, v_mirror.graph_event_id
    )
    ON CONFLICT (appointment_id) DO UPDATE
    SET
      operation = 'delete',
      attempts = 0,
      available_at = now(),
      processed_at = NULL,
      last_error = NULL,
      connection_id = EXCLUDED.connection_id,
      graph_event_id = EXCLUDED.graph_event_id,
      updated_at = now();

    UPDATE public.outlook_events
    SET is_cancelled = true, deleted_at = now(), synced_at = now()
    WHERE id = v_mirror.id;
  END LOOP;

  -- Outlook de escritorio (espejo de solo lectura): el evento local sigue
  -- existiendo, asi que se enlaza a la cita que se conserva. Si esa ya tiene
  -- el suyo, se ignora para que no reaparezca como cita suelta.
  UPDATE public.outlook_desktop_events d
  SET appointment_id = v_keep, match_status = 'matched'
  WHERE d.appointment_id = v_apt.id
    AND NOT EXISTS (
      SELECT 1 FROM public.outlook_desktop_events k WHERE k.appointment_id = v_keep
    );

  UPDATE public.outlook_desktop_events
  SET appointment_id = NULL, match_status = 'ignored'
  WHERE appointment_id = v_apt.id;

  -- Procedimientos pendientes (los pagados ya bloquearon arriba) y la cita.
  -- notifications cae en cascada; payments/progress_notes quedan en NULL.
  DELETE FROM public.appointment_services WHERE appointment_id = v_apt.id;
  DELETE FROM public.appointments WHERE id = v_apt.id;

  RETURN v_keep;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_duplicate_appointment(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_duplicate_appointment(UUID) TO authenticated;

COMMENT ON FUNCTION public.delete_duplicate_appointment(UUID) IS
  'Borra una cita repetida (otra cita viva de la misma persona el mismo dia) y devuelve el id de la que se conserva. Unica via de borrado para roles no admin.';

-- ============================================
-- 4. VERIFICACION
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'appointment_services'
      AND policyname = 'Staff can create appointment services'
  ) THEN
    RAISE EXCEPTION 'Politica de INSERT de appointment_services no creada';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.outlook_sync_outbox'::regclass
      AND contype = 'f'
      AND confrelid = 'public.appointments'::regclass
  ) THEN
    RAISE EXCEPTION 'outlook_sync_outbox sigue en cascada con appointments';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'delete_duplicate_appointment'
      AND pronamespace = 'public'::regnamespace
  ) THEN
    RAISE EXCEPTION 'delete_duplicate_appointment no creada';
  END IF;
END;
$$;

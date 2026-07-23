-- Migration: 065_outlook_calendar_sync.sql
-- Purpose: Continuous Microsoft Outlook calendar mirror and reliable write-back queue

-- ============================================================================
-- 1. CONNECTION STATE (service-role only; contains opaque Graph delta tokens)
-- ============================================================================

CREATE TABLE public.outlook_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox TEXT NOT NULL,
  calendar_id TEXT NOT NULL DEFAULT 'calendar',
  enabled BOOLEAN NOT NULL DEFAULT true,
  window_start TIMESTAMPTZ,
  window_end TIMESTAMPTZ,
  delta_link TEXT,
  subscription_id TEXT,
  subscription_expires_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  last_sync_ok BOOLEAN,
  last_error TEXT,
  sync_lock_owner UUID,
  sync_lock_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT outlook_connections_mailbox_calendar_unique UNIQUE (mailbox, calendar_id),
  CONSTRAINT outlook_connections_valid_window CHECK (
    window_start IS NULL OR window_end IS NULL OR window_end > window_start
  ),
  CONSTRAINT outlook_connections_lock_pair CHECK (
    (sync_lock_owner IS NULL) = (sync_lock_until IS NULL)
  )
);

COMMENT ON TABLE public.outlook_connections IS
  'Estado privado de sincronizacion Microsoft Graph: delta token, suscripcion y ultima corrida.';
COMMENT ON COLUMN public.outlook_connections.delta_link IS
  'URL opaca de Microsoft Graph; no se expone a clientes autenticados.';

CREATE TRIGGER tr_outlook_connections_updated_at
  BEFORE UPDATE ON public.outlook_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.outlook_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.outlook_connections FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.outlook_connections TO service_role;

-- La vista corre como su propietario para exponer solo las columnas seguras,
-- pero aun verifica que quien consulta sea personal clinico autenticado.
CREATE VIEW public.outlook_sync_status
WITH (security_invoker = false) AS
SELECT
  id,
  mailbox,
  calendar_id,
  enabled,
  subscription_expires_at,
  last_synced_at,
  last_sync_ok,
  last_error,
  updated_at
FROM public.outlook_connections
WHERE public.get_user_role() IN ('admin', 'medico', 'enfermera', 'secretaria');

GRANT SELECT ON public.outlook_sync_status TO authenticated;

-- ============================================================================
-- 2. CLOUD MIRROR OF OUTLOOK EVENTS
-- ============================================================================

CREATE TABLE public.outlook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES public.outlook_connections(id) ON DELETE CASCADE,
  graph_event_id TEXT NOT NULL,
  ical_uid TEXT,
  change_key TEXT,
  subject TEXT NOT NULL DEFAULT '(Sin asunto)',
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  original_time_zone TEXT,
  is_all_day BOOLEAN NOT NULL DEFAULT false,
  is_cancelled BOOLEAN NOT NULL DEFAULT false,
  show_as TEXT,
  location TEXT,
  web_link TEXT,
  event_type TEXT,
  series_master_id TEXT,
  categories TEXT[] NOT NULL DEFAULT '{}',
  graph_last_modified_at TIMESTAMPTZ,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  match_status TEXT NOT NULL DEFAULT 'unmatched'
    CHECK (match_status IN ('unmatched', 'matched', 'conflict', 'ignored')),
  sync_error TEXT,
  deleted_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT outlook_events_graph_id_unique UNIQUE (connection_id, graph_event_id),
  CONSTRAINT outlook_events_appointment_unique UNIQUE (appointment_id),
  CONSTRAINT outlook_events_valid_range CHECK (end_at > start_at)
);

COMMENT ON TABLE public.outlook_events IS
  'Espejo minimo de eventos Outlook. No guarda cuerpo ni asistentes para reducir exposicion de datos clinicos.';

CREATE INDEX idx_outlook_events_range
  ON public.outlook_events(start_at, end_at)
  WHERE deleted_at IS NULL AND is_cancelled = false;
CREATE INDEX idx_outlook_events_ical_uid ON public.outlook_events(ical_uid);
CREATE INDEX idx_outlook_events_appointment ON public.outlook_events(appointment_id);

CREATE TRIGGER tr_outlook_events_updated_at
  BEFORE UPDATE ON public.outlook_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.outlook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view Outlook events"
  ON public.outlook_events FOR SELECT
  TO authenticated
  USING (public.get_user_role() IN ('admin', 'medico', 'enfermera', 'secretaria'));

GRANT SELECT ON public.outlook_events TO authenticated;
GRANT ALL ON public.outlook_events TO service_role;

-- ============================================================================
-- 3. RELIABLE OUTBOX FOR VARIX -> OUTLOOK CHANGES
-- ============================================================================

CREATE TABLE public.outlook_sync_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  operation TEXT NOT NULL DEFAULT 'upsert' CHECK (operation IN ('upsert', 'delete')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT outlook_sync_outbox_appointment_unique UNIQUE (appointment_id)
);

CREATE INDEX idx_outlook_sync_outbox_pending
  ON public.outlook_sync_outbox(available_at, created_at)
  WHERE processed_at IS NULL;

CREATE TRIGGER tr_outlook_sync_outbox_updated_at
  BEFORE UPDATE ON public.outlook_sync_outbox
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.outlook_sync_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.outlook_sync_outbox FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.outlook_sync_outbox TO service_role;

-- Prevent cron and webhook deliveries from processing the same delta/outbox
-- concurrently. A failed function cannot leave a permanent lock because it
-- expires automatically.
CREATE OR REPLACE FUNCTION public.acquire_outlook_sync_lock(
  p_connection_id UUID,
  p_owner UUID,
  p_ttl_seconds INTEGER DEFAULT 600
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_ttl_seconds < 30 OR p_ttl_seconds > 900 THEN
    RAISE EXCEPTION 'TTL de bloqueo Outlook fuera de rango';
  END IF;

  UPDATE public.outlook_connections
  SET
    sync_lock_owner = p_owner,
    sync_lock_until = now() + make_interval(secs => p_ttl_seconds)
  WHERE id = p_connection_id
    AND (
      sync_lock_until IS NULL
      OR sync_lock_until < now()
      OR sync_lock_owner = p_owner
    );

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_outlook_sync_lock(
  p_connection_id UUID,
  p_owner UUID
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.outlook_connections
  SET sync_lock_owner = NULL, sync_lock_until = NULL
  WHERE id = p_connection_id AND sync_lock_owner = p_owner;
$$;

REVOKE EXECUTE ON FUNCTION public.acquire_outlook_sync_lock(UUID, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_outlook_sync_lock(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_outlook_sync_lock(UUID, UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_outlook_sync_lock(UUID, UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_outlook_appointment(
  p_appointment_id UUID,
  p_operation TEXT DEFAULT 'upsert'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_operation NOT IN ('upsert', 'delete') THEN
    RAISE EXCEPTION 'Operacion Outlook invalida';
  END IF;

  IF COALESCE(auth.role(), '') <> 'service_role'
     AND public.get_user_role() NOT IN ('admin', 'medico', 'enfermera', 'secretaria') THEN
    RAISE EXCEPTION 'No autorizado para sincronizar la cita';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.appointments WHERE id = p_appointment_id) THEN
    RAISE EXCEPTION 'La cita no existe';
  END IF;

  INSERT INTO public.outlook_sync_outbox AS existing (
    appointment_id,
    operation,
    attempts,
    available_at,
    processed_at,
    last_error
  ) VALUES (
    p_appointment_id,
    p_operation,
    0,
    now(),
    NULL,
    NULL
  )
  ON CONFLICT (appointment_id) DO UPDATE
  SET
    operation = EXCLUDED.operation,
    attempts = 0,
    available_at = now(),
    processed_at = NULL,
    last_error = NULL,
    updated_at = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enqueue_outlook_appointment(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enqueue_outlook_appointment(UUID, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.backfill_outlook_outbox(
  p_connection_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  queued_count INTEGER;
  cancelled_count INTEGER;
BEGIN
  INSERT INTO public.outlook_sync_outbox AS existing (
    appointment_id,
    operation,
    attempts,
    available_at,
    processed_at,
    last_error
  )
  SELECT
    appointment.id,
    'upsert',
    0,
    now(),
    NULL,
    NULL
  FROM public.appointments appointment
  WHERE appointment.fecha_hora_fin >= now()
    AND appointment.estado IN ('programada', 'confirmada', 'en_sala', 'en_atencion')
    AND COALESCE(appointment.notas, '') NOT LIKE 'Migrado de Outlook:%'
    AND NOT EXISTS (
      SELECT 1
      FROM public.outlook_events event
      WHERE event.connection_id = p_connection_id
        AND event.appointment_id = appointment.id
        AND event.deleted_at IS NULL
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.outlook_sync_outbox pending
      WHERE pending.appointment_id = appointment.id
        AND pending.processed_at IS NULL
    )
  ON CONFLICT (appointment_id) DO UPDATE
  SET
    operation = 'upsert',
    attempts = 0,
    available_at = now(),
    processed_at = NULL,
    last_error = NULL,
    updated_at = now()
  WHERE existing.processed_at IS NOT NULL;

  GET DIAGNOSTICS queued_count = ROW_COUNT;

  -- Recover cancellations even if the request that changed the appointment
  -- could not enqueue its outbox item at that moment.
  INSERT INTO public.outlook_sync_outbox AS existing (
    appointment_id,
    operation,
    attempts,
    available_at,
    processed_at,
    last_error
  )
  SELECT
    appointment.id,
    'delete',
    0,
    now(),
    NULL,
    NULL
  FROM public.appointments appointment
  INNER JOIN public.outlook_events event
    ON event.connection_id = p_connection_id
   AND event.appointment_id = appointment.id
   AND event.deleted_at IS NULL
   AND event.is_cancelled = false
  WHERE appointment.estado = 'cancelada'
    AND NOT EXISTS (
      SELECT 1
      FROM public.outlook_sync_outbox pending
      WHERE pending.appointment_id = appointment.id
        AND pending.processed_at IS NULL
    )
  ON CONFLICT (appointment_id) DO UPDATE
  SET
    operation = 'delete',
    attempts = 0,
    available_at = now(),
    processed_at = NULL,
    last_error = NULL,
    updated_at = now()
  WHERE existing.processed_at IS NOT NULL;

  GET DIAGNOSTICS cancelled_count = ROW_COUNT;
  RETURN queued_count + cancelled_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.backfill_outlook_outbox(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_outlook_outbox(UUID) TO service_role;

-- Existing future Varix-native appointments enter the reliable write-back
-- queue once. Appointments imported from Outlook are reconciled inbound first
-- and are deliberately excluded to avoid rewriting their original subjects.
INSERT INTO public.outlook_sync_outbox (appointment_id, operation)
SELECT id, 'upsert'
FROM public.appointments
WHERE fecha_hora_fin >= now()
  AND estado IN ('programada', 'confirmada', 'en_sala', 'en_atencion')
  AND COALESCE(notas, '') NOT LIKE 'Migrado de Outlook:%'
ON CONFLICT (appointment_id) DO NOTHING;

-- Source-specific lookup used by both Access and Outlook monitoring widgets.
CREATE INDEX IF NOT EXISTS idx_sync_runs_source_started
  ON public.sync_runs(source, started_at DESC);

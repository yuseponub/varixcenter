-- Migration: 067_outlook_desktop_bridge.sql
-- Purpose: Mirror a local Outlook/PST calendar through a reception-PC agent.

CREATE TABLE public.outlook_desktop_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL UNIQUE,
  calendar_name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  window_start TIMESTAMPTZ,
  window_end TIMESTAMPTZ,
  last_snapshot_at TIMESTAMPTZ,
  last_sync_ok BOOLEAN,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT outlook_desktop_connections_device_shape CHECK (
    device_id ~ '^[A-Za-z0-9._-]{1,64}$'
  ),
  CONSTRAINT outlook_desktop_connections_window CHECK (
    window_start IS NULL OR window_end IS NULL OR window_end > window_start
  )
);

COMMENT ON TABLE public.outlook_desktop_connections IS
  'Estado del agente Outlook clásico instalado en el computador de recepción.';

CREATE TRIGGER tr_outlook_desktop_connections_updated_at
  BEFORE UPDATE ON public.outlook_desktop_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.outlook_desktop_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.outlook_desktop_connections FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.outlook_desktop_connections TO service_role;

CREATE VIEW public.outlook_desktop_sync_status
WITH (security_invoker = false) AS
SELECT
  id,
  device_id,
  calendar_name,
  enabled,
  window_start,
  window_end,
  last_snapshot_at,
  last_sync_ok,
  last_error,
  updated_at
FROM public.outlook_desktop_connections
WHERE public.get_user_role() IN ('admin', 'medico', 'enfermera', 'secretaria');

GRANT SELECT ON public.outlook_desktop_sync_status TO authenticated;

CREATE TABLE public.outlook_desktop_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL
    REFERENCES public.outlook_desktop_connections(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  global_id TEXT,
  subject TEXT NOT NULL DEFAULT '(Sin asunto)',
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  is_all_day BOOLEAN NOT NULL DEFAULT false,
  show_as TEXT,
  location TEXT,
  categories TEXT[] NOT NULL DEFAULT '{}',
  source_last_modified_at TIMESTAMPTZ,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  match_status TEXT NOT NULL DEFAULT 'unmatched'
    CHECK (match_status IN ('unmatched', 'matched', 'conflict', 'ignored')),
  sync_error TEXT,
  deleted_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT outlook_desktop_events_external_unique UNIQUE (connection_id, external_id),
  CONSTRAINT outlook_desktop_events_valid_range CHECK (end_at > start_at)
);

COMMENT ON TABLE public.outlook_desktop_events IS
  'Espejo del calendario PST local; no guarda cuerpo, asistentes ni adjuntos.';

CREATE UNIQUE INDEX idx_outlook_desktop_events_appointment_unique
  ON public.outlook_desktop_events(appointment_id)
  WHERE appointment_id IS NOT NULL;
CREATE INDEX idx_outlook_desktop_events_range
  ON public.outlook_desktop_events(start_at, end_at)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_outlook_desktop_events_connection
  ON public.outlook_desktop_events(connection_id, external_id);

CREATE TRIGGER tr_outlook_desktop_events_updated_at
  BEFORE UPDATE ON public.outlook_desktop_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.outlook_desktop_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view desktop Outlook events"
  ON public.outlook_desktop_events FOR SELECT
  TO authenticated
  USING (public.get_user_role() IN ('admin', 'medico', 'enfermera', 'secretaria'));

GRANT SELECT ON public.outlook_desktop_events TO authenticated;
GRANT ALL ON public.outlook_desktop_events TO service_role;

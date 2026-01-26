-- Migration: 030_notifications.sql
-- Purpose: Notifications table for SMS appointment reminders via Twilio
-- Phase: 09-notifications, Plan: 01
-- Created: 2026-01-26

-- ============================================
-- 1. NOTIFICATION STATUS ENUM
-- ============================================

-- Notification status enum (check if not exists to avoid conflicts)
DO $$ BEGIN
  CREATE TYPE public.notification_status AS ENUM (
    'pendiente',     -- Scheduled, not yet sent
    'enviado',       -- Sent to Twilio successfully
    'fallido',       -- Failed after retries
    'reintentando'   -- Will retry in 30 min
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE public.notification_status IS 'Estado del envio de notificacion SMS';

-- ============================================
-- 2. REMINDER TYPE ENUM
-- ============================================

-- Reminder type enum (check if not exists to avoid conflicts)
DO $$ BEGIN
  CREATE TYPE public.reminder_type AS ENUM (
    '24h',
    '2h'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE public.reminder_type IS 'Tipo de recordatorio: 24 horas o 2 horas antes de la cita';

-- ============================================
-- 3. NOTIFICATIONS TABLE
-- ============================================

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,

  -- Notification details
  tipo_recordatorio public.reminder_type NOT NULL,
  telefono_destino VARCHAR(15) NOT NULL,  -- E.164 format (+573001234567)
  mensaje TEXT NOT NULL,

  -- Status tracking
  estado public.notification_status NOT NULL DEFAULT 'pendiente',
  twilio_message_sid VARCHAR(50),
  error_code INTEGER,
  error_message TEXT,
  intentos INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  enviado_at TIMESTAMPTZ,
  siguiente_reintento_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Unique constraint: one notification per appointment per type
  CONSTRAINT unique_notification_per_appointment_type
    UNIQUE (appointment_id, tipo_recordatorio)
);

-- Table comments
COMMENT ON TABLE public.notifications IS 'Historial de recordatorios SMS enviados a pacientes';
COMMENT ON COLUMN public.notifications.tipo_recordatorio IS '24h o 2h antes de la cita';
COMMENT ON COLUMN public.notifications.telefono_destino IS 'Numero de telefono en formato E.164 (+573001234567)';
COMMENT ON COLUMN public.notifications.estado IS 'pendiente, enviado, fallido, reintentando';
COMMENT ON COLUMN public.notifications.twilio_message_sid IS 'Twilio Message SID para tracking';
COMMENT ON COLUMN public.notifications.error_code IS 'Codigo de error de Twilio si fallo';
COMMENT ON COLUMN public.notifications.error_message IS 'Mensaje de error de Twilio si fallo';
COMMENT ON COLUMN public.notifications.intentos IS 'Numero de intentos de envio (max 2)';
COMMENT ON COLUMN public.notifications.enviado_at IS 'Timestamp cuando se envio exitosamente';
COMMENT ON COLUMN public.notifications.siguiente_reintento_at IS 'Timestamp para proximo reintento si estado=reintentando';

-- ============================================
-- 4. INDEXES
-- ============================================

-- Foreign key lookups
CREATE INDEX idx_notifications_appointment ON public.notifications(appointment_id);
CREATE INDEX idx_notifications_patient ON public.notifications(patient_id);

-- Status filtering
CREATE INDEX idx_notifications_estado ON public.notifications(estado);

-- Recent notifications query
CREATE INDEX idx_notifications_created_at ON public.notifications(created_at DESC);

-- Retry queue query (partial index for efficiency)
CREATE INDEX idx_notifications_retry ON public.notifications(siguiente_reintento_at)
  WHERE estado = 'reintentando';

-- ============================================
-- 5. ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- All staff can view notifications
CREATE POLICY "Staff can view notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'medico', 'enfermera', 'secretaria')
    )
  );

-- Service role has full access (for cron job)
CREATE POLICY "Service role full access"
  ON public.notifications FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================
-- 6. GRANT PERMISSIONS
-- ============================================

-- Staff can only read notifications (cron job uses service_role for writes)
GRANT SELECT ON public.notifications TO authenticated;

-- Service role needs full access for cron job operations
GRANT ALL ON public.notifications TO service_role;

-- ============================================
-- 7. VERIFICATION
-- ============================================

-- Verify RLS is enabled
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename = 'notifications'
    AND rowsecurity = true
  ) THEN
    RAISE EXCEPTION 'RLS not enabled on notifications table';
  END IF;
END;
$$;

-- Verify table exists with required columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'notifications'
    AND column_name = 'twilio_message_sid'
  ) THEN
    RAISE EXCEPTION 'notifications table missing twilio_message_sid column';
  END IF;
END;
$$;

-- Verify unique constraint exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'unique_notification_per_appointment_type'
    AND conrelid = 'public.notifications'::regclass
  ) THEN
    RAISE EXCEPTION 'Unique constraint unique_notification_per_appointment_type not found';
  END IF;
END;
$$;

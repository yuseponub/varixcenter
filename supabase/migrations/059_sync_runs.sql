-- Migration: 059_sync_runs.sql
-- Purpose: Registro de ejecuciones del agente de sincronizacion Access -> Supabase
--          que corre en el PC de la clinica. Permite ver en el dashboard
--          "ultima sincronizacion: hace X horas" y detectar cuando el agente
--          deja de correr.

CREATE TABLE public.sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL DEFAULT 'access',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  ok BOOLEAN,
  -- Estadisticas: {patients_new, patients_total, legacy_new, legacy_updated, skipped, errors}
  stats JSONB NOT NULL DEFAULT '{}',
  error TEXT,
  -- Hostname/version del agente para diagnostico
  agent_info TEXT
);

COMMENT ON TABLE public.sync_runs IS
  'Ejecuciones del agente de sincronizacion desde el Access de la clinica (one-way Access -> Supabase). Insertado via service role por el agente.';

CREATE INDEX idx_sync_runs_started ON public.sync_runs(started_at DESC);

-- RLS: el staff puede consultar el estado; solo el service role (agente) escribe
ALTER TABLE public.sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view sync runs"
  ON public.sync_runs FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT ON public.sync_runs TO authenticated;

-- ============================================================================
-- Vista de estado para el agente: le permite detectar con una sola consulta
-- que pacientes ya existen y cuantas sesiones legacy tiene cada uno
-- (si Access tiene mas sesiones que Supabase, hay que actualizar ese registro).
-- ============================================================================

CREATE VIEW public.legacy_sync_state
WITH (security_invoker = true) AS
SELECT
  plr.access_cedula,
  plr.patient_id,
  plr.id AS legacy_record_id,
  jsonb_array_length(plr.raw_plan_cirugia) AS cirugia_count,
  jsonb_array_length(plr.raw_plan_costos) AS costos_count
FROM public.patient_legacy_records plr;

COMMENT ON VIEW public.legacy_sync_state IS
  'Estado resumido de registros legacy para el agente de sincronizacion Access -> Supabase';

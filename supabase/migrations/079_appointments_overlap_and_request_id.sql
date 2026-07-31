-- Migration: 079_appointments_overlap_and_request_id.sql
-- Purpose: permitir citas simultaneas (apiladas) y hacer idempotente la creacion
--          de citas para que un doble clic/Enter no agende dos veces.
--
-- Contexto operativo (jul-2026):
--
-- 1. La restriccion `no_overlapping_appointments` (007) impedia crear una cita
--    cuando el mismo doctor ya tenia otra en ese rango. La clinica si atiende
--    varios pacientes en la misma franja: la agenda de filas ya los apila uno
--    debajo de otro. Ademas la restriccion bloqueaba *revertir* una cancelacion:
--    al pasar de 'cancelada' a 'confirmada' la fila vuelve a entrar al indice y
--    chocaba con la cita que ocupo ese horario, con un error generico.
--    El aviso de "ya hay N pacientes a esa hora" pasa a ser informativo y se
--    calcula en la aplicacion; no vuelve a bloquear el agendamiento.
--
-- 2. `request_id` identifica el intento de agendado que envio el navegador.
--    El indice unico parcial convierte el insert en idempotente: si la misma
--    peticion llega dos veces (doble Enter, reintento, pestana que se cierra
--    con `keepalive`), la segunda choca con 23505 y la aplicacion devuelve la
--    cita que ya existe en vez de crear un duplicado.

-- ============================================
-- 1. PERMITIR CITAS SIMULTANEAS
-- ============================================

ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS no_overlapping_appointments;

-- ============================================
-- 2. IDEMPOTENCIA DE CREACION
-- ============================================

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS request_id UUID;

COMMENT ON COLUMN public.appointments.request_id IS
  'Identificador del intento de agendado enviado por el cliente. Unico cuando no es NULL: evita citas duplicadas por doble envio.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_appointments_request_id
  ON public.appointments (request_id)
  WHERE request_id IS NOT NULL;

-- ============================================
-- 3. VERIFICACION
-- ============================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.appointments'::regclass
      AND conname = 'no_overlapping_appointments'
  ) THEN
    RAISE EXCEPTION 'La restriccion no_overlapping_appointments sigue activa';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'appointments'
      AND indexname = 'uq_appointments_request_id'
  ) THEN
    RAISE EXCEPTION 'Falta el indice uq_appointments_request_id';
  END IF;

  RAISE NOTICE 'Migration 079: citas simultaneas permitidas y creacion idempotente';
END $$;

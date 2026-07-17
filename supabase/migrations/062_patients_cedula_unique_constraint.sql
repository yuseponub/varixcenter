-- Migration: 062_patients_cedula_unique_constraint.sql
-- Purpose: El agente de sincronizacion Access usa upsert ON CONFLICT (cedula),
--          pero la unicidad de cedula existia solo como INDICE PARCIAL
--          (WHERE cedula IS NOT NULL), que PostgREST no puede usar como
--          arbitro de conflicto -> la primera corrida en la clinica fallo
--          con "no unique constraint matching ON CONFLICT".
--          Se crea la restriccion unica real (los NULL multiples siguen
--          permitidos: en Postgres los NULL no chocan entre si) y se
--          eliminan los indices redundantes.
-- Verificado antes de aplicar: 0 cedulas duplicadas en produccion.

ALTER TABLE public.patients
  ADD CONSTRAINT patients_cedula_key UNIQUE (cedula);

-- Redundantes: el indice de la restriccion cubre ambos casos
DROP INDEX IF EXISTS public.idx_patients_cedula_unique;
DROP INDEX IF EXISTS public.idx_patients_cedula;

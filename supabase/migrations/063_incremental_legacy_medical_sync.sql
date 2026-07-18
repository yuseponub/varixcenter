-- Migration: 063_incremental_legacy_medical_sync.sql
-- Purpose: Keep Access-backed medical_records synchronized incrementally
--          without overwriting records edited by staff in the platform.
--
-- Safety invariants:
-- - Only medical_records linked by legacy_record_id and source=legacy_access.
-- - Records with updated_by are treated as manually edited and never changed.
-- - Records changed after their last automated sync are also protected.
-- - Inserts/updates only. Nothing is ever deleted.

BEGIN;

-- Source-side change tracking. Existing rows intentionally receive the
-- migration timestamp so the first run refreshes every eligible legacy mirror.
ALTER TABLE public.patient_legacy_records
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX idx_patient_legacy_records_updated_at
  ON public.patient_legacy_records(updated_at);

CREATE TRIGGER tr_patient_legacy_records_updated_at
  BEFORE UPDATE ON public.patient_legacy_records
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

COMMENT ON COLUMN public.patient_legacy_records.updated_at IS
  'Ultima modificacion del espejo Access; avanza cuando el agente incorpora sesiones nuevas.';

-- Target-side watermark. legacy_source_updated_at identifies the exact source
-- version already converted; legacy_synced_at distinguishes later edits.
ALTER TABLE public.medical_records
  ADD COLUMN legacy_source_updated_at TIMESTAMPTZ,
  ADD COLUMN legacy_synced_at TIMESTAMPTZ;

CREATE INDEX idx_medical_records_legacy_source_updated_at
  ON public.medical_records(legacy_source_updated_at)
  WHERE source = 'legacy_access';

COMMENT ON COLUMN public.medical_records.legacy_source_updated_at IS
  'patient_legacy_records.updated_at de la ultima version convertida.';
COMMENT ON COLUMN public.medical_records.legacy_synced_at IS
  'Momento de la ultima conversion automatica Access -> historia visible.';

-- Atomic batch operation used by the hourly agent and by the standalone
-- resync command. Mapping remains in the agent; this function enforces the
-- ownership and concurrency rules at the database boundary.
CREATE OR REPLACE FUNCTION public.sync_legacy_medical_records(p_records JSONB)
RETURNS TABLE (
  legacy_id UUID,
  medical_id UUID,
  sync_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item JSONB;
  v_legacy_id UUID;
  v_payload_source_updated_at TIMESTAMPTZ;
  v_source public.patient_legacy_records%ROWTYPE;
  v_existing public.medical_records%ROWTYPE;
  v_inserted_id UUID;
BEGIN
  IF jsonb_typeof(p_records) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'p_records debe ser un arreglo JSON';
  END IF;

  IF jsonb_array_length(p_records) > 200 THEN
    RAISE EXCEPTION 'Maximo 200 historias por lote';
  END IF;

  FOR v_item IN
    SELECT value
    FROM jsonb_array_elements(p_records)
  LOOP
    legacy_id := NULL;
    medical_id := NULL;
    sync_status := NULL;
    v_legacy_id := NULLIF(v_item->>'legacy_record_id', '')::UUID;
    v_payload_source_updated_at :=
      NULLIF(v_item->>'legacy_source_updated_at', '')::TIMESTAMPTZ;

    IF v_legacy_id IS NULL OR v_payload_source_updated_at IS NULL THEN
      RAISE EXCEPTION
        'Cada historia requiere legacy_record_id y legacy_source_updated_at';
    END IF;

    SELECT *
      INTO v_source
      FROM public.patient_legacy_records
      WHERE id = v_legacy_id
      FOR SHARE;

    IF NOT FOUND THEN
      legacy_id := v_legacy_id;
      medical_id := NULL;
      sync_status := 'source_missing';
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- Never convert a stale payload. A following run will read and map the
    -- newer source version.
    -- PostgREST preserves microseconds, while some PostgreSQL clients round
    -- timestamps to milliseconds. Treat those representations as the same
    -- source version without accepting an actually older payload.
    IF date_trunc('milliseconds', v_source.updated_at)
       IS DISTINCT FROM date_trunc('milliseconds', v_payload_source_updated_at) THEN
      legacy_id := v_legacy_id;
      medical_id := NULL;
      sync_status := 'stale_source';
      RETURN NEXT;
      CONTINUE;
    END IF;

    SELECT *
      INTO v_existing
      FROM public.medical_records
      WHERE legacy_record_id = v_legacy_id
      FOR UPDATE;

    IF NOT FOUND THEN
      v_inserted_id := NULL;

      INSERT INTO public.medical_records (
        patient_id,
        appointment_id,
        doctor_id,
        sintomas,
        signos,
        inicio_relacionado,
        antecedentes,
        laboratorio_vascular,
        diagnostico,
        ceap_pierna_izquierda,
        ceap_pierna_derecha,
        tratamiento_ids,
        estado,
        source,
        legacy_record_id,
        nombre_medico_legacy,
        medicamentos,
        created_by,
        updated_by,
        created_at,
        legacy_source_updated_at,
        legacy_synced_at
      )
      VALUES (
        v_source.patient_id,
        NULL,
        NULLIF(v_item->>'doctor_id', '')::UUID,
        COALESCE(v_item->'sintomas', '{}'::JSONB),
        COALESCE(v_item->'signos', '{}'::JSONB),
        COALESCE(v_item->'inicio_relacionado', '{}'::JSONB),
        COALESCE(v_item->'antecedentes', '{}'::JSONB),
        COALESCE(v_item->'laboratorio_vascular', '{}'::JSONB),
        NULLIF(v_item->>'diagnostico', ''),
        NULLIF(v_item->>'ceap_pierna_izquierda', '')::public.ceap_classification,
        NULL,
        '{}'::UUID[],
        'completado',
        'legacy_access',
        v_legacy_id,
        NULLIF(v_item->>'nombre_medico_legacy', ''),
        NULLIF(v_item->>'medicamentos', ''),
        NULL,
        NULL,
        COALESCE(
          NULLIF(v_item->>'created_at', '')::TIMESTAMPTZ,
          v_source.fecha_ingreso_original,
          now()
        ),
        v_source.updated_at,
        transaction_timestamp()
      )
      ON CONFLICT (legacy_record_id)
        WHERE legacy_record_id IS NOT NULL
      DO NOTHING
      RETURNING id INTO v_inserted_id;

      IF v_inserted_id IS NOT NULL THEN
        legacy_id := v_legacy_id;
        medical_id := v_inserted_id;
        sync_status := 'inserted';
        RETURN NEXT;
        CONTINUE;
      END IF;

      -- A concurrent runner inserted the mirror. Lock it and continue through
      -- the same protection/idempotency checks as an existing record.
      SELECT *
        INTO v_existing
        FROM public.medical_records
        WHERE legacy_record_id = v_legacy_id
        FOR UPDATE;
    END IF;

    IF v_existing.source <> 'legacy_access' THEN
      legacy_id := v_legacy_id;
      medical_id := v_existing.id;
      sync_status := 'protected_source';
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- Platform edits always set updated_by. The timestamp check additionally
    -- protects out-of-band edits made after an automated conversion.
    IF v_existing.updated_by IS NOT NULL
       OR (
         v_existing.legacy_synced_at IS NOT NULL
         AND v_existing.updated_at > v_existing.legacy_synced_at
       ) THEN
      legacy_id := v_legacy_id;
      medical_id := v_existing.id;
      sync_status := 'protected_manual';
      RETURN NEXT;
      CONTINUE;
    END IF;

    IF v_existing.legacy_source_updated_at IS NOT NULL
       AND v_existing.legacy_source_updated_at >= v_source.updated_at THEN
      legacy_id := v_legacy_id;
      medical_id := v_existing.id;
      sync_status := 'unchanged';
      RETURN NEXT;
      CONTINUE;
    END IF;

    UPDATE public.medical_records
    SET
      patient_id = v_source.patient_id,
      doctor_id = NULLIF(v_item->>'doctor_id', '')::UUID,
      sintomas = COALESCE(v_item->'sintomas', '{}'::JSONB),
      signos = COALESCE(v_item->'signos', '{}'::JSONB),
      inicio_relacionado = COALESCE(v_item->'inicio_relacionado', '{}'::JSONB),
      antecedentes = COALESCE(v_item->'antecedentes', '{}'::JSONB),
      laboratorio_vascular =
        COALESCE(v_item->'laboratorio_vascular', '{}'::JSONB),
      diagnostico = NULLIF(v_item->>'diagnostico', ''),
      ceap_pierna_izquierda =
        NULLIF(v_item->>'ceap_pierna_izquierda', '')::public.ceap_classification,
      nombre_medico_legacy = NULLIF(v_item->>'nombre_medico_legacy', ''),
      medicamentos = NULLIF(v_item->>'medicamentos', ''),
      legacy_source_updated_at = v_source.updated_at,
      legacy_synced_at = transaction_timestamp()
    WHERE id = v_existing.id
      AND source = 'legacy_access'
      AND updated_by IS NULL
      -- Optimistic concurrency guard: a simultaneous platform edit wins.
      AND updated_at = v_existing.updated_at
    RETURNING id INTO medical_id;

    legacy_id := v_legacy_id;
    IF medical_id IS NULL THEN
      medical_id := v_existing.id;
      sync_status := 'protected_race';
    ELSE
      sync_status := 'updated';
    END IF;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_legacy_medical_records(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_legacy_medical_records(JSONB)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_legacy_medical_records(JSONB)
  TO service_role;

COMMENT ON FUNCTION public.sync_legacy_medical_records(JSONB) IS
  'Incremental, idempotent Access -> medical_records mirror. Inserts or updates only source=legacy_access records that have never been edited by staff.';

COMMIT;

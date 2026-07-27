-- Capture the patient's current Varix address when an invoice job is created.
-- The robot consumes this immutable job snapshot; later patient edits must not
-- silently change an already authorized invoice.

BEGIN;

CREATE OR REPLACE FUNCTION public.completar_direccion_trabajo_wimax()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_direccion TEXT;
  v_ciudad TEXT;
  v_pais TEXT;
BEGIN
  SELECT
    NULLIF(btrim(pa.direccion), ''),
    NULLIF(btrim(pa.ciudad), ''),
    COALESCE(NULLIF(btrim(pa.pais), ''), 'Colombia')
  INTO v_direccion, v_ciudad, v_pais
  FROM public.payments p
  JOIN public.patients pa ON pa.id = p.patient_id
  WHERE p.id = NEW.payment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe el paciente del trabajo WiMAX';
  END IF;

  NEW.paciente := COALESCE(NEW.paciente, '{}'::JSONB) || jsonb_build_object(
    'direccion', v_direccion,
    'ciudad', v_ciudad,
    'pais', v_pais,
    'direccion_fuente', CASE
      WHEN v_direccion IS NULL THEN 'sin_direccion'
      ELSE 'ficha_varix'
    END
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.completar_direccion_trabajo_wimax() FROM PUBLIC;

DROP TRIGGER IF EXISTS completar_direccion_trabajo_wimax
  ON public.wimax_invoice_jobs;
CREATE TRIGGER completar_direccion_trabajo_wimax
  BEFORE INSERT OR UPDATE OF payment_id, paciente
  ON public.wimax_invoice_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.completar_direccion_trabajo_wimax();

COMMENT ON FUNCTION public.completar_direccion_trabajo_wimax() IS
  'Adds direccion, ciudad, pais and source from the Varix patient record to the WiMAX job snapshot.';

COMMIT;

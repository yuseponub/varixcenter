-- Migration: Make cedula and celular optional for patient creation during transition
-- This allows creating patients from calendar appointments that only have names

-- 1. Make cedula optional (DROP NOT NULL)
ALTER TABLE public.patients ALTER COLUMN cedula DROP NOT NULL;

-- 2. Make celular optional (it might already be, but ensure it)
ALTER TABLE public.patients ALTER COLUMN celular DROP NOT NULL;

-- 3. Update the trigger to only prevent changes if cedula already exists
-- (Allow setting cedula for the first time, but prevent modifications after)
CREATE OR REPLACE FUNCTION public.prevent_cedula_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Only prevent update if OLD cedula was NOT NULL and is being changed
  IF OLD.cedula IS NOT NULL AND OLD.cedula IS DISTINCT FROM NEW.cedula THEN
    RAISE EXCEPTION 'La cedula no puede ser modificada una vez asignada';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Update unique constraint to allow multiple NULLs
-- Drop old unique constraint and create partial unique index
ALTER TABLE public.patients DROP CONSTRAINT IF EXISTS patients_cedula_key;

-- Create partial unique index (only for non-null cedulas)
DROP INDEX IF EXISTS idx_patients_cedula_unique;
CREATE UNIQUE INDEX idx_patients_cedula_unique ON public.patients(cedula) WHERE cedula IS NOT NULL;

-- 5. Update comments
COMMENT ON COLUMN public.patients.cedula IS 'Cedula colombiana (6-10 digitos). Opcional en creacion, INMUTABLE despues de asignacion.';
COMMENT ON COLUMN public.patients.celular IS 'Numero de celular del paciente. Opcional.';

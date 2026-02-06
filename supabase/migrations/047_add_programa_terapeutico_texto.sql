-- Add programa_terapeutico_texto field to medical_records
-- This allows doctors to write free-form text for the therapeutic program

ALTER TABLE medical_records
ADD COLUMN IF NOT EXISTS programa_terapeutico_texto TEXT;

-- Add comment for documentation
COMMENT ON COLUMN medical_records.programa_terapeutico_texto IS 'Free text field for therapeutic program notes, editable by medico/admin';

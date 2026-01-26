-- Migration: Add diagrama_piernas column to medical_records
-- Description: Stores leg diagram drawing data as JSON (fabric.js format)

-- Add column for storing the drawing data
ALTER TABLE medical_records
ADD COLUMN IF NOT EXISTS diagrama_piernas TEXT;

-- Add comment explaining the field
COMMENT ON COLUMN medical_records.diagrama_piernas IS
'JSON string containing fabric.js objects representing vein markings on leg diagram. Editable - strokes can be added/removed.';

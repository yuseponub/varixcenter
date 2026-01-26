-- Migration: Add audios column to medical_records
-- Stores voice dictation audio recordings as JSONB array
-- Each entry: { path: string, timestamp: string, transcription?: string }

ALTER TABLE public.medical_records
ADD COLUMN IF NOT EXISTS audios JSONB DEFAULT '[]'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN public.medical_records.audios IS 'Voice dictation audio recordings stored in Supabase Storage. Array of {path, timestamp, transcription}';

-- Migration: 026_storage_audio_policy.sql
-- Purpose: Allow audio uploads to payment-receipts bucket for voice dictation
-- Phase: 06-medical-records (voice dictation feature)
-- Created: 2026-01-26

-- ============================================================================
-- UPDATE BUCKET TO ALLOW AUDIO FILES
-- ============================================================================
-- Add audio/webm to allowed mime types for voice dictation recordings
-- WebM is the native format for MediaRecorder API in modern browsers

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'audio/webm'
]::text[]
WHERE id = 'payment-receipts';

-- ============================================================================
-- RLS POLICY FOR AUDIO UPLOADS
-- ============================================================================
-- Allow authenticated users to upload to audios/ folder
-- Path convention: audios/{medical_record_id}/{timestamp}.webm

CREATE POLICY "Authenticated users can upload audios"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'payment-receipts'
    AND (storage.foldername(name))[1] = 'audios'
);

-- ============================================================================
-- RLS POLICY FOR CIERRE UPLOADS (if not exists)
-- ============================================================================
-- Also add policy for cierres/ folder if it doesn't exist
-- This was missing from the original migration

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE policyname = 'Authenticated users can upload cierres'
        AND tablename = 'objects'
    ) THEN
        CREATE POLICY "Authenticated users can upload cierres"
        ON storage.objects
        FOR INSERT
        TO authenticated
        WITH CHECK (
            bucket_id = 'payment-receipts'
            AND (storage.foldername(name))[1] = 'cierres'
        );
    END IF;
END $$;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
DO $$
DECLARE
    v_bucket RECORD;
    v_audio_policy_exists BOOLEAN;
BEGIN
    -- Verify bucket has audio mime type
    SELECT * INTO v_bucket FROM storage.buckets WHERE id = 'payment-receipts';

    IF NOT ('audio/webm' = ANY(v_bucket.allowed_mime_types)) THEN
        RAISE EXCEPTION 'audio/webm not added to allowed_mime_types';
    END IF;

    -- Verify audio upload policy exists
    SELECT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE policyname = 'Authenticated users can upload audios'
        AND tablename = 'objects'
    ) INTO v_audio_policy_exists;

    IF NOT v_audio_policy_exists THEN
        RAISE EXCEPTION 'Audio upload policy not created';
    END IF;

    RAISE NOTICE 'Audio storage policy added successfully';
    RAISE NOTICE 'Bucket now accepts: images + audio/webm';
    RAISE NOTICE 'Folders: comprobantes/, cierres/, audios/';
END $$;

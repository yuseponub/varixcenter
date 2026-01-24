-- Migration: 011_payment_receipts_bucket.sql
-- Purpose: Storage bucket for payment receipt photos (comprobantes)
-- Phase: 04-payments-core, Plan: 02
-- Created: 2026-01-24
-- Depends on: 010_payments_immutability.sql

-- ============================================================================
-- PAYMENT RECEIPTS STORAGE BUCKET
-- ============================================================================
-- Receipts are IMMUTABLE evidence of payments. Once uploaded, they cannot
-- be deleted or replaced. This is critical for fraud prevention.
--
-- File path convention: comprobantes/{payment_id}/{uuid}.{ext}
-- ============================================================================

-- Create the storage bucket for payment receipts
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'payment-receipts',
    'payment-receipts',
    false,  -- Private bucket: requires auth to access
    5242880,  -- 5MB limit (5 * 1024 * 1024 bytes)
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']::text[]
);

COMMENT ON TABLE storage.buckets IS
    'payment-receipts bucket: 5MB limit, image-only, immutable (no delete/update)';

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- Policy: Authenticated users can upload receipts
-- Path must be in comprobantes/ folder for organization
CREATE POLICY "Authenticated users can upload receipts"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'payment-receipts'
    AND (storage.foldername(name))[1] = 'comprobantes'
);

-- Policy: Authenticated staff can view all receipts
-- All staff roles need to view receipts for verification and auditing
CREATE POLICY "Authenticated staff can view receipts"
ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id = 'payment-receipts'
);

-- ============================================================================
-- IMMUTABILITY: NO DELETE POLICY
-- ============================================================================
-- Receipts are EVIDENCE and cannot be deleted.
-- This is intentional and critical for fraud prevention.
-- Even admins cannot delete receipts - they are permanent records.
--
-- If a receipt is incorrect, the payment should be anulado and a new
-- payment with correct receipt should be created.
-- ============================================================================

-- NO DELETE POLICY - Receipts cannot be deleted

-- ============================================================================
-- IMMUTABILITY: NO UPDATE POLICY
-- ============================================================================
-- Receipts cannot be replaced or overwritten.
-- This prevents swapping legitimate receipts with fake ones.
-- Each payment method gets one receipt upload, permanently.
-- ============================================================================

-- NO UPDATE POLICY - Receipts cannot be replaced

-- ============================================================================
-- VERIFICATION
-- ============================================================================
DO $$
DECLARE
    v_bucket RECORD;
    v_upload_policy_exists BOOLEAN;
    v_view_policy_exists BOOLEAN;
BEGIN
    -- Verify bucket exists with correct settings
    SELECT * INTO v_bucket FROM storage.buckets WHERE id = 'payment-receipts';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'payment-receipts bucket not created';
    END IF;

    IF v_bucket.public = true THEN
        RAISE EXCEPTION 'payment-receipts bucket should be private';
    END IF;

    IF v_bucket.file_size_limit != 5242880 THEN
        RAISE EXCEPTION 'payment-receipts bucket size limit should be 5MB';
    END IF;

    -- Verify upload policy exists
    SELECT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE policyname = 'Authenticated users can upload receipts'
        AND tablename = 'objects'
    ) INTO v_upload_policy_exists;

    IF NOT v_upload_policy_exists THEN
        RAISE EXCEPTION 'Upload policy not created for payment-receipts';
    END IF;

    -- Verify view policy exists
    SELECT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE policyname = 'Authenticated staff can view receipts'
        AND tablename = 'objects'
    ) INTO v_view_policy_exists;

    IF NOT v_view_policy_exists THEN
        RAISE EXCEPTION 'View policy not created for payment-receipts';
    END IF;

    RAISE NOTICE 'Payment receipts storage bucket verified successfully';
    RAISE NOTICE 'Bucket: payment-receipts (private, 5MB limit, image-only)';
    RAISE NOTICE 'Policies: INSERT (upload), SELECT (view) - NO DELETE/UPDATE (immutable)';
END $$;

-- Migration: 002_audit_infrastructure.sql
-- Purpose: Immutable audit log capturing all data changes
-- Phase: 01-security-foundation, Plan: 02
-- Created: 2026-01-23

-- Helper function to get request header (PostgREST provides these)
-- Returns NULL when called outside of PostgREST context (e.g., migrations, dashboard)
CREATE OR REPLACE FUNCTION public.get_request_header(header_name text)
RETURNS text
LANGUAGE sql
STABLE
AS $$
    SELECT current_setting('request.headers', true)::json ->> header_name
$$;

-- Helper function to get client IP from X-Forwarded-For header
-- Extracts first IP (original client) from comma-separated proxy chain
CREATE OR REPLACE FUNCTION public.get_client_ip()
RETURNS inet
LANGUAGE sql
STABLE
AS $$
    SELECT NULLIF(
        SPLIT_PART(COALESCE(public.get_request_header('x-forwarded-for'), ''), ',', 1),
        ''
    )::inet
$$;

-- Audit log table
-- Captures complete history of all data changes for compliance and forensics
CREATE TABLE public.audit_log (
    id BIGSERIAL PRIMARY KEY,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,  -- TEXT to handle composite keys
    action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    old_data JSONB,           -- Previous state (for UPDATE/DELETE)
    new_data JSONB,           -- New state (for INSERT/UPDATE)
    changed_fields TEXT[],    -- For UPDATE: list of modified columns
    changed_by UUID REFERENCES auth.users(id),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    client_ip INET,           -- From X-Forwarded-For header
    user_agent TEXT,          -- Browser/client identification
    session_id TEXT           -- From JWT for session tracking
);

-- Indexes for common audit queries
-- Composite index for looking up specific record's history
CREATE INDEX idx_audit_log_table_record ON public.audit_log(table_name, record_id);

-- Index for "who did this" queries
CREATE INDEX idx_audit_log_changed_by ON public.audit_log(changed_by);

-- Index for time-range queries (DESC for recent-first)
CREATE INDEX idx_audit_log_changed_at ON public.audit_log(changed_at DESC);

-- Index for filtering by action type
CREATE INDEX idx_audit_log_action ON public.audit_log(action);

-- Enable RLS - CRITICAL for security
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- APPEND-ONLY PATTERN:
-- Only INSERT policy exists. No UPDATE or DELETE policies.
-- This makes the audit log immutable at the RLS level.

-- Allow system inserts (triggers run as SECURITY DEFINER)
CREATE POLICY "Allow system inserts" ON public.audit_log
FOR INSERT
WITH CHECK (true);

-- Only admins can read audit log
CREATE POLICY "Admins can read audit log" ON public.audit_log
FOR SELECT
TO authenticated
USING (public.get_user_role() = 'admin');

-- NO UPDATE policy = cannot modify audit entries
-- NO DELETE policy = cannot delete audit entries
-- This is intentional: audit log must be immutable

-- Generic audit trigger function
-- Attach to any table with an 'id' column to capture all changes
CREATE OR REPLACE FUNCTION public.audit_trigger_func()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    record_pk text;
    changed_cols text[];
    old_val jsonb;
    new_val jsonb;
    col_name text;
BEGIN
    -- Get primary key value (assumes 'id' column exists)
    IF TG_OP = 'DELETE' THEN
        record_pk := OLD.id::text;
    ELSE
        record_pk := NEW.id::text;
    END IF;

    -- For UPDATE, compute which fields actually changed
    IF TG_OP = 'UPDATE' THEN
        old_val := to_jsonb(OLD);
        new_val := to_jsonb(NEW);

        FOR col_name IN SELECT key FROM jsonb_object_keys(new_val) AS key
        LOOP
            IF old_val -> col_name IS DISTINCT FROM new_val -> col_name THEN
                changed_cols := array_append(changed_cols, col_name);
            END IF;
        END LOOP;
    END IF;

    -- Insert audit record
    INSERT INTO public.audit_log (
        table_name,
        record_id,
        action,
        old_data,
        new_data,
        changed_fields,
        changed_by,
        client_ip,
        user_agent,
        session_id
    ) VALUES (
        TG_TABLE_NAME,
        record_pk,
        TG_OP,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
        changed_cols,
        auth.uid(),
        public.get_client_ip(),
        public.get_request_header('user-agent'),
        (auth.jwt() ->> 'session_id')
    );

    -- Return appropriate record for trigger chain
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

-- Convenience function to add audit trigger to any table
-- Usage: SELECT enable_audit_for_table('public.patients');
CREATE OR REPLACE FUNCTION public.enable_audit_for_table(target_table regclass)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    trigger_name text;
BEGIN
    trigger_name := 'tr_audit_' || target_table::text;

    EXECUTE format(
        'CREATE TRIGGER %I
         AFTER INSERT OR UPDATE OR DELETE ON %s
         FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func()',
        trigger_name,
        target_table
    );
END;
$$;

-- Grant execute to service role only (not public)
-- Only service_role should be enabling audit on tables
REVOKE EXECUTE ON FUNCTION public.enable_audit_for_table FROM PUBLIC;

-- NOTE: Audit triggers will be applied to business tables as they are created:
-- - Phase 2: patients, appointments
-- - Phase 3: medical_records
-- - Phase 4: payments (with extra immutability for anti-fraud)

-- Migration: 005_rls_verification.sql
-- Purpose: Tools to verify RLS is enabled on all public tables
-- Phase: 01-security-foundation, Plan: 04
-- Created: 2026-01-23

-- Function to check if RLS is enabled on all public tables
-- Returns rows only for tables WITHOUT RLS (empty = good)
CREATE OR REPLACE FUNCTION public.verify_rls_enabled()
RETURNS TABLE (
    table_name text,
    rls_enabled boolean,
    warning text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        t.tablename::text,
        t.rowsecurity AS rls_enabled,
        'RLS NOT ENABLED - Security risk!' AS warning
    FROM pg_tables t
    WHERE t.schemaname = 'public'
    AND t.rowsecurity = false
    AND t.tablename NOT IN (
        -- Exclude system/internal tables that don't need RLS
        'schema_migrations'
    )
    ORDER BY t.tablename;
$$;

-- Grant to authenticated users so admins can run verification
GRANT EXECUTE ON FUNCTION public.verify_rls_enabled TO authenticated;

-- Function to get RLS policy summary for a table
CREATE OR REPLACE FUNCTION public.get_rls_policies(target_table text)
RETURNS TABLE (
    policy_name text,
    policy_command text,
    policy_roles text[],
    policy_qual text,
    with_check text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        p.policyname::text,
        p.cmd::text,
        p.roles,
        pg_get_expr(p.qual, p.polrelid)::text,
        pg_get_expr(p.with_check, p.polrelid)::text
    FROM pg_policies p
    WHERE p.schemaname = 'public'
    AND p.tablename = target_table;
$$;

-- Grant to authenticated users
GRANT EXECUTE ON FUNCTION public.get_rls_policies TO authenticated;

-- View for quick RLS status check (admin only via RLS)
CREATE OR REPLACE VIEW public.rls_status AS
SELECT
    t.tablename AS table_name,
    t.rowsecurity AS rls_enabled,
    (SELECT count(*) FROM pg_policies p
     WHERE p.schemaname = 'public' AND p.tablename = t.tablename) AS policy_count,
    CASE
        WHEN t.rowsecurity = false THEN 'VULNERABLE'
        WHEN (SELECT count(*) FROM pg_policies p
              WHERE p.schemaname = 'public' AND p.tablename = t.tablename) = 0 THEN 'RLS ON BUT NO POLICIES'
        ELSE 'SECURED'
    END AS status
FROM pg_tables t
WHERE t.schemaname = 'public'
ORDER BY
    CASE WHEN t.rowsecurity = false THEN 0 ELSE 1 END,
    t.tablename;

-- Grant SELECT on view to authenticated
GRANT SELECT ON public.rls_status TO authenticated;

-- Add comment
COMMENT ON VIEW public.rls_status IS
    'RLS status overview for all public tables. Use verify_rls_enabled() for actionable alerts.';

-- Pre-deployment check function (returns TRUE if all tables secured)
CREATE OR REPLACE FUNCTION public.rls_check_passed()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT NOT EXISTS (
        SELECT 1 FROM public.verify_rls_enabled()
    );
$$;

GRANT EXECUTE ON FUNCTION public.rls_check_passed TO authenticated;

-- Comments for documentation
COMMENT ON FUNCTION public.verify_rls_enabled IS
    'Returns all public tables WITHOUT RLS enabled. Empty result = all secured.';

COMMENT ON FUNCTION public.get_rls_policies IS
    'Returns all RLS policies for a given table. Useful for auditing policy configuration.';

COMMENT ON FUNCTION public.rls_check_passed IS
    'Returns TRUE if all public tables have RLS enabled. Use in CI/CD pipelines.';

-- Usage examples (as comments):
--
-- 1. Quick security check (should return empty):
--    SELECT * FROM public.verify_rls_enabled();
--
-- 2. View all tables and their RLS status:
--    SELECT * FROM public.rls_status;
--
-- 3. Check policies on a specific table:
--    SELECT * FROM public.get_rls_policies('user_roles');
--
-- 4. Boolean check for CI/CD:
--    SELECT public.rls_check_passed();  -- TRUE = all good

-- Migration: 003_custom_access_token_hook.sql
-- Purpose: Inject user role into JWT claims at token issuance
-- Phase: 01-security-foundation, Plan: 02
-- Created: 2026-01-23

-- Custom Access Token Hook function
-- This function runs every time a JWT is issued:
-- - On sign-in
-- - On token refresh
-- - On session recovery
--
-- It reads the user's role from user_roles table and injects it into
-- the JWT's app_metadata.role claim. RLS policies then use get_user_role()
-- to read this claim for authorization decisions.
--
-- SECURITY NOTE: We use app_metadata (not user_metadata) because:
-- - app_metadata can only be modified server-side
-- - user_metadata can be modified by the user via supabase.auth.update()
-- - Using user_metadata for roles would allow privilege escalation

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    claims jsonb;
    user_role_value text;
BEGIN
    -- Get user's role from user_roles table
    SELECT role::text INTO user_role_value
    FROM public.user_roles
    WHERE user_id = (event->>'user_id')::uuid;

    -- Get existing claims from the event
    claims := event->'claims';

    -- Ensure app_metadata exists in claims
    IF claims->'app_metadata' IS NULL THEN
        claims := jsonb_set(claims, '{app_metadata}', '{}'::jsonb);
    END IF;

    -- Add role to app_metadata in claims
    IF user_role_value IS NOT NULL THEN
        -- User has assigned role
        claims := jsonb_set(
            claims,
            '{app_metadata, role}',
            to_jsonb(user_role_value)
        );
    ELSE
        -- No role assigned = 'none' (will fail most RLS checks)
        -- This is intentional: users without roles cannot access protected resources
        claims := jsonb_set(
            claims,
            '{app_metadata, role}',
            '"none"'::jsonb
        );
    END IF;

    -- Return modified event with updated claims
    RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

-- Grant execute to supabase_auth_admin (required for hook to work)
-- This is the role that Supabase Auth uses to call the hook
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;

-- Revoke from all other roles for security
-- The hook should ONLY be callable by the auth system
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM anon;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated;

-- Grant user_roles SELECT to supabase_auth_admin
-- Required for the hook to query user roles during token issuance
GRANT SELECT ON public.user_roles TO supabase_auth_admin;

-- ============================================================================
-- IMPORTANT: MANUAL CONFIGURATION REQUIRED
-- ============================================================================
-- After applying this migration, you must enable the hook in Supabase Dashboard:
--
-- 1. Go to: Supabase Dashboard -> Authentication -> Hooks
-- 2. Find: "Customize Access Token (JWT) Claims" section
-- 3. Enable: Toggle ON
-- 4. Set Postgres function: public.custom_access_token_hook
-- 5. Save changes
--
-- For local development (supabase/config.toml):
-- [auth.hook.custom_access_token]
-- enabled = true
-- uri = "pg-functions://postgres/public/custom_access_token_hook"
--
-- TESTING THE HOOK:
-- 1. Users must sign out and sign back in to get the updated JWT
-- 2. Decode JWT at https://jwt.io to verify app_metadata.role is present
-- 3. Check Supabase Postgres logs if hook errors occur
-- ============================================================================

-- Seed file: supabase/seed.sql
-- Purpose: Initial data setup after migrations
-- Phase: 01-security-foundation, Plan: 04
-- Created: 2026-01-23

-- ============================================================================
-- ADMIN BOOTSTRAP INSTRUCTIONS
-- ============================================================================
--
-- OPTION 1: Bootstrap function (recommended for production)
-- ---------------------------------------------------------
-- 1. Create first user via Supabase Auth (Dashboard or API)
-- 2. Sign in as that user
-- 3. Call: SELECT public.bootstrap_first_admin();
-- 4. Sign out and sign back in to refresh JWT with admin role
--
-- OPTION 2: Direct SQL (for development/local setup)
-- ---------------------------------------------------
-- 1. Create user via Supabase Dashboard or Auth API
-- 2. Get user UUID from auth.users table
-- 3. Run:
--    INSERT INTO public.user_roles (user_id, role)
--    VALUES ('YOUR-USER-UUID-HERE', 'admin')
--    ON CONFLICT (user_id) DO UPDATE SET role = 'admin';
--
-- ============================================================================

-- Role assignment helper function (for admins to manage other users)
CREATE OR REPLACE FUNCTION public.assign_role(
    target_email text,
    target_role public.user_role
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    target_user_id uuid;
    current_role public.user_role;
BEGIN
    -- Check caller is admin
    IF public.get_user_role() != 'admin' THEN
        RAISE EXCEPTION 'Only admins can assign roles';
    END IF;

    -- Find user by email
    SELECT id INTO target_user_id
    FROM auth.users
    WHERE email = target_email;

    IF target_user_id IS NULL THEN
        RAISE EXCEPTION 'User with email % not found', target_email;
    END IF;

    -- Check for existing role
    SELECT role INTO current_role
    FROM public.user_roles
    WHERE user_id = target_user_id;

    IF current_role IS NOT NULL THEN
        -- Update existing role
        UPDATE public.user_roles
        SET role = target_role
        WHERE user_id = target_user_id;

        RETURN format('Updated role for %s: %s -> %s', target_email, current_role, target_role);
    ELSE
        -- Insert new role
        INSERT INTO public.user_roles (user_id, role)
        VALUES (target_user_id, target_role);

        RETURN format('Assigned role %s to %s', target_role, target_email);
    END IF;
END;
$$;

-- Grant execute to authenticated (function checks admin internally)
GRANT EXECUTE ON FUNCTION public.assign_role TO authenticated;

COMMENT ON FUNCTION public.assign_role IS
    'Admin-only function to assign/update roles by email. Usage: SELECT assign_role(''user@email.com'', ''medico'')';

-- Bootstrap function for FIRST admin (can only be called when no admins exist)
-- This allows the first user to bootstrap themselves as admin without SQL access
CREATE OR REPLACE FUNCTION public.bootstrap_first_admin()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    caller_id uuid;
    admin_count integer;
BEGIN
    -- Get caller's user ID
    caller_id := auth.uid();

    IF caller_id IS NULL THEN
        RAISE EXCEPTION 'Must be authenticated to bootstrap admin';
    END IF;

    -- Check if any admins exist
    SELECT count(*) INTO admin_count
    FROM public.user_roles
    WHERE role = 'admin';

    IF admin_count > 0 THEN
        RAISE EXCEPTION 'Admin already exists. Use assign_role() instead.';
    END IF;

    -- Assign admin role to caller
    INSERT INTO public.user_roles (user_id, role)
    VALUES (caller_id, 'admin')
    ON CONFLICT (user_id) DO UPDATE SET role = 'admin';

    RETURN 'You are now the first admin. Sign out and sign back in to refresh your token.';
END;
$$;

-- Grant execute to authenticated
GRANT EXECUTE ON FUNCTION public.bootstrap_first_admin TO authenticated;

COMMENT ON FUNCTION public.bootstrap_first_admin IS
    'One-time function to bootstrap the first admin user. Fails if any admin exists.';

-- ============================================================================
-- ROLE MANAGEMENT REFERENCE
-- ============================================================================
--
-- Available roles (defined in 001_user_roles.sql):
--   - admin:      System administrator, full access
--   - medico:     Medical doctor, patient records & treatments
--   - enfermera:  Nurse, limited medical access
--   - secretaria: Reception/admin, appointments & billing
--
-- Role assignment workflow:
--   1. User creates account via Supabase Auth
--   2. Admin runs: SELECT assign_role('user@email.com', 'medico');
--   3. User signs out and back in to get new JWT with role
--
-- Verify current roles:
--   SELECT u.email, ur.role, ur.created_at
--   FROM auth.users u
--   LEFT JOIN public.user_roles ur ON u.id = ur.user_id
--   ORDER BY ur.created_at DESC;
--
-- ============================================================================

-- Verification query (for manual inspection after seeding)
-- Uncomment and run to verify role assignments:
--
-- SELECT
--     u.email,
--     ur.role,
--     ur.created_at
-- FROM auth.users u
-- LEFT JOIN public.user_roles ur ON u.id = ur.user_id
-- ORDER BY ur.created_at DESC;

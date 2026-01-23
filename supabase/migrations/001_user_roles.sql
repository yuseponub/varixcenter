-- Migration: 001_user_roles.sql
-- Purpose: Role-based access control foundation
-- Phase: 01-security-foundation, Plan: 02
-- Created: 2026-01-23

-- Create enum for user roles (4 roles as per PROJECT.md)
CREATE TYPE public.user_role AS ENUM ('admin', 'medico', 'enfermera', 'secretaria');

-- User roles table
-- Links auth.users to their assigned role
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role public.user_role NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id)
);

-- Index for faster lookups (used by Custom Access Token Hook)
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);

-- Enable RLS - CRITICAL: All tables must have RLS enabled
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Only admins can view all roles
-- Uses (SELECT auth.uid()) for PostgreSQL statement caching optimization
CREATE POLICY "Admins can view all roles" ON public.user_roles
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = (SELECT auth.uid())
        AND ur.role = 'admin'
    )
);

-- Only admins can insert roles
CREATE POLICY "Admins can insert roles" ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = (SELECT auth.uid())
        AND ur.role = 'admin'
    )
);

-- Only admins can update roles
CREATE POLICY "Admins can update roles" ON public.user_roles
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = (SELECT auth.uid())
        AND ur.role = 'admin'
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = (SELECT auth.uid())
        AND ur.role = 'admin'
    )
);

-- Only admins can delete roles
CREATE POLICY "Admins can delete roles" ON public.user_roles
FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = (SELECT auth.uid())
        AND ur.role = 'admin'
    )
);

-- Helper function to get current user's role from JWT claims
-- SECURITY DEFINER: Runs with function owner's privileges to avoid RLS recursion
-- STABLE: Indicates function returns same result for same inputs within transaction
-- SET search_path: Security best practice for SECURITY DEFINER functions
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        (SELECT auth.jwt() -> 'app_metadata' ->> 'role'),
        'none'
    )
$$;

-- Grant execute to authenticated users (needed for RLS policies)
GRANT EXECUTE ON FUNCTION public.get_user_role TO authenticated;

-- Updated_at trigger function (reusable for other tables)
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- Apply updated_at trigger to user_roles
CREATE TRIGGER tr_user_roles_updated_at
    BEFORE UPDATE ON public.user_roles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- BOOTSTRAP NOTE:
-- The first admin user must be created via Supabase dashboard SQL editor
-- or service_role key since no admin exists to create the first one.
-- Example:
-- INSERT INTO public.user_roles (user_id, role)
-- VALUES ('uuid-of-first-admin-user', 'admin');

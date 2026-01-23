-- Migration: 004_audit_user_roles.sql
-- Purpose: Enable audit logging on user_roles table
-- Phase: 01-security-foundation, Plan: 04
-- Created: 2026-01-23
-- Depends on: 002_audit_infrastructure.sql (audit_trigger_func)

-- Apply audit trigger to user_roles table
-- All role assignments and changes will be tracked in audit_log
CREATE TRIGGER tr_audit_user_roles
    AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
    FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- Add comment for documentation
COMMENT ON TRIGGER tr_audit_user_roles ON public.user_roles IS
    'Audit trigger: tracks all role assignments and changes in audit_log';

-- Verify trigger exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'tr_audit_user_roles'
    ) THEN
        RAISE EXCEPTION 'Audit trigger not created on user_roles';
    END IF;
END $$;

-- Note: After applying this migration, any INSERT/UPDATE/DELETE on user_roles
-- will automatically create an entry in audit_log with:
-- - table_name: 'user_roles'
-- - record_id: the user_id (primary key)
-- - action: 'INSERT', 'UPDATE', or 'DELETE'
-- - old_data/new_data: JSON of the full row
-- - changed_by: auth.uid() of who made the change
-- - changed_at: timestamp
-- - client_ip, user_agent, session_id: request context

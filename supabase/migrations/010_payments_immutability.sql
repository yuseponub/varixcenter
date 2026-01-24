-- Migration: 010_payments_immutability.sql
-- Purpose: Enforce payment immutability via database trigger
-- Phase: 04-payments-core, Plan: 02
-- Created: 2026-01-24
-- Depends on: 009_payments_tables.sql (payments table)

-- ============================================================================
-- PAYMENT IMMUTABILITY ENFORCEMENT
-- ============================================================================
-- This trigger makes fraud IMPOSSIBLE at the database level.
-- Even service_role cannot bypass triggers - only a direct SQL connection
-- with DISABLE TRIGGER would work, which is audited and logged.
-- ============================================================================

-- Function to enforce payment immutability
-- Blocks all DELETE and UPDATE (except estado -> 'anulado' transition)
CREATE OR REPLACE FUNCTION public.enforce_payment_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- ========================================================================
    -- RULE 1: DELETE is NEVER allowed
    -- ========================================================================
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Los pagos no pueden ser eliminados. Use anulacion.';
    END IF;

    -- ========================================================================
    -- RULE 2: Check immutable fields (cannot change under any circumstance)
    -- ========================================================================
    IF TG_OP = 'UPDATE' THEN
        -- Check each immutable field using IS DISTINCT FROM (handles NULL correctly)
        IF OLD.patient_id IS DISTINCT FROM NEW.patient_id THEN
            RAISE EXCEPTION 'Los pagos son inmutables. Solo se permite anulacion.';
        END IF;

        IF OLD.numero_factura IS DISTINCT FROM NEW.numero_factura THEN
            RAISE EXCEPTION 'Los pagos son inmutables. Solo se permite anulacion.';
        END IF;

        IF OLD.subtotal IS DISTINCT FROM NEW.subtotal THEN
            RAISE EXCEPTION 'Los pagos son inmutables. Solo se permite anulacion.';
        END IF;

        IF OLD.descuento IS DISTINCT FROM NEW.descuento THEN
            RAISE EXCEPTION 'Los pagos son inmutables. Solo se permite anulacion.';
        END IF;

        IF OLD.descuento_justificacion IS DISTINCT FROM NEW.descuento_justificacion THEN
            RAISE EXCEPTION 'Los pagos son inmutables. Solo se permite anulacion.';
        END IF;

        IF OLD.total IS DISTINCT FROM NEW.total THEN
            RAISE EXCEPTION 'Los pagos son inmutables. Solo se permite anulacion.';
        END IF;

        IF OLD.created_by IS DISTINCT FROM NEW.created_by THEN
            RAISE EXCEPTION 'Los pagos son inmutables. Solo se permite anulacion.';
        END IF;

        IF OLD.created_at IS DISTINCT FROM NEW.created_at THEN
            RAISE EXCEPTION 'Los pagos son inmutables. Solo se permite anulacion.';
        END IF;

        -- ====================================================================
        -- RULE 3: Only allow estado transition 'activo' -> 'anulado'
        -- ====================================================================
        IF OLD.estado IS DISTINCT FROM NEW.estado THEN
            -- Validate the transition
            IF OLD.estado != 'activo' THEN
                RAISE EXCEPTION 'El pago ya fue anulado y no puede modificarse.';
            END IF;

            IF NEW.estado != 'anulado' THEN
                RAISE EXCEPTION 'Solo se permite cambiar estado a anulado.';
            END IF;

            -- Validate anulacion requirements
            IF NEW.anulacion_justificacion IS NULL OR TRIM(NEW.anulacion_justificacion) = '' THEN
                RAISE EXCEPTION 'La anulacion requiere una justificacion.';
            END IF;

            IF NEW.anulado_por IS NULL THEN
                RAISE EXCEPTION 'La anulacion requiere el usuario que anula (anulado_por).';
            END IF;

            -- Set anulado_at if not already set
            IF NEW.anulado_at IS NULL THEN
                NEW.anulado_at := now();
            END IF;
        ELSE
            -- Estado didn't change - no other fields can change either
            -- (immutable fields already checked above)
            -- This catches attempts to change anulacion fields without changing estado
            IF OLD.anulado_por IS DISTINCT FROM NEW.anulado_por
               OR OLD.anulado_at IS DISTINCT FROM NEW.anulado_at
               OR OLD.anulacion_justificacion IS DISTINCT FROM NEW.anulacion_justificacion THEN
                RAISE EXCEPTION 'Los pagos son inmutables. Solo se permite anulacion.';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- Create trigger on payments table
CREATE TRIGGER tr_payment_immutability
    BEFORE UPDATE OR DELETE ON public.payments
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_payment_immutability();

-- Add comment for documentation
COMMENT ON TRIGGER tr_payment_immutability ON public.payments IS
    'Immutability trigger: blocks all DELETE, blocks UPDATE except estado activo->anulado with justificacion';

COMMENT ON FUNCTION public.enforce_payment_immutability() IS
    'Enforces payment immutability: only anulacion allowed, requires justificacion';

-- ============================================================================
-- RPC FUNCTION: anular_pago
-- ============================================================================
-- Safe anulacion function for use by the application
-- Validates role (admin/medico only) and justificacion length
-- ============================================================================

CREATE OR REPLACE FUNCTION public.anular_pago(
    p_payment_id UUID,
    p_justificacion TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_user_role TEXT;
    v_payment RECORD;
BEGIN
    -- Get current user
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'No autorizado';
    END IF;

    -- Check role is admin or medico
    SELECT role INTO v_user_role FROM user_roles WHERE user_id = v_user_id;
    IF v_user_role IS NULL OR v_user_role NOT IN ('admin', 'medico') THEN
        RAISE EXCEPTION 'Solo Admin y Medico pueden anular pagos';
    END IF;

    -- Validate justificacion (minimum 10 characters)
    IF p_justificacion IS NULL OR LENGTH(TRIM(p_justificacion)) < 10 THEN
        RAISE EXCEPTION 'La justificacion debe tener al menos 10 caracteres';
    END IF;

    -- Get payment and verify it exists
    SELECT * INTO v_payment FROM payments WHERE id = p_payment_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pago no encontrado';
    END IF;

    -- Verify estado (trigger also checks, but early exit is cleaner)
    IF v_payment.estado != 'activo' THEN
        RAISE EXCEPTION 'El pago ya fue anulado';
    END IF;

    -- Perform anulacion (trigger validates immutability rules)
    UPDATE payments
    SET
        estado = 'anulado',
        anulado_por = v_user_id,
        anulado_at = now(),
        anulacion_justificacion = TRIM(p_justificacion)
    WHERE id = p_payment_id;

    RETURN jsonb_build_object(
        'success', true,
        'payment_id', p_payment_id,
        'anulado_por', v_user_id,
        'anulado_at', now()
    );
END;
$$;

-- Grant execute to authenticated users (role check is inside function)
GRANT EXECUTE ON FUNCTION public.anular_pago(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.anular_pago(UUID, TEXT) IS
    'Safely annul a payment. Requires admin/medico role and 10+ char justificacion.';

-- ============================================================================
-- AUDIT TRIGGER FOR PAYMENTS
-- ============================================================================
-- All INSERT and UPDATE (anulacion) operations are logged to audit_log
-- ============================================================================

CREATE TRIGGER tr_audit_payments
    AFTER INSERT OR UPDATE ON public.payments
    FOR EACH ROW
    EXECUTE FUNCTION public.audit_trigger_func();

COMMENT ON TRIGGER tr_audit_payments ON public.payments IS
    'Audit trigger: logs all payment creation and anulacion to audit_log';

-- ============================================================================
-- VERIFICATION
-- ============================================================================
DO $$
BEGIN
    -- Verify immutability trigger exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'tr_payment_immutability'
    ) THEN
        RAISE EXCEPTION 'Immutability trigger not created on payments';
    END IF;

    -- Verify audit trigger exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'tr_audit_payments'
    ) THEN
        RAISE EXCEPTION 'Audit trigger not created on payments';
    END IF;

    -- Verify anular_pago function exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname = 'anular_pago'
    ) THEN
        RAISE EXCEPTION 'anular_pago function not created';
    END IF;

    RAISE NOTICE 'Payment immutability enforcement verified successfully';
END $$;

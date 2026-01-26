-- Migration: 033_medias_returns.sql
-- Purpose: Returns table for medias de compresion with two-phase approval workflow
-- Phase: 14-returns-workflow, Plan: 01
-- Created: 2026-01-26
-- Depends on: 021_medias_sales.sql (medias_sales, medias_sale_items)
--             020_medias_foundation.sql (medias_products, medias_stock_movements)
--
-- Requirements covered by this migration:
--   DEV-01: Two-phase approval (employee requests, Admin/Medico approves)
--   DEV-02: Partial returns allowed (return fewer items than purchased)
--   DEV-03: Product snapshots from sale item for audit trail
--   DEV-04: Optional photo evidence (per CONTEXT.md)
--   DEV-05: Free text motivo (10+ chars required)
--   DEV-06: Estado machine: pendiente -> aprobada OR pendiente -> rechazada
--   DEV-07: Terminal states (aprobada/rechazada) are immutable
--   DEV-08: Gapless DEV-000001 numbering
--   DEV-09: Refund method (efectivo or cambio_producto) set at creation
--
-- NOTE: Follows patterns from 021_medias_sales.sql (counter), 022_medias_sales_immutability.sql (trigger)
-- Stock increment and cash closing integration will be in separate RPC migration (034)

-- ============================================================================
-- 1. ENUMS FOR RETURN STATUS AND REFUND METHOD
-- ============================================================================

-- Return status: two-phase approval workflow
CREATE TYPE public.devolucion_estado AS ENUM (
  'pendiente',    -- Created by employee, awaiting approval
  'aprobada',     -- Approved by Admin/Medico, stock affected
  'rechazada'     -- Rejected by Admin/Medico, no stock change
);

COMMENT ON TYPE public.devolucion_estado IS 'Estados de devolucion: pendiente -> aprobada/rechazada (DEV-06)';

-- Refund method: determines if it affects cash closing
CREATE TYPE public.reembolso_metodo AS ENUM (
  'efectivo',         -- Cash refund, reduces expected efectivo in cierre
  'cambio_producto'   -- Product exchange, no cash impact
);

COMMENT ON TYPE public.reembolso_metodo IS 'Metodo de reembolso: efectivo afecta cierre, cambio_producto no (DEV-09)';

-- ============================================================================
-- 2. RETURN COUNTER TABLE (GAPLESS DEV- NUMBERING)
-- ============================================================================
-- DEV-08: Gapless sequential numbering (DEV-000001, DEV-000002, ...)
-- Single-row table pattern (same as venta_counter, medias_cierre_counter)

CREATE TABLE public.medias_return_counter (
  id INTEGER PRIMARY KEY DEFAULT 1,
  last_number BIGINT NOT NULL DEFAULT 0,
  prefix VARCHAR(10) NOT NULL DEFAULT 'DEV',

  -- Single-row enforcement: only id=1 allowed
  CONSTRAINT medias_return_counter_single_row CHECK (id = 1)
);

COMMENT ON TABLE public.medias_return_counter IS 'Contador de devoluciones con numeracion secuencial sin gaps - solo una fila permitida (DEV-XXXXXX)';
COMMENT ON COLUMN public.medias_return_counter.last_number IS 'Ultimo numero de devolucion generado';
COMMENT ON COLUMN public.medias_return_counter.prefix IS 'Prefijo para el numero de devolucion (DEV = Devolucion)';

-- Initialize counter with single row
INSERT INTO public.medias_return_counter (id, last_number, prefix) VALUES (1, 0, 'DEV');

-- ============================================================================
-- 3. RETURN COUNTER PROTECTION TRIGGER
-- ============================================================================

-- Prevent DELETE and multiple INSERTs on medias_return_counter
CREATE OR REPLACE FUNCTION public.protect_medias_return_counter()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'No se puede eliminar el contador de devoluciones';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF (SELECT COUNT(*) FROM public.medias_return_counter) > 0 THEN
      RAISE EXCEPTION 'Solo puede existir un contador de devoluciones';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_protect_medias_return_counter
  BEFORE INSERT OR DELETE ON public.medias_return_counter
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_medias_return_counter();

COMMENT ON FUNCTION public.protect_medias_return_counter() IS 'Protege el contador de devoluciones: un solo registro, no eliminar';

-- ============================================================================
-- 4. GET NEXT RETURN NUMBER FUNCTION
-- ============================================================================

-- Atomically get next return number with exclusive row lock
-- CRITICAL: Called within transaction, uses FOR UPDATE to prevent race conditions
-- DEV-08: Ensures gapless sequential numbering
CREATE OR REPLACE FUNCTION public.get_next_medias_return_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  next_num BIGINT;
  prefix_val VARCHAR(10);
BEGIN
  -- Lock the counter row exclusively (FOR UPDATE)
  -- This prevents concurrent transactions from getting the same number
  SELECT last_number + 1, prefix
  INTO next_num, prefix_val
  FROM public.medias_return_counter
  WHERE id = 1
  FOR UPDATE;

  -- Update the counter atomically
  UPDATE public.medias_return_counter
  SET last_number = next_num
  WHERE id = 1;

  -- Return formatted return number: DEV-000001
  RETURN prefix_val || '-' || LPAD(next_num::text, 6, '0');
END;
$$;

COMMENT ON FUNCTION public.get_next_medias_return_number() IS 'Genera el siguiente numero de devolucion con bloqueo exclusivo para evitar gaps (DEV-08)';

-- ============================================================================
-- 5. MEDIAS_RETURNS TABLE
-- ============================================================================

CREATE TABLE public.medias_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Return number (generated by get_next_medias_return_number())
  -- DEV-08: Sequential, never reused
  numero_devolucion VARCHAR(20) NOT NULL UNIQUE,

  -- Link to original sale (REQUIRED)
  -- Cannot return without a sale reference
  sale_id UUID NOT NULL REFERENCES public.medias_sales(id) ON DELETE RESTRICT,

  -- Link to specific sale item being returned
  -- Required to validate quantity and get product snapshot
  sale_item_id UUID NOT NULL REFERENCES public.medias_sale_items(id) ON DELETE RESTRICT,

  -- DEV-02: Quantity returned (partial returns allowed)
  -- Validated in RPC: cannot exceed original sale_item.quantity minus already returned
  cantidad INTEGER NOT NULL,

  -- DEV-03: Snapshot of product at time of return (from sale_item, for audit)
  product_codigo VARCHAR(20) NOT NULL,
  product_tipo VARCHAR(20) NOT NULL,
  product_talla VARCHAR(10) NOT NULL,

  -- Refund amount (unit_price from sale_item * cantidad)
  monto_devolucion DECIMAL(12,2) NOT NULL,

  -- DEV-05: Return reason (free text, minimum 10 characters)
  motivo TEXT NOT NULL,

  -- DEV-04: Optional photo evidence (per CONTEXT.md - NOT required)
  foto_path TEXT,

  -- DEV-09: Refund method chosen at request creation
  metodo_reembolso public.reembolso_metodo NOT NULL,

  -- DEV-06: Status workflow (pendiente -> aprobada/rechazada)
  estado public.devolucion_estado NOT NULL DEFAULT 'pendiente',

  -- Who requested the return (any staff member)
  solicitante_id UUID NOT NULL REFERENCES auth.users(id),

  -- Approval tracking (NULL until approved/rejected)
  -- DEV-01: Admin/Medico only can approve/reject
  aprobador_id UUID REFERENCES auth.users(id),
  aprobado_at TIMESTAMPTZ,
  notas_aprobador TEXT,  -- OPTIONAL notes (per CONTEXT.md)

  -- Audit timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- ============================================================================
  -- CONSTRAINTS
  -- ============================================================================

  -- DEV-02: Quantity must be positive
  CONSTRAINT medias_returns_cantidad_positive CHECK (cantidad > 0),

  -- Refund amount must be positive
  CONSTRAINT medias_returns_monto_positive CHECK (monto_devolucion > 0),

  -- DEV-05: Motivo must be at least 10 characters (meaningful explanation)
  CONSTRAINT medias_returns_motivo_length CHECK (LENGTH(TRIM(motivo)) >= 10)
);

-- Table comments
COMMENT ON TABLE public.medias_returns IS 'Devoluciones de medias con flujo de aprobacion en dos fases (empleado solicita, Admin/Medico aprueba)';
COMMENT ON COLUMN public.medias_returns.numero_devolucion IS 'Numero de devolucion secuencial sin gaps (DEV-000001)';
COMMENT ON COLUMN public.medias_returns.sale_id IS 'Venta original de la cual se devuelve producto';
COMMENT ON COLUMN public.medias_returns.sale_item_id IS 'Item especifico de la venta que se devuelve';
COMMENT ON COLUMN public.medias_returns.cantidad IS 'Cantidad devuelta (puede ser parcial)';
COMMENT ON COLUMN public.medias_returns.product_codigo IS 'Codigo del producto al momento de la venta (snapshot)';
COMMENT ON COLUMN public.medias_returns.product_tipo IS 'Tipo del producto al momento de la venta (snapshot)';
COMMENT ON COLUMN public.medias_returns.product_talla IS 'Talla del producto al momento de la venta (snapshot)';
COMMENT ON COLUMN public.medias_returns.monto_devolucion IS 'Monto a devolver (unit_price * cantidad)';
COMMENT ON COLUMN public.medias_returns.motivo IS 'Razon de la devolucion (minimo 10 caracteres)';
COMMENT ON COLUMN public.medias_returns.foto_path IS 'Foto opcional del producto devuelto';
COMMENT ON COLUMN public.medias_returns.metodo_reembolso IS 'Metodo de reembolso: efectivo o cambio_producto';
COMMENT ON COLUMN public.medias_returns.estado IS 'Estado: pendiente -> aprobada/rechazada (estados terminales inmutables)';
COMMENT ON COLUMN public.medias_returns.solicitante_id IS 'Empleado que solicito la devolucion';
COMMENT ON COLUMN public.medias_returns.aprobador_id IS 'Admin/Medico que aprobo o rechazo';
COMMENT ON COLUMN public.medias_returns.aprobado_at IS 'Fecha/hora de aprobacion o rechazo';
COMMENT ON COLUMN public.medias_returns.notas_aprobador IS 'Notas opcionales del aprobador';

-- ============================================================================
-- 6. IMMUTABILITY TRIGGER FOR MEDIAS_RETURNS
-- ============================================================================
-- DEV-06: Only allow estado transitions: pendiente -> aprobada OR pendiente -> rechazada
-- DEV-07: Terminal states (aprobada/rechazada) are final and immutable
-- Core fields are immutable once created

CREATE OR REPLACE FUNCTION public.enforce_medias_return_immutability()
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
    RAISE EXCEPTION 'Las devoluciones no pueden ser eliminadas';
  END IF;

  -- ========================================================================
  -- RULE 2: UPDATE restrictions for immutable fields
  -- ========================================================================
  IF TG_OP = 'UPDATE' THEN
    -- Core identification fields are immutable
    IF OLD.numero_devolucion IS DISTINCT FROM NEW.numero_devolucion THEN
      RAISE EXCEPTION 'No se puede modificar el numero de devolucion';
    END IF;

    IF OLD.sale_id IS DISTINCT FROM NEW.sale_id THEN
      RAISE EXCEPTION 'No se puede modificar la venta de referencia';
    END IF;

    IF OLD.sale_item_id IS DISTINCT FROM NEW.sale_item_id THEN
      RAISE EXCEPTION 'No se puede modificar el item de venta';
    END IF;

    IF OLD.cantidad IS DISTINCT FROM NEW.cantidad THEN
      RAISE EXCEPTION 'No se puede modificar la cantidad a devolver';
    END IF;

    -- Product snapshots are immutable
    IF OLD.product_codigo IS DISTINCT FROM NEW.product_codigo THEN
      RAISE EXCEPTION 'No se puede modificar el codigo del producto';
    END IF;

    IF OLD.product_tipo IS DISTINCT FROM NEW.product_tipo THEN
      RAISE EXCEPTION 'No se puede modificar el tipo del producto';
    END IF;

    IF OLD.product_talla IS DISTINCT FROM NEW.product_talla THEN
      RAISE EXCEPTION 'No se puede modificar la talla del producto';
    END IF;

    IF OLD.monto_devolucion IS DISTINCT FROM NEW.monto_devolucion THEN
      RAISE EXCEPTION 'No se puede modificar el monto de devolucion';
    END IF;

    IF OLD.motivo IS DISTINCT FROM NEW.motivo THEN
      RAISE EXCEPTION 'No se puede modificar el motivo de devolucion';
    END IF;

    IF OLD.metodo_reembolso IS DISTINCT FROM NEW.metodo_reembolso THEN
      RAISE EXCEPTION 'No se puede modificar el metodo de reembolso';
    END IF;

    IF OLD.solicitante_id IS DISTINCT FROM NEW.solicitante_id THEN
      RAISE EXCEPTION 'No se puede modificar el solicitante';
    END IF;

    IF OLD.created_at IS DISTINCT FROM NEW.created_at THEN
      RAISE EXCEPTION 'No se puede modificar la fecha de creacion';
    END IF;

    -- ========================================================================
    -- RULE 3: Estado transitions (DEV-06, DEV-07)
    -- ========================================================================
    IF OLD.estado IS DISTINCT FROM NEW.estado THEN
      -- Terminal states cannot transition to anything
      IF OLD.estado = 'aprobada' THEN
        RAISE EXCEPTION 'Las devoluciones aprobadas no pueden cambiar de estado';
      END IF;

      IF OLD.estado = 'rechazada' THEN
        RAISE EXCEPTION 'Las devoluciones rechazadas no pueden cambiar de estado';
      END IF;

      -- From pendiente, only allowed: aprobada or rechazada
      IF OLD.estado = 'pendiente' THEN
        IF NEW.estado NOT IN ('aprobada', 'rechazada') THEN
          RAISE EXCEPTION 'Transicion de estado no permitida: pendiente -> %', NEW.estado;
        END IF;

        -- Approval requires aprobador_id
        IF NEW.aprobador_id IS NULL THEN
          RAISE EXCEPTION 'Se requiere registrar quien aprueba/rechaza la devolucion';
        END IF;

        -- Auto-set aprobado_at on estado transition
        NEW.aprobado_at := now();
      END IF;
    END IF;

    -- Update timestamp
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_medias_return_immutability() IS
  'Enforces medias return immutability: estado transitions pendiente -> aprobada/rechazada only (DEV-06, DEV-07)';

CREATE TRIGGER tr_medias_return_immutability
  BEFORE UPDATE OR DELETE ON public.medias_returns
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_medias_return_immutability();

COMMENT ON TRIGGER tr_medias_return_immutability ON public.medias_returns IS
  'Immutability trigger: blocks DELETE, enforces estado state machine, protects core fields';

-- ============================================================================
-- 7. INDEXES
-- ============================================================================

-- Lookup by sale (to find returns for a specific sale)
CREATE INDEX idx_medias_returns_sale ON public.medias_returns(sale_id);

-- Filter by estado (for pending returns list)
CREATE INDEX idx_medias_returns_estado ON public.medias_returns(estado);

-- Sorting by creation date (most recent first)
CREATE INDEX idx_medias_returns_created ON public.medias_returns(created_at DESC);

-- Partial index for approved returns by approval date (for cierre calculations)
-- Only includes approved returns, used to calculate cash refunds for cierre
CREATE INDEX idx_medias_returns_aprobado ON public.medias_returns(aprobado_at)
  WHERE estado = 'aprobada';

-- Index on sale_item_id for partial return validation
CREATE INDEX idx_medias_returns_sale_item ON public.medias_returns(sale_item_id);

-- ============================================================================
-- 8. ROW LEVEL SECURITY
-- ============================================================================

-- MEDIAS_RETURNS TABLE RLS
ALTER TABLE public.medias_returns ENABLE ROW LEVEL SECURITY;

-- SELECT: All staff can view returns (for transparency)
CREATE POLICY "Staff can view medias returns"
  ON public.medias_returns FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'medico', 'enfermera', 'secretaria')
    )
  );

-- INSERT: All staff can create return requests (DEV-01: anyone can request)
CREATE POLICY "Staff can create medias returns"
  ON public.medias_returns FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'medico', 'enfermera', 'secretaria')
    )
  );

-- UPDATE: Only Admin and Medico can update (for approval/rejection)
-- DEV-01: Two-phase approval requires privileged role for estado change
CREATE POLICY "Admin and Medico can update medias returns"
  ON public.medias_returns FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'medico')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'medico')
    )
  );

-- NO DELETE policy - returns cannot be deleted (enforced by trigger too)

-- MEDIAS_RETURN_COUNTER TABLE RLS (admin only for viewing)
ALTER TABLE public.medias_return_counter ENABLE ROW LEVEL SECURITY;

-- Only admin can view counter directly
CREATE POLICY "Admin can view medias return counter"
  ON public.medias_return_counter FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
  );

-- Allow UPDATE for return number generation (via function)
CREATE POLICY "Allow medias return counter update"
  ON public.medias_return_counter FOR UPDATE
  TO authenticated
  WITH CHECK (true);

-- ============================================================================
-- 9. GRANT PERMISSIONS
-- ============================================================================

-- medias_returns: SELECT and INSERT for all authenticated users
-- UPDATE limited to specific columns via RLS (estado, aprobador_id, aprobado_at, notas_aprobador, updated_at)
GRANT SELECT, INSERT ON public.medias_returns TO authenticated;
GRANT UPDATE (estado, aprobador_id, aprobado_at, notas_aprobador, updated_at) ON public.medias_returns TO authenticated;

-- medias_return_counter: SELECT and UPDATE for counter increments
GRANT SELECT, UPDATE ON public.medias_return_counter TO authenticated;

-- ============================================================================
-- 10. AUDIT TRIGGER FOR MEDIAS_RETURNS
-- ============================================================================
-- Logs all INSERT and UPDATE operations to audit_log table

CREATE TRIGGER tr_audit_medias_returns
  AFTER INSERT OR UPDATE ON public.medias_returns
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_trigger_func();

COMMENT ON TRIGGER tr_audit_medias_returns ON public.medias_returns IS
  'Audit trigger: logs all return creation and approval/rejection to audit_log';

-- ============================================================================
-- 11. VERIFICATION
-- ============================================================================

DO $$
BEGIN
  -- Verify ENUMs exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'devolucion_estado'
  ) THEN
    RAISE EXCEPTION 'devolucion_estado ENUM not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'reembolso_metodo'
  ) THEN
    RAISE EXCEPTION 'reembolso_metodo ENUM not created';
  END IF;

  -- Verify medias_returns table exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'medias_returns'
  ) THEN
    RAISE EXCEPTION 'medias_returns table not created';
  END IF;

  -- Verify RLS is enabled on medias_returns
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'medias_returns' AND rowsecurity = true
  ) THEN
    RAISE EXCEPTION 'RLS not enabled on medias_returns table';
  END IF;

  -- Verify medias_return_counter exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'medias_return_counter'
  ) THEN
    RAISE EXCEPTION 'medias_return_counter table not created';
  END IF;

  -- Verify RLS is enabled on medias_return_counter
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'medias_return_counter' AND rowsecurity = true
  ) THEN
    RAISE EXCEPTION 'RLS not enabled on medias_return_counter table';
  END IF;

  -- Verify counter has exactly one row with DEV prefix
  IF (SELECT COUNT(*) FROM public.medias_return_counter) != 1 THEN
    RAISE EXCEPTION 'medias_return_counter must have exactly one row';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.medias_return_counter
    WHERE id = 1 AND last_number = 0 AND prefix = 'DEV'
  ) THEN
    RAISE EXCEPTION 'medias_return_counter not initialized correctly with DEV prefix';
  END IF;

  -- Verify immutability trigger exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'tr_medias_return_immutability'
  ) THEN
    RAISE EXCEPTION 'tr_medias_return_immutability trigger not created';
  END IF;

  -- Verify audit trigger exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'tr_audit_medias_returns'
  ) THEN
    RAISE EXCEPTION 'tr_audit_medias_returns trigger not created';
  END IF;

  -- Verify get_next_medias_return_number function exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'get_next_medias_return_number'
  ) THEN
    RAISE EXCEPTION 'get_next_medias_return_number function not created';
  END IF;

  -- Verify constraints exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'medias_returns_cantidad_positive'
    AND table_name = 'medias_returns'
  ) THEN
    RAISE EXCEPTION 'medias_returns_cantidad_positive constraint missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'medias_returns_monto_positive'
    AND table_name = 'medias_returns'
  ) THEN
    RAISE EXCEPTION 'medias_returns_monto_positive constraint missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'medias_returns_motivo_length'
    AND table_name = 'medias_returns'
  ) THEN
    RAISE EXCEPTION 'medias_returns_motivo_length constraint missing (DEV-05)';
  END IF;

  RAISE NOTICE 'Medias returns migration verified successfully';
  RAISE NOTICE '- devolucion_estado ENUM: pendiente, aprobada, rechazada (DEV-06)';
  RAISE NOTICE '- reembolso_metodo ENUM: efectivo, cambio_producto (DEV-09)';
  RAISE NOTICE '- medias_return_counter initialized with DEV prefix (DEV-08)';
  RAISE NOTICE '- Immutability trigger enforces estado state machine (DEV-06, DEV-07)';
  RAISE NOTICE '- RLS: All staff SELECT/INSERT, Admin/Medico UPDATE (DEV-01)';
END;
$$;

-- ============================================================================
-- Summary of DEV requirements addressed:
-- DEV-01: Two-phase approval (all staff INSERT, Admin/Medico UPDATE for approval)
-- DEV-02: Partial returns (cantidad column, validated in RPC)
-- DEV-03: Product snapshots (product_codigo, product_tipo, product_talla)
-- DEV-04: Optional photo (foto_path nullable)
-- DEV-05: Motivo min 10 chars (medias_returns_motivo_length constraint)
-- DEV-06: Estado machine: pendiente -> aprobada/rechazada (trigger enforced)
-- DEV-07: Terminal states immutable (trigger blocks changes from aprobada/rechazada)
-- DEV-08: Gapless DEV- numbering (medias_return_counter + get_next_medias_return_number)
-- DEV-09: Refund method stored at creation (metodo_reembolso ENUM)
--
-- Pending for 034_medias_returns_rpc.sql:
-- - create_medias_return RPC (validates quantity, generates number, creates return)
-- - approve_medias_return RPC (increments stock_devoluciones, logs movement)
-- - reject_medias_return RPC (just changes estado)
-- - Cierre integration (subtract efectivo refunds from total_efectivo)
-- ============================================================================

-- Migration: 013_appointment_services.sql
-- Purpose: Link appointments to services performed, track payment status per service
-- Phase: 05-appointment-services
-- Created: 2026-01-24
-- Depends on: 007_appointments.sql, 008_services_catalog.sql, 009_payments_tables.sql

-- ============================================================================
-- APPOINTMENT SERVICES TABLE
-- ============================================================================
-- Connects appointments with services performed during the visit.
-- Each service has its own payment status (pendiente/pagado).
-- Stores snapshots of service name and price at time of service for immutability.
-- ============================================================================

-- ============================================
-- 1. ENUM TYPE FOR PAYMENT STATUS
-- ============================================

CREATE TYPE public.estado_pago_servicio AS ENUM ('pendiente', 'pagado');

COMMENT ON TYPE public.estado_pago_servicio IS
  'Estado de pago de un servicio: pendiente (sin pagar) o pagado (completamente pagado)';

-- ============================================
-- 2. APPOINTMENT_SERVICES TABLE
-- ============================================

CREATE TABLE public.appointment_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE RESTRICT,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT,

  -- Snapshot of service at time of creation (immutable)
  service_name VARCHAR(100) NOT NULL,
  precio_unitario DECIMAL(12,2) NOT NULL,

  -- Quantity and calculated subtotal
  cantidad INTEGER NOT NULL DEFAULT 1,
  subtotal DECIMAL(12,2) NOT NULL,

  -- Payment tracking
  estado_pago public.estado_pago_servicio NOT NULL DEFAULT 'pendiente',
  payment_item_id UUID REFERENCES public.payment_items(id) ON DELETE SET NULL,

  -- Notes for this specific service instance
  notas TEXT,

  -- Audit
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- ============================================
  -- CONSTRAINTS
  -- ============================================

  CONSTRAINT cantidad_positive CHECK (cantidad > 0),
  CONSTRAINT precio_unitario_positive CHECK (precio_unitario >= 0),
  CONSTRAINT subtotal_positive CHECK (subtotal >= 0),

  -- If paid, must have payment_item_id; if pending, must NOT have it
  CONSTRAINT payment_status_consistency CHECK (
    (estado_pago = 'pendiente' AND payment_item_id IS NULL) OR
    (estado_pago = 'pagado' AND payment_item_id IS NOT NULL)
  )
);

-- Table comments
COMMENT ON TABLE public.appointment_services IS
  'Servicios realizados durante una cita con seguimiento de estado de pago';
COMMENT ON COLUMN public.appointment_services.service_name IS
  'Nombre del servicio al momento de agregarlo (snapshot inmutable)';
COMMENT ON COLUMN public.appointment_services.precio_unitario IS
  'Precio unitario al momento de agregarlo (snapshot inmutable)';
COMMENT ON COLUMN public.appointment_services.estado_pago IS
  'Estado de pago: pendiente hasta que se vincula con un payment_item';
COMMENT ON COLUMN public.appointment_services.payment_item_id IS
  'Referencia al item de pago cuando el servicio ha sido pagado';

-- ============================================
-- 3. ADD APPOINTMENT_ID TO PAYMENTS TABLE
-- ============================================

-- Optional reference to appointment (for payments related to appointment services)
ALTER TABLE public.payments
  ADD COLUMN appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.payments.appointment_id IS
  'Cita asociada al pago (opcional, para pagos de servicios de cita)';

-- Index for looking up payments by appointment
CREATE INDEX idx_payments_appointment ON public.payments(appointment_id) WHERE appointment_id IS NOT NULL;

-- ============================================
-- 4. PENDING SERVICES BY PATIENT VIEW
-- ============================================

-- View for quickly getting all pending services for a patient
CREATE OR REPLACE VIEW public.pending_services_by_patient AS
SELECT
  aps.id,
  aps.appointment_id,
  aps.service_id,
  aps.service_name,
  aps.precio_unitario,
  aps.cantidad,
  aps.subtotal,
  aps.notas,
  aps.created_at,
  a.patient_id,
  a.fecha_hora_inicio AS appointment_date,
  p.nombre AS patient_nombre,
  p.apellido AS patient_apellido,
  p.cedula AS patient_cedula
FROM public.appointment_services aps
JOIN public.appointments a ON aps.appointment_id = a.id
JOIN public.patients p ON a.patient_id = p.id
WHERE aps.estado_pago = 'pendiente'
ORDER BY a.fecha_hora_inicio DESC;

COMMENT ON VIEW public.pending_services_by_patient IS
  'Servicios pendientes de pago agrupados por paciente para facilitar cobro';

-- ============================================
-- 5. INDEXES
-- ============================================

-- Primary lookup indexes
CREATE INDEX idx_appointment_services_appointment ON public.appointment_services(appointment_id);
CREATE INDEX idx_appointment_services_service ON public.appointment_services(service_id);
CREATE INDEX idx_appointment_services_payment_item ON public.appointment_services(payment_item_id)
  WHERE payment_item_id IS NOT NULL;

-- For finding pending services quickly
CREATE INDEX idx_appointment_services_pending ON public.appointment_services(estado_pago)
  WHERE estado_pago = 'pendiente';

-- For audit queries
CREATE INDEX idx_appointment_services_created_at ON public.appointment_services(created_at DESC);
CREATE INDEX idx_appointment_services_created_by ON public.appointment_services(created_by);

-- ============================================
-- 6. UPDATED_AT TRIGGER
-- ============================================

CREATE TRIGGER tr_appointment_services_updated_at
  BEFORE UPDATE ON public.appointment_services
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- ============================================
-- 7. ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.appointment_services ENABLE ROW LEVEL SECURITY;

-- All staff can view appointment services
CREATE POLICY "Staff can view appointment services"
  ON public.appointment_services FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'medico', 'enfermera', 'secretaria')
    )
  );

-- Medico and admin can insert appointment services
CREATE POLICY "Medico and admin can create appointment services"
  ON public.appointment_services FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'medico', 'enfermera')
    )
  );

-- Only allow updating estado_pago and payment_item_id (for payment processing)
-- Admin, medico, and secretaria can update (secretaria needs this for payment flow)
CREATE POLICY "Staff can update payment status"
  ON public.appointment_services FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'medico', 'secretaria')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'medico', 'secretaria')
    )
  );

-- Admin can delete (for corrections before payment)
CREATE POLICY "Admin can delete appointment services"
  ON public.appointment_services FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
    -- Can only delete pending services
    AND estado_pago = 'pendiente'
  );

-- ============================================
-- 8. IMMUTABILITY TRIGGER FOR PAID SERVICES
-- ============================================

-- Prevent modifications to paid services (except by admin for corrections)
CREATE OR REPLACE FUNCTION public.protect_paid_appointment_service()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_admin BOOLEAN;
BEGIN
  -- Check if user is admin
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'admin'
  ) INTO v_is_admin;

  -- Allow admins to do anything
  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  -- For non-admin: if old status was 'pagado', only allow certain changes
  IF OLD.estado_pago = 'pagado' THEN
    -- Once paid, the service is immutable (can't change anything)
    RAISE EXCEPTION 'Los servicios pagados no pueden ser modificados';
  END IF;

  -- For pending services, only allow specific field updates
  -- (estado_pago and payment_item_id for payment processing)
  IF TG_OP = 'UPDATE' THEN
    -- Check if protected fields are being changed
    IF OLD.appointment_id IS DISTINCT FROM NEW.appointment_id OR
       OLD.service_id IS DISTINCT FROM NEW.service_id OR
       OLD.service_name IS DISTINCT FROM NEW.service_name OR
       OLD.precio_unitario IS DISTINCT FROM NEW.precio_unitario OR
       OLD.cantidad IS DISTINCT FROM NEW.cantidad OR
       OLD.subtotal IS DISTINCT FROM NEW.subtotal THEN
      -- Only allow if transitioning to pagado (payment processing)
      IF NEW.estado_pago = 'pagado' AND OLD.estado_pago = 'pendiente' THEN
        -- This is the payment flow, allow it
        RETURN NEW;
      ELSE
        RAISE EXCEPTION 'Solo se puede modificar el estado de pago de servicios pendientes';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_protect_paid_appointment_service
  BEFORE UPDATE ON public.appointment_services
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_paid_appointment_service();

-- ============================================
-- 9. GRANT PERMISSIONS
-- ============================================

GRANT SELECT, INSERT, UPDATE ON public.appointment_services TO authenticated;
GRANT SELECT ON public.pending_services_by_patient TO authenticated;

-- ============================================
-- 10. VERIFICATION
-- ============================================

DO $$
BEGIN
  -- Verify enum exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'estado_pago_servicio'
  ) THEN
    RAISE EXCEPTION 'estado_pago_servicio enum not created';
  END IF;

  -- Verify table exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'appointment_services'
  ) THEN
    RAISE EXCEPTION 'appointment_services table not created';
  END IF;

  -- Verify RLS is enabled
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename = 'appointment_services'
    AND rowsecurity = true
  ) THEN
    RAISE EXCEPTION 'RLS not enabled on appointment_services table';
  END IF;

  -- Verify view exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_views
    WHERE schemaname = 'public' AND viewname = 'pending_services_by_patient'
  ) THEN
    RAISE EXCEPTION 'pending_services_by_patient view not created';
  END IF;

  -- Verify payments.appointment_id column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'payments'
    AND column_name = 'appointment_id'
  ) THEN
    RAISE EXCEPTION 'appointment_id column not added to payments table';
  END IF;

  RAISE NOTICE 'Migration 013_appointment_services.sql verified successfully';
END;
$$;

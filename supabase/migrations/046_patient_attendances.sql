-- =============================================
-- PATIENT ATTENDANCES TABLE
-- Track when patients are marked as attended by doctors
-- =============================================

-- Create table
CREATE TABLE public.patient_attendances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  hora TIME NOT NULL DEFAULT CURRENT_TIME,
  marked_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_patient_attendance_per_day UNIQUE (patient_id, fecha)
);

-- Add comment for documentation
COMMENT ON TABLE public.patient_attendances IS 'Tracks when patients are marked as attended by doctors on a given day';

-- Indexes for common queries
CREATE INDEX idx_patient_attendances_fecha ON public.patient_attendances(fecha DESC);
CREATE INDEX idx_patient_attendances_patient ON public.patient_attendances(patient_id);
CREATE INDEX idx_patient_attendances_marked_by ON public.patient_attendances(marked_by);

-- Enable RLS
ALTER TABLE public.patient_attendances ENABLE ROW LEVEL SECURITY;

-- Policy: All authenticated staff can view attendances
CREATE POLICY "Staff can view patient attendances"
  ON public.patient_attendances
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Only medico and admin can insert attendances
CREATE POLICY "Medico and admin can insert attendances"
  ON public.patient_attendances
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('medico', 'admin')
    )
  );

-- Policy: Only admin can delete (for corrections)
CREATE POLICY "Admin can delete attendances"
  ON public.patient_attendances
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
  );

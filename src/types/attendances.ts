/**
 * Patient Attendance Type Definitions
 *
 * Types for tracking when patients are marked as attended by doctors
 */

/**
 * Base attendance record from database
 */
export interface PatientAttendance {
  id: string
  patient_id: string
  fecha: string // DATE as ISO string
  hora: string // TIME as HH:MM:SS
  marked_by: string
  created_at: string
}

/**
 * Attendance with patient and user details
 */
export interface PatientAttendanceWithDetails extends PatientAttendance {
  patient?: {
    id: string
    nombre: string
    apellido: string
    cedula: string
  }
  marked_by_user?: {
    id: string
    email: string
    nombre?: string
    apellido?: string
  }
}

/**
 * Attendance comparison item for the daily report
 * Combines attendance data with payment status
 */
export interface AttendanceComparisonItem {
  attendance_id: string
  patient_id: string
  patient_nombre: string
  patient_apellido: string
  patient_cedula: string
  hora_atendido: string
  marked_by_nombre: string
  marked_by_apellido: string
  tiene_pago: boolean
  payment_id?: string
  payment_total?: number
  payment_estado?: 'activo' | 'anulado'
}

/**
 * Summary totals for attendance comparison
 */
export interface AttendanceTotals {
  total_atendidos: number
  con_pago: number
  sin_pago: number
  monto_total: number
}

/**
 * Appointment Type Definitions
 *
 * Types matching the appointments database schema (007_appointments.sql)
 * Used by: Calendar components, server actions, state machine
 */

import type { Database } from './supabase'

/**
 * Appointment status values matching the database enum.
 * Uses const assertion for literal type inference.
 */
export const APPOINTMENT_STATES = [
  'programada',    // Initial state when created
  'confirmada',    // Patient confirmed attendance
  'en_sala',       // Patient arrived, waiting
  'en_atencion',   // Currently being seen
  'completada',    // Appointment finished
  'cancelada',     // Cancelled
  'no_asistio',    // Patient did not show up
] as const

/**
 * Appointment status type derived from APPOINTMENT_STATES array.
 * Ensures compile-time type safety for status values.
 */
export type AppointmentStatus = typeof APPOINTMENT_STATES[number]

/**
 * Type guard to check if a string is a valid AppointmentStatus
 */
export function isValidAppointmentStatus(status: unknown): status is AppointmentStatus {
  return (
    typeof status === 'string' &&
    APPOINTMENT_STATES.includes(status as AppointmentStatus)
  )
}

/**
 * Base appointment type from database Row.
 * Matches the appointments table schema exactly.
 */
export interface Appointment {
  id: string
  patient_id: string
  doctor_id: string
  fecha_hora_inicio: string
  fecha_hora_fin: string
  estado: AppointmentStatus
  notas: string | null
  motivo_consulta: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

/**
 * Appointment with patient data joined.
 * Used for calendar display and appointment lists.
 */
export interface AppointmentWithPatient extends Appointment {
  patients: {
    id: string
    cedula: string
    nombre: string
    apellido: string
    celular: string
  }
}

/**
 * Doctor information for appointment display.
 * Minimal user data needed for calendar events.
 */
export interface Doctor {
  id: string
  email: string
  nombre?: string // From user metadata if available
}

/**
 * Calendar event format for FullCalendar.
 * Transforms Appointment data for calendar display.
 */
export interface CalendarEvent {
  id: string
  title: string
  start: string | Date
  end: string | Date
  backgroundColor?: string
  borderColor?: string
  textColor?: string
  extendedProps: {
    appointmentId: string
    patientId: string
    patientName: string
    patientCedula: string
    patientCelular: string
    doctorId: string
    estado: AppointmentStatus
    motivoConsulta: string | null
    notas: string | null
  }
}

/**
 * Appointment insert type (for creating new appointments)
 */
export interface AppointmentInsert {
  patient_id: string
  doctor_id: string
  fecha_hora_inicio: string
  fecha_hora_fin: string
  estado?: AppointmentStatus
  notas?: string | null
  motivo_consulta?: string | null
  created_by?: string | null
}

/**
 * Appointment update type (for updating existing appointments)
 */
export interface AppointmentUpdate {
  patient_id?: string
  doctor_id?: string
  fecha_hora_inicio?: string
  fecha_hora_fin?: string
  estado?: AppointmentStatus
  notas?: string | null
  motivo_consulta?: string | null
}

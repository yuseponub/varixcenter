/**
 * Appointment State Machine
 *
 * Enforces valid state transitions for appointments.
 * Rules based on clinical workflow requirements:
 * - Any state can transition to 'cancelada'
 * - Reversion is allowed (go back to previous state)
 * - 'no_asistio' and 'cancelada' can reschedule to 'programada'
 */

import type { AppointmentStatus } from '@/types/appointments'
import { APPOINTMENT_STATES } from '@/types/appointments'

/**
 * Valid transitions from each state.
 * Map of current state -> allowed next states.
 *
 * Workflow:
 * programada -> confirmada -> en_atencion -> completada
 *
 * Special rules:
 * - Any state -> cancelada (anyone can cancel)
 * - en_atencion can mark no_asistio (patient left or didn't show)
 * - cancelada/no_asistio -> programada (reschedule)
 * - Reversion allowed at each step
 */
// Flujo simplificado (jul-2026): confirmación (confirmada / cancelada-reagendada)
// y asistencia (completada = "Asistió" / no_asistio). Se dejaron de usar en la UI
// los estados intermedios en_sala / en_atencion, pero se conservan aquí para no
// romper citas existentes que aún estén en ellos.
const TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  // Estado inicial: confirmar, cancelar o marcar asistencia directo.
  programada: ['confirmada', 'cancelada', 'completada', 'no_asistio'],

  // Confirmada: marcar asistencia, revertir o cancelar.
  confirmada: ['completada', 'no_asistio', 'cancelada', 'programada'],

  // Estado legado - se mantiene por datos existentes.
  en_sala: ['completada', 'no_asistio', 'confirmada', 'cancelada'],

  // Estado legado - se mantiene por datos existentes.
  en_atencion: ['completada', 'no_asistio', 'confirmada', 'cancelada'],

  // Asistió: permitir corrección (marcar no asistió) o cancelar.
  completada: ['no_asistio', 'cancelada', 'confirmada'],

  // Cancelada / reagendada: volver a programar o confirmar.
  cancelada: ['programada', 'confirmada'],

  // No asistió: reprogramar, confirmar o corregir a asistió.
  no_asistio: ['programada', 'confirmada', 'completada'],
}

/**
 * Check if a transition from one status to another is allowed.
 *
 * @param from - Current appointment status
 * @param to - Desired new status
 * @returns true if the transition is valid
 */
export function canTransition(from: AppointmentStatus, to: AppointmentStatus): boolean {
  // Same state is not a transition
  if (from === to) return false

  const allowedTransitions = TRANSITIONS[from]
  return allowedTransitions.includes(to)
}

/**
 * Get all valid transitions from a given status.
 *
 * @param status - Current appointment status
 * @returns Array of valid next statuses
 */
export function getAvailableTransitions(status: AppointmentStatus): AppointmentStatus[] {
  return TRANSITIONS[status] || []
}

/**
 * Spanish labels for appointment statuses.
 * Used in UI dropdowns and status badges.
 */
export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  programada: 'Programada',
  confirmada: 'Confirmada',
  en_sala: 'En Sala de Espera',
  en_atencion: 'En Atencion',
  completada: 'Asistió',
  cancelada: 'Cancelada',
  no_asistio: 'No asistió',
}

/**
 * Tailwind CSS classes for status badges.
 * Used for consistent status coloring across the app.
 */
export const STATUS_COLORS: Record<AppointmentStatus, string> = {
  programada: 'bg-blue-100 text-blue-800 border-blue-200',
  confirmada: 'bg-green-100 text-green-800 border-green-200',
  en_sala: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  en_atencion: 'bg-purple-100 text-purple-800 border-purple-200',
  completada: 'bg-gray-100 text-gray-800 border-gray-200',
  cancelada: 'bg-red-100 text-red-800 border-red-200',
  no_asistio: 'bg-orange-100 text-orange-800 border-orange-200',
}

/**
 * Hex color values for FullCalendar events.
 * Each status has a distinct color for visual differentiation.
 */
export const STATUS_HEX_COLORS: Record<AppointmentStatus, { bg: string; border: string; text: string }> = {
  programada: { bg: '#DBEAFE', border: '#3B82F6', text: '#1E40AF' },     // Blue
  confirmada: { bg: '#DCFCE7', border: '#22C55E', text: '#166534' },     // Green
  en_sala: { bg: '#FEF9C3', border: '#EAB308', text: '#854D0E' },        // Yellow
  en_atencion: { bg: '#F3E8FF', border: '#A855F7', text: '#6B21A8' },    // Purple
  completada: { bg: '#F3F4F6', border: '#6B7280', text: '#374151' },     // Gray
  cancelada: { bg: '#FEE2E2', border: '#EF4444', text: '#991B1B' },      // Red
  no_asistio: { bg: '#FFEDD5', border: '#F97316', text: '#9A3412' },     // Orange
}

/**
 * Re-export APPOINTMENT_STATES for convenience.
 * Allows importing everything from state-machine module.
 */
export { APPOINTMENT_STATES }

/**
 * Status Badge Component
 *
 * Displays appointment status with colored indicator and Spanish label.
 * Uses STATUS_LABELS and STATUS_COLORS from state-machine.
 */

import { cn } from '@/lib/utils'
import { STATUS_LABELS, STATUS_COLORS } from '@/lib/appointments/state-machine'
import type { AppointmentStatus } from '@/types/appointments'

/**
 * Props for StatusBadge component
 */
interface StatusBadgeProps {
  /** Appointment status to display */
  status: AppointmentStatus
  /** Additional className */
  className?: string
  /** Size variant */
  size?: 'sm' | 'default'
}

/**
 * Status badge with colored indicator and Spanish label.
 *
 * Features:
 * - Color-coded by status (blue, green, yellow, purple, gray, red, orange)
 * - Spanish labels from STATUS_LABELS
 * - Small and default size variants
 */
export function StatusBadge({
  status,
  className,
  size = 'default',
}: StatusBadgeProps) {
  const label = STATUS_LABELS[status]
  const colorClasses = STATUS_COLORS[status]

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border font-medium',
        colorClasses,
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
        className
      )}
    >
      {label}
    </span>
  )
}

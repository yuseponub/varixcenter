'use client'

/**
 * Appointment Detail Dialog Component
 *
 * Displays appointment details with patient info, status badge, and transition buttons.
 * Uses Intl.DateTimeFormat for Spanish date formatting (no date-fns dependency).
 * Shows toast.success() feedback after status updates.
 *
 * APT-03: Appointments transition through states
 */

import { useCallback, useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/appointments/status-badge'
import { getAvailableTransitions, STATUS_LABELS } from '@/lib/appointments/state-machine'
import { updateAppointmentStatus } from '@/app/(protected)/citas/actions'
import type { CalendarEvent, AppointmentStatus } from '@/types/appointments'

/**
 * Props for AppointmentDialog component
 */
interface AppointmentDialogProps {
  /** Calendar event with appointment data in extendedProps */
  event: CalendarEvent | null
  /** Whether the dialog is open */
  open: boolean
  /** Callback to close the dialog */
  onOpenChange: (open: boolean) => void
  /** Callback after successful status update */
  onStatusUpdate?: () => void
}

/**
 * Spanish date/time formatter using Intl.DateTimeFormat.
 * Format: "Lunes, 23 de enero de 2026 a las 10:00"
 */
const dateTimeFormatter = new Intl.DateTimeFormat('es-CO', {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
})

/**
 * Spanish time-only formatter.
 * Format: "10:00 a. m."
 */
const timeFormatter = new Intl.DateTimeFormat('es-CO', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
})

/**
 * Appointment detail dialog with status controls.
 *
 * Features:
 * - Shows patient name, cedula, and phone
 * - Displays appointment time range in Spanish
 * - Shows current status with color badge
 * - Provides buttons for valid state transitions
 * - Shows success toast after status update
 */
export function AppointmentDialog({
  event,
  open,
  onOpenChange,
  onStatusUpdate,
}: AppointmentDialogProps) {
  const [isPending, startTransition] = useTransition()
  const [currentStatus, setCurrentStatus] = useState<AppointmentStatus | null>(null)

  // Use local status if updated, otherwise use event status
  const displayStatus = currentStatus ?? event?.extendedProps.estado ?? 'programada'

  // Get available transitions for current status
  const availableTransitions = getAvailableTransitions(displayStatus)

  /**
   * Handle status transition button click.
   * Updates status via server action and shows feedback toast.
   */
  const handleStatusChange = useCallback(
    (newStatus: AppointmentStatus) => {
      if (!event) return

      startTransition(async () => {
        const result = await updateAppointmentStatus(event.extendedProps.appointmentId, newStatus)

        if (result.success) {
          // Update local status
          setCurrentStatus(newStatus)
          // Show success toast
          toast.success(`Estado actualizado a "${STATUS_LABELS[newStatus]}"`)
          // Notify parent to refresh data
          onStatusUpdate?.()
        } else {
          // Show error toast
          toast.error(result.error || 'Error al actualizar el estado')
        }
      })
    },
    [event, onStatusUpdate]
  )

  // Reset local status when dialog closes or event changes
  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        setCurrentStatus(null)
      }
      onOpenChange(newOpen)
    },
    [onOpenChange]
  )

  if (!event) return null

  const { extendedProps } = event
  const startDate = new Date(event.start)
  const endDate = new Date(event.end)

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span>{extendedProps.patientName}</span>
            <StatusBadge status={displayStatus} size="sm" />
          </DialogTitle>
          <DialogDescription>
            Cedula: {extendedProps.patientCedula}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Date and time */}
          <div>
            <h4 className="text-sm font-medium text-gray-500 mb-1">Fecha y hora</h4>
            <p className="text-sm capitalize">
              {dateTimeFormatter.format(startDate)}
            </p>
            <p className="text-sm text-gray-600">
              {timeFormatter.format(startDate)} - {timeFormatter.format(endDate)}
            </p>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-sm font-medium text-gray-500 mb-1">Telefono</h4>
            <p className="text-sm">
              <a
                href={`tel:${extendedProps.patientCelular}`}
                className="text-blue-600 hover:underline"
              >
                {extendedProps.patientCelular}
              </a>
            </p>
          </div>

          {/* Reason for visit */}
          {extendedProps.motivoConsulta && (
            <div>
              <h4 className="text-sm font-medium text-gray-500 mb-1">Motivo de consulta</h4>
              <p className="text-sm">{extendedProps.motivoConsulta}</p>
            </div>
          )}

          {/* Notes */}
          {extendedProps.notas && (
            <div>
              <h4 className="text-sm font-medium text-gray-500 mb-1">Notas</h4>
              <p className="text-sm text-gray-600">{extendedProps.notas}</p>
            </div>
          )}
        </div>

        {/* Status transition buttons */}
        {availableTransitions.length > 0 && (
          <div className="border-t pt-4">
            <h4 className="text-sm font-medium text-gray-500 mb-3">Cambiar estado</h4>
            <div className="flex flex-wrap gap-2">
              {availableTransitions.map((status) => (
                <Button
                  key={status}
                  variant={status === 'cancelada' ? 'destructive' : 'outline'}
                  size="sm"
                  disabled={isPending}
                  onClick={() => handleStatusChange(status)}
                >
                  {STATUS_LABELS[status]}
                </Button>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

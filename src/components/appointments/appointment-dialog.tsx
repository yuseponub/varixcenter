'use client'

/**
 * Appointment Detail Dialog Component
 *
 * Displays appointment details with patient info, status badge, and transition buttons.
 * Uses Intl.DateTimeFormat for Spanish date formatting (no date-fns dependency).
 * Shows toast.success() feedback after status updates.
 * Includes services section for 'en_atencion' and 'completada' states.
 *
 * APT-03: Appointments transition through states
 * FASE-05: Servicios por cita integration
 */

import { useCallback, useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StatusBadge } from '@/components/appointments/status-badge'
import { AppointmentServicesForm } from '@/components/appointments/appointment-services-form'
import { getAvailableTransitions, STATUS_LABELS } from '@/lib/appointments/state-machine'
import { updateAppointmentStatus } from '@/app/(protected)/citas/actions'
import { getAppointmentServices } from '@/app/(protected)/citas/service-actions'
import { getMedicalRecordIdByAppointment, getQuotationInfoByAppointment } from '@/app/(protected)/historias/actions'
import { EditAppointmentDialog } from '@/components/appointments/edit-appointment-dialog'
import { Receipt } from 'lucide-react'
import type { CalendarEvent, AppointmentStatus } from '@/types/appointments'
import type { ServiceOption } from '@/types/services'
import type { AppointmentService } from '@/types/appointment-services'

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
  /** Service catalog for adding services to appointment */
  services?: ServiceOption[]
}

/** States where services can be added/viewed */
const SERVICE_ENABLED_STATES: AppointmentStatus[] = ['en_atencion', 'completada']

/** States where medical record can be created */
const MEDICAL_RECORD_ENABLED_STATES: AppointmentStatus[] = ['en_atencion', 'completada']

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
  services = [],
}: AppointmentDialogProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [currentStatus, setCurrentStatus] = useState<AppointmentStatus | null>(null)
  const [appointmentServices, setAppointmentServices] = useState<AppointmentService[]>([])
  const [activeTab, setActiveTab] = useState<'detalles' | 'servicios'>('detalles')
  const [medicalRecordId, setMedicalRecordId] = useState<string | null>(null)
  const [quotationInfo, setQuotationInfo] = useState<{ id: string; medicalRecordId: string; total: number; itemCount: number } | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)

  // Use local status if updated, otherwise use event status
  const displayStatus = currentStatus ?? event?.extendedProps.estado ?? 'programada'

  // Check if services section should be shown
  const showServicesSection = SERVICE_ENABLED_STATES.includes(displayStatus) && services.length > 0

  // Check if medical record can be created
  const canCreateMedicalRecord = MEDICAL_RECORD_ENABLED_STATES.includes(displayStatus)

  // Get available transitions for current status
  const availableTransitions = getAvailableTransitions(displayStatus)

  // Fetch appointment services when dialog opens or status changes
  useEffect(() => {
    if (open && event && showServicesSection) {
      getAppointmentServices(event.extendedProps.appointmentId).then((data) => {
        setAppointmentServices(data as AppointmentService[])
      })
    }
  }, [open, event, showServicesSection])

  // Check if medical record exists for this appointment
  useEffect(() => {
    if (open && event && canCreateMedicalRecord) {
      getMedicalRecordIdByAppointment(event.extendedProps.appointmentId).then((result) => {
        setMedicalRecordId(result?.id || null)
      })
    }
  }, [open, event, canCreateMedicalRecord])

  // Check if quotation exists for this appointment
  useEffect(() => {
    if (open && event && canCreateMedicalRecord) {
      getQuotationInfoByAppointment(event.extendedProps.appointmentId).then((result) => {
        setQuotationInfo(result)
      })
    }
  }, [open, event, canCreateMedicalRecord])

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
        setAppointmentServices([])
        setActiveTab('detalles')
        setMedicalRecordId(null)
        setQuotationInfo(null)
        setEditDialogOpen(false)
      }
      onOpenChange(newOpen)
    },
    [onOpenChange]
  )

  // Handle edit success - close dialogs and refresh
  const handleEditSuccess = useCallback(() => {
    setEditDialogOpen(false)
    onStatusUpdate?.()
  }, [onStatusUpdate])

  if (!event) return null

  const { extendedProps } = event
  const startDate = new Date(event.start)
  const endDate = new Date(event.end)

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={showServicesSection ? 'sm:max-w-xl' : 'sm:max-w-lg'}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span>{extendedProps.patientName}</span>
            <StatusBadge status={displayStatus} size="sm" />
          </DialogTitle>
          <DialogDescription>
            Cedula: {extendedProps.patientCedula}
          </DialogDescription>
        </DialogHeader>

        {showServicesSection ? (
          /* Tabbed view when services are available */
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'detalles' | 'servicios')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="detalles">Detalles</TabsTrigger>
              <TabsTrigger value="servicios">
                Servicios
                {appointmentServices.length > 0 && (
                  <span className="ml-1 text-xs bg-primary/20 text-primary rounded-full px-1.5">
                    {appointmentServices.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="detalles" className="mt-4">
              <div className="space-y-4">
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

                {/* Status dropdown */}
                {availableTransitions.length > 0 && (
                  <div className="border-t pt-4">
                    <Label className="text-sm font-medium text-gray-500">Cambiar estado</Label>
                    <Select
                      value=""
                      onValueChange={(value) => handleStatusChange(value as AppointmentStatus)}
                      disabled={isPending}
                    >
                      <SelectTrigger className="w-full mt-2">
                        <SelectValue placeholder="Seleccionar nuevo estado..." />
                      </SelectTrigger>
                      <SelectContent>
                        {availableTransitions.map((status) => (
                          <SelectItem key={status} value={status}>
                            {STATUS_LABELS[status]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="servicios" className="mt-4">
              <AppointmentServicesForm
                appointmentId={extendedProps.appointmentId}
                patientId={extendedProps.patientId}
                services={services}
                initialServices={appointmentServices}
                disabled={isPending}
              />
            </TabsContent>
          </Tabs>
        ) : (
          /* Simple view without tabs */
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

            {/* Status dropdown */}
            {availableTransitions.length > 0 && (
              <div className="border-t pt-4">
                <Label className="text-sm font-medium text-gray-500">Cambiar estado</Label>
                <Select
                  value=""
                  onValueChange={(value) => handleStatusChange(value as AppointmentStatus)}
                  disabled={isPending}
                >
                  <SelectTrigger className="w-full mt-2">
                    <SelectValue placeholder="Seleccionar nuevo estado..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTransitions.map((status) => (
                      <SelectItem key={status} value={status}>
                        {STATUS_LABELS[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => setEditDialogOpen(true)}
          >
            Editar Cita
          </Button>
          {quotationInfo && (
            <Button
              variant="outline"
              onClick={() => {
                handleOpenChange(false)
                router.push(`/historias/${quotationInfo.medicalRecordId}/cotizacion`)
              }}
            >
              <Receipt className="mr-2 h-4 w-4" />
              Ver Cotizacion
            </Button>
          )}
          {canCreateMedicalRecord && (
            medicalRecordId ? (
              <Button
                variant="default"
                onClick={() => {
                  handleOpenChange(false)
                  router.push(`/historias/${medicalRecordId}`)
                }}
              >
                Ver Historia Clinica
              </Button>
            ) : (
              <Button
                variant="default"
                onClick={() => {
                  handleOpenChange(false)
                  router.push(`/historias/nueva?appointment_id=${extendedProps.appointmentId}`)
                }}
              >
                Crear Historia Clinica
              </Button>
            )
          )}
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Edit Appointment Dialog */}
      <EditAppointmentDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        appointment={{
          appointmentId: extendedProps.appointmentId,
          patientId: extendedProps.patientId,
          doctorId: extendedProps.doctorId,
          start: typeof event.start === 'string' ? event.start : event.start.toISOString(),
          end: typeof event.end === 'string' ? event.end : event.end.toISOString(),
          motivoConsulta: extendedProps.motivoConsulta,
          notas: extendedProps.notas,
        }}
        onSuccess={handleEditSuccess}
      />
    </Dialog>
  )
}

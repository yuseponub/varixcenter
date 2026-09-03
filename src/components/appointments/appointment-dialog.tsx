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
import { Input } from '@/components/ui/input'
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
import {
  assignPatientCedula,
  deleteDuplicateAppointment,
  updateAppointmentStatus,
} from '@/app/(protected)/citas/actions'
import { getAppointmentServices } from '@/app/(protected)/citas/service-actions'
import { getMedicalRecordIdByAppointment, getQuotationInfoByAppointment } from '@/app/(protected)/historias/actions'
import { EditAppointmentDialog } from '@/components/appointments/edit-appointment-dialog'
import { Loader2, Receipt, Trash2 } from 'lucide-react'
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
  /**
   * Otra cita viva de la misma persona el mismo dia (la que se conservaria).
   * Solo con ella presente se ofrece "Borrar cita repetida".
   */
  duplicateOf?: CalendarEvent | null
}

/** States where services can be added/viewed */
const SERVICE_ENABLED_STATES: AppointmentStatus[] = ['en_atencion', 'completada']

/** States where medical record can be created */
const MEDICAL_RECORD_ENABLED_STATES: AppointmentStatus[] = ['en_atencion', 'completada']

/**
 * Opciones de confirmación (dropdown independiente).
 * "Sin confirmar" es seleccionable a proposito: cancelar una cita por error
 * tiene que poder deshacerse y dejarla como estaba, no solo pasarla a
 * confirmada.
 */
const CONFIRM_OPTIONS: { value: AppointmentStatus; label: string }[] = [
  { value: 'programada', label: 'Sin confirmar' },
  { value: 'confirmada', label: 'Confirmada' },
  { value: 'cancelada', label: 'Cancelada / Reagendada' },
]

/** Opciones de asistencia (botones). */
const ATTENDANCE_OPTIONS: { value: AppointmentStatus; label: string }[] = [
  { value: 'completada', label: 'Asistió' },
  { value: 'no_asistio', label: 'No asistió' },
]

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
  duplicateOf = null,
}: AppointmentDialogProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [currentStatus, setCurrentStatus] = useState<AppointmentStatus | null>(null)
  // Cedula asignada desde la cita (paciente registrado sin cedula).
  const [cedulaInput, setCedulaInput] = useState('')
  const [cedulaSaving, setCedulaSaving] = useState(false)
  const [cedulaSaved, setCedulaSaved] = useState<string | null>(null)
  // Borrado de cita repetida: pide confirmacion dentro del mismo dialogo.
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
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
        setCedulaInput('')
        setCedulaSaved(null)
        setConfirmingDelete(false)
      }
      onOpenChange(newOpen)
    },
    [onOpenChange]
  )

  /** Guarda la cedula del paciente sin pasar por "Editar cita". */
  const handleSaveCedula = useCallback(async () => {
    if (!event) return
    const cedula = cedulaInput.trim()
    if (!/^\d{6,10}$/.test(cedula)) {
      toast.error('La cedula debe tener entre 6 y 10 digitos')
      return
    }
    setCedulaSaving(true)
    const result = await assignPatientCedula(event.extendedProps.patientId, cedula)
    setCedulaSaving(false)
    if (result.success) {
      setCedulaSaved(cedula)
      setCedulaInput('')
      toast.success('Cedula guardada. Ya se puede buscar al paciente por cedula en pagos.')
      onStatusUpdate?.()
    } else {
      toast.error(result.error || 'Error al guardar la cedula')
    }
  }, [event, cedulaInput, onStatusUpdate])

  /** Borra esta cita porque esta repetida; el servidor vuelve a comprobarlo. */
  const handleDeleteDuplicate = useCallback(async () => {
    if (!event) return
    setDeleting(true)
    const result = await deleteDuplicateAppointment(event.extendedProps.appointmentId)
    setDeleting(false)
    if (result.success) {
      toast.success('Cita repetida borrada. Se conserva la otra cita del mismo dia.')
      handleOpenChange(false)
      onStatusUpdate?.()
    } else {
      setConfirmingDelete(false)
      toast.error(result.error || 'Error al borrar la cita')
    }
  }, [event, handleOpenChange, onStatusUpdate])

  // Handle edit success - close dialogs and refresh
  const handleEditSuccess = useCallback(() => {
    setEditDialogOpen(false)
    onStatusUpdate?.()
  }, [onStatusUpdate])

  if (!event) return null

  const { extendedProps } = event
  const startDate = new Date(event.start)
  const endDate = new Date(event.end)
  // La cedula es opcional desde la migracion 041: puede venir vacia.
  const cedula = cedulaSaved || extendedProps.patientCedula || ''
  const motivoItems = [
    ...(extendedProps.servicios ?? []),
    extendedProps.motivoConsulta,
  ].filter(Boolean) as string[]

  /* Motivo y procedimientos: siempre visibles, sin entrar a la pestana Servicios. */
  const motivoSection = (
    <div>
      <h4 className="text-sm font-medium text-muted-foreground mb-1">Motivo / procedimientos</h4>
      {motivoItems.length > 0 ? (
        <ul className="text-sm space-y-0.5">
          {motivoItems.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm italic text-muted-foreground">Sin motivo registrado</p>
      )}
    </div>
  )

  const confirmValue = CONFIRM_OPTIONS.some((o) => o.value === displayStatus)
    ? displayStatus
    : ''

  const statusControls = (
    <div className="border-t pt-4 space-y-3">
      {/* Confirmación (dropdown independiente) */}
      <div>
        <Label className="text-sm font-medium text-muted-foreground">Confirmación</Label>
        <Select
          value={confirmValue}
          onValueChange={(value) => {
            if (value && value !== displayStatus) handleStatusChange(value as AppointmentStatus)
          }}
          disabled={isPending}
        >
          <SelectTrigger className="w-full mt-2">
            <SelectValue placeholder="Sin confirmar…" />
          </SelectTrigger>
          <SelectContent>
            {CONFIRM_OPTIONS.map((o) => (
              <SelectItem
                key={o.value}
                value={o.value}
                disabled={o.value !== displayStatus && !availableTransitions.includes(o.value)}
              >
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Asistencia (botones) */}
      <div>
        <Label className="text-sm font-medium text-muted-foreground">Asistencia</Label>
        <div className="mt-2 flex gap-2">
          {ATTENDANCE_OPTIONS.map((o) => {
            const active = displayStatus === o.value
            const allowed = active || availableTransitions.includes(o.value)
            return (
              <Button
                key={o.value}
                type="button"
                size="sm"
                variant={active ? 'default' : 'outline'}
                disabled={isPending || !allowed}
                onClick={() => {
                  if (!active) handleStatusChange(o.value)
                }}
                className="flex-1"
              >
                {o.label}
              </Button>
            )
          })}
        </div>
      </div>
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={showServicesSection ? 'sm:max-w-xl' : 'sm:max-w-lg'}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span>{extendedProps.patientName}</span>
            <StatusBadge status={displayStatus} size="sm" />
          </DialogTitle>
          <DialogDescription asChild>
            <div>
              {cedula ? (
                <span className="block">Cedula: {cedula}</span>
              ) : (
                /* Paciente sin cedula: se asigna aqui mismo, sin editar la cita,
                   para que el pago lo encuentre por cedula. */
                <span className="flex flex-wrap items-center gap-2">
                  <span>Sin cedula.</span>
                  <Input
                    value={cedulaInput}
                    onChange={(e) => setCedulaInput(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        void handleSaveCedula()
                      }
                    }}
                    placeholder="Cedula (6-10 digitos)"
                    inputMode="numeric"
                    aria-label="Cedula del paciente"
                    className="h-8 w-[170px]"
                    disabled={cedulaSaving}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => void handleSaveCedula()}
                    disabled={cedulaSaving || cedulaInput.length < 6}
                  >
                    {cedulaSaving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                    Guardar cedula
                  </Button>
                </span>
              )}
              {/* Telefono debajo de la cedula, listo para llamar */}
              {extendedProps.patientCelular && (
                <a
                  href={`tel:${extendedProps.patientCelular}`}
                  className="block text-primary hover:underline"
                >
                  Tel: {extendedProps.patientCelular}
                </a>
              )}
            </div>
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
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">Fecha y hora</h4>
                  <p className="text-sm capitalize">
                    {dateTimeFormatter.format(startDate)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {timeFormatter.format(startDate)} - {timeFormatter.format(endDate)}
                  </p>
                </div>

                {/* Contact */}
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">Telefono</h4>
                  <p className="text-sm">
                    <a
                      href={`tel:${extendedProps.patientCelular}`}
                      className="text-primary hover:underline"
                    >
                      {extendedProps.patientCelular}
                    </a>
                  </p>
                </div>

                {motivoSection}

                {/* Notes */}
                {extendedProps.notas && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">Notas</h4>
                    <p className="text-sm text-muted-foreground">{extendedProps.notas}</p>
                  </div>
                )}

                {/* Controles de estado: Confirmación + Asistencia */}
                {statusControls}
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
              <h4 className="text-sm font-medium text-muted-foreground mb-1">Fecha y hora</h4>
              <p className="text-sm capitalize">
                {dateTimeFormatter.format(startDate)}
              </p>
              <p className="text-sm text-muted-foreground">
                {timeFormatter.format(startDate)} - {timeFormatter.format(endDate)}
              </p>
            </div>

            {/* Contact */}
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-1">Telefono</h4>
              <p className="text-sm">
                <a
                  href={`tel:${extendedProps.patientCelular}`}
                  className="text-primary hover:underline"
                >
                  {extendedProps.patientCelular}
                </a>
              </p>
            </div>

            {motivoSection}

            {/* Notes */}
            {extendedProps.notas && (
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-1">Notas</h4>
                <p className="text-sm text-muted-foreground">{extendedProps.notas}</p>
              </div>
            )}

            {/* Controles de estado: Confirmación + Asistencia */}
            {statusControls}
          </div>
        )}

        {/* Cita repetida: otra cita viva de la misma persona ese dia. Cualquier
            rol puede borrar esta copia; el servidor exige que siga repetida. */}
        {duplicateOf && (
          <div className="rounded-md border border-destructive/40 bg-destructive-soft/40 p-3 text-sm space-y-2">
            <p>
              <span className="font-medium">Cita repetida.</span> Esta persona tiene otra cita
              ese día a las {timeFormatter.format(new Date(duplicateOf.start))} (
              {STATUS_LABELS[duplicateOf.extendedProps.estado] ?? duplicateOf.extendedProps.estado}
              ).
            </p>
            {confirmingDelete ? (
              <div className="flex flex-wrap items-center gap-2">
                <span>¿Borrar esta cita y conservar la otra?</span>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() => void handleDeleteDuplicate()}
                  disabled={deleting}
                >
                  {deleting ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                  )}
                  Sí, borrar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={deleting}
                >
                  No
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-destructive/60 text-destructive hover:bg-destructive-soft"
                onClick={() => setConfirmingDelete(true)}
                disabled={isPending}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                Borrar cita repetida
              </Button>
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
          patientName: extendedProps.patientName,
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

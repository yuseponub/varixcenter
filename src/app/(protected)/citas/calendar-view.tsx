'use client'

/**
 * Calendar View Component
 *
 * Client component that handles calendar interactions:
 * - Doctor filtering (APT-02)
 * - Event click -> detail dialog
 * - Date select -> navigate to new appointment
 * - Event drop -> reschedule appointment
 *
 * Uses sonner for toast notifications.
 */

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { EventClickArg, DateSelectArg, EventDropArg, DatesSetArg } from '@fullcalendar/core'
import { AppointmentCalendar } from '@/components/appointments/appointment-calendar'
import { AppointmentDialog } from '@/components/appointments/appointment-dialog'
import { OutlookEventDialog } from '@/components/appointments/outlook-event-dialog'
import { DoctorFilter } from '@/components/appointments/doctor-filter'
import { AppointmentSearch } from '@/components/appointments/appointment-search'
import { Button } from '@/components/ui/button'
import { rescheduleAppointment } from '@/app/(protected)/citas/actions'
import type { CalendarEvent, Doctor } from '@/types/appointments'
import type { OutlookSyncStatus } from '@/types/outlook'
import type { ServiceOption } from '@/types/services'

const syncTimeFormatter = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'America/Bogota',
})

/**
 * Props for CalendarView component
 */
interface CalendarViewProps {
  /** List of doctors for filter dropdown */
  doctors: Doctor[]
  /** Initial events to display */
  initialEvents: CalendarEvent[]
  /** Initial start date for the calendar view */
  initialStart: string
  /** Initial end date for the calendar view */
  initialEnd: string
  /** Services catalog for adding to appointments */
  services?: ServiceOption[]
  initialOutlookStatus: OutlookSyncStatus
  initialOutlookNotice?: string
}

/**
 * Calendar view with filtering, dialog, and drag-drop support.
 *
 * Features:
 * - Doctor filter dropdown (APT-02)
 * - Click event -> opens detail dialog
 * - Select date range -> navigates to new appointment form
 * - Drag-drop event -> reschedules appointment
 * - Toast notifications for all actions
 */
export function CalendarView({
  doctors,
  initialEvents,
  initialStart,
  initialEnd,
  services = [],
  initialOutlookStatus,
  initialOutlookNotice,
}: CalendarViewProps) {
  const router = useRouter()

  // State for events and filtering
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents)
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('all')
  const [dateRange, setDateRange] = useState({ start: initialStart, end: initialEnd })
  const [isLoading, setIsLoading] = useState(false)
  const [outlookStatus, setOutlookStatus] = useState(initialOutlookStatus)

  // State for detail dialog
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => {
    if (!initialOutlookNotice) return

    if (initialOutlookNotice === 'connected') {
      toast.success('Outlook conectado. La primera sincronización está en curso.')
    } else if (initialOutlookNotice === 'denied') {
      toast.info('La autorización de Outlook fue cancelada.')
    } else if (initialOutlookNotice === 'forbidden') {
      toast.error('Solo un administrador puede conectar Outlook.')
    } else {
      toast.error('No se pudo conectar Outlook. Intente autorizarlo nuevamente.')
    }
    window.history.replaceState(null, '', '/citas')
  }, [initialOutlookNotice])

  /**
   * Fetch events when doctor filter or date range changes.
   */
  const fetchEvents = useCallback(async (background = false) => {
    if (!background) setIsLoading(true)

    try {
      // Build query params
      const params = new URLSearchParams({
        start: dateRange.start,
        end: dateRange.end,
      })
      if (selectedDoctorId !== 'all') {
        params.set('doctor_id', selectedDoctorId)
      }

      // Fetch from API route
      const response = await fetch(`/citas/api?${params}`, { cache: 'no-store' })

      if (!response.ok) {
        throw new Error('Error al cargar las citas')
      }

      const data = await response.json()
      setEvents(data.events)
      if (data.outlookStatus) setOutlookStatus(data.outlookStatus)
    } catch (error) {
      console.error('Error fetching events:', error)
      if (!background) toast.error('Error al cargar las citas')
    } finally {
      if (!background) setIsLoading(false)
    }
  }, [dateRange, selectedDoctorId])

  // Fetch events when filter changes
  useEffect(() => {
    void fetchEvents()
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void fetchEvents(true)
    }
    const interval = window.setInterval(() => {
      refreshWhenVisible()
    }, 30_000)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [fetchEvents])

  /**
   * Handle doctor filter change.
   */
  const handleDoctorChange = useCallback((doctorId: string) => {
    setSelectedDoctorId(doctorId)
  }, [])

  /**
   * Handle calendar date range change (when user navigates).
   */
  const handleDatesSet = useCallback((info: DatesSetArg) => {
    const newStart = info.start.toISOString()
    const newEnd = info.end.toISOString()

    // Only update if range actually changed
    if (newStart !== dateRange.start || newEnd !== dateRange.end) {
      setDateRange({ start: newStart, end: newEnd })
    }
  }, [dateRange])

  /**
   * Handle event click -> open detail dialog.
   */
  const handleEventClick = useCallback((info: EventClickArg) => {
    // Find the full event data from our events array
    const event = events.find(e => e.id === info.event.id)
    if (event) {
      setSelectedEvent(event)
      setDialogOpen(true)
    }
  }, [events])

  /**
   * Handle date selection -> navigate to new appointment form.
   * Pre-fills the selected time range.
   */
  const handleDateSelect = useCallback((info: DateSelectArg) => {
    const params = new URLSearchParams({
      start: info.start.toISOString(),
      end: info.end.toISOString(),
    })

    // Pre-select doctor if filtered
    if (selectedDoctorId !== 'all') {
      params.set('doctor', selectedDoctorId)
    }

    router.push(`/citas/nueva?${params}`)
  }, [router, selectedDoctorId])

  /**
   * Handle event drop (drag-drop reschedule).
   */
  const handleEventDrop = useCallback(async (info: EventDropArg) => {
    const { event, revert } = info
    if (event.extendedProps.source === 'outlook') {
      toast.info('Esta cita se reprograma desde Outlook')
      revert()
      return
    }
    const appointmentId = event.extendedProps.appointmentId

    // Get new times
    const newStart = event.start?.toISOString()
    const newEnd = event.end?.toISOString()

    if (!newStart || !newEnd) {
      revert()
      return
    }

    // Optimistic update already applied by FullCalendar
    // Call server action
    const result = await rescheduleAppointment(appointmentId, newStart, newEnd)

    if (result.success) {
      toast.success('Cita reprogramada exitosamente')
      // Update local events
      setEvents(prev => prev.map(e =>
        e.id === event.id
          ? { ...e, start: newStart, end: newEnd }
          : e
      ))
    } else {
      toast.error(result.error || 'Error al reprogramar la cita')
      // Revert the drag
      revert()
    }
  }, [])

  /**
   * Handle status update from dialog -> refresh events.
   */
  const handleStatusUpdate = useCallback(() => {
    void fetchEvents()
  }, [fetchEvents])

  const outlookStatusLabel = (() => {
    if (!outlookStatus.enabled) return 'Outlook desactivado'
    if (!outlookStatus.configured) return 'Outlook pendiente de configurar'
    if (outlookStatus.auth_mode === 'delegated' && !outlookStatus.authorized) {
      return 'Outlook requiere autorización'
    }
    if (outlookStatus.last_sync_ok === false) return 'Outlook con error de sincronización'
    if (!outlookStatus.last_synced_at) return 'Outlook preparando primera sincronización'
    return `Outlook sincronizado ${syncTimeFormatter.format(new Date(outlookStatus.last_synced_at))}`
  })()

  /**
   * Handle search result selection.
   * Navigates to the appointment's week and opens the dialog.
   */
  const handleSearchSelect = useCallback((appointment: {
    id: string
    fecha_hora_inicio: string
    fecha_hora_fin: string
    estado: string
    motivo_consulta: string | null
    patient: { nombre: string; apellido: string; cedula: string; celular: string | null }
    doctor: { nombre: string | null; apellido: string | null; email: string }
  }) => {
    // Create a CalendarEvent from search result
    const calendarEvent: CalendarEvent = {
      id: appointment.id,
      title: `${appointment.patient.nombre} ${appointment.patient.apellido}`,
      start: appointment.fecha_hora_inicio,
      end: appointment.fecha_hora_fin,
      extendedProps: {
        source: 'varix',
        appointmentId: appointment.id,
        patientId: '', // Not needed for dialog display
        patientName: `${appointment.patient.nombre} ${appointment.patient.apellido}`,
        patientCedula: appointment.patient.cedula,
        patientCelular: appointment.patient.celular || '',
        doctorId: '', // Not needed for dialog display
        estado: appointment.estado as CalendarEvent['extendedProps']['estado'],
        motivoConsulta: appointment.motivo_consulta,
        notas: null,
      },
    }

    // Update date range to show the appointment's week
    const appointmentDate = new Date(appointment.fecha_hora_inicio)
    const startOfWeek = new Date(appointmentDate)
    const dayOfWeek = appointmentDate.getDay()
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    startOfWeek.setDate(appointmentDate.getDate() - daysFromMonday)
    startOfWeek.setHours(0, 0, 0, 0)

    const endOfWeek = new Date(startOfWeek)
    endOfWeek.setDate(startOfWeek.getDate() + 7)

    setDateRange({
      start: startOfWeek.toISOString(),
      end: endOfWeek.toISOString(),
    })

    // Open the dialog with the selected event
    setSelectedEvent(calendarEvent)
    setDialogOpen(true)
  }, [])

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <DoctorFilter
            doctors={doctors}
            value={selectedDoctorId}
            onValueChange={handleDoctorChange}
            disabled={isLoading}
            className="w-64"
          />
          <AppointmentSearch onSelect={handleSearchSelect} />
        </div>

        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-primary" />
            Cargando...
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-primary" /> Varix
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[oklch(0.45_0.12_210)]" /> Outlook
        </span>
        <span>Actualización automática cada 30 segundos</span>
        <span
          title={outlookStatus.last_error ?? undefined}
          className={
            outlookStatus.auth_mode === 'delegated' && !outlookStatus.authorized
              ? 'rounded-full bg-warning px-2 py-1 font-semibold text-warning-foreground'
              : outlookStatus.last_sync_ok === false
              ? 'rounded-full bg-destructive-soft px-2 py-1 font-semibold text-destructive'
              : outlookStatus.last_sync_ok
                ? 'rounded-full bg-success px-2 py-1 font-semibold text-success-foreground'
                : 'rounded-full bg-neutral-badge px-2 py-1 font-semibold text-neutral-badge-foreground'
          }
        >
          {outlookStatusLabel}
        </span>
        {outlookStatus.can_manage &&
          outlookStatus.configured &&
          outlookStatus.enabled &&
          outlookStatus.auth_mode === 'delegated' &&
          (!outlookStatus.authorized || outlookStatus.last_sync_ok === false) && (
            <Button asChild variant="outline" size="xs">
              <a href="/api/integrations/outlook/connect">
                {outlookStatus.authorized ? 'Reautorizar Outlook' : 'Conectar Outlook'}
              </a>
            </Button>
          )}
      </div>

      {/* Calendar */}
      <div className="h-[calc(100vh-240px)] min-h-[500px] overflow-auto rounded-xl bg-card shadow-card">
        <AppointmentCalendar
          events={events}
          onEventClick={handleEventClick}
          onDateSelect={handleDateSelect}
          onEventDrop={handleEventDrop}
          onDatesSet={handleDatesSet}
          editable={true}
        />
      </div>

      {/* Detail Dialog */}
      <AppointmentDialog
        event={selectedEvent?.extendedProps.source === 'varix' ? selectedEvent : null}
        open={dialogOpen && selectedEvent?.extendedProps.source === 'varix'}
        onOpenChange={setDialogOpen}
        onStatusUpdate={handleStatusUpdate}
        services={services}
      />
      <OutlookEventDialog
        event={selectedEvent?.extendedProps.source === 'outlook' ? selectedEvent : null}
        open={dialogOpen && selectedEvent?.extendedProps.source === 'outlook'}
        onOpenChange={setDialogOpen}
      />
    </div>
  )
}

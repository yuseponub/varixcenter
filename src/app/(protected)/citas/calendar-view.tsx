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
import { DoctorFilter } from '@/components/appointments/doctor-filter'
import { rescheduleAppointment } from '@/app/(protected)/citas/actions'
import type { CalendarEvent, Doctor } from '@/types/appointments'
import type { ServiceOption } from '@/types/services'

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
}: CalendarViewProps) {
  const router = useRouter()

  // State for events and filtering
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents)
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('all')
  const [dateRange, setDateRange] = useState({ start: initialStart, end: initialEnd })
  const [isLoading, setIsLoading] = useState(false)

  // State for detail dialog
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  /**
   * Fetch events when doctor filter or date range changes.
   */
  const fetchEvents = useCallback(async () => {
    setIsLoading(true)

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
      const response = await fetch(`/citas/api?${params}`)

      if (!response.ok) {
        throw new Error('Error al cargar las citas')
      }

      const data = await response.json()
      setEvents(data.events)
    } catch (error) {
      console.error('Error fetching events:', error)
      toast.error('Error al cargar las citas')
    } finally {
      setIsLoading(false)
    }
  }, [dateRange, selectedDoctorId])

  // Fetch events when filter changes
  useEffect(() => {
    fetchEvents()
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
    fetchEvents()
  }, [fetchEvents])

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <DoctorFilter
          doctors={doctors}
          value={selectedDoctorId}
          onValueChange={handleDoctorChange}
          disabled={isLoading}
          className="w-64"
        />

        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
            Cargando...
          </div>
        )}
      </div>

      {/* Calendar */}
      <div className="h-[calc(100vh-220px)] min-h-[500px]">
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
        event={selectedEvent}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onStatusUpdate={handleStatusUpdate}
        services={services}
      />
    </div>
  )
}

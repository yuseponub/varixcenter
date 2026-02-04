'use client'

/**
 * Appointment Calendar Component
 *
 * FullCalendar wrapper for appointment management.
 * Provides day and week views with Spanish locale and drag-drop support.
 *
 * APT-01: Calendar displays appointments in day and week views
 */

import { useRef, useCallback } from 'react'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import esLocale from '@fullcalendar/core/locales/es'
import type { EventClickArg, DateSelectArg, EventDropArg, DatesSetArg } from '@fullcalendar/core'
import type { CalendarEvent } from '@/types/appointments'

/**
 * Props for AppointmentCalendar component
 */
interface AppointmentCalendarProps {
  /** Calendar events to display */
  events: CalendarEvent[]
  /** Callback when an event is clicked */
  onEventClick?: (info: EventClickArg) => void
  /** Callback when a date range is selected (for creating new appointments) */
  onDateSelect?: (info: DateSelectArg) => void
  /** Callback when an event is dragged to a new time */
  onEventDrop?: (info: EventDropArg) => void
  /** Callback when the visible date range changes */
  onDatesSet?: (info: DatesSetArg) => void
  /** Initial view (defaults to timeGridWeek) */
  initialView?: 'timeGridDay' | 'timeGridWeek' | 'listWeek' | 'listDay'
  /** Initial date to display */
  initialDate?: Date | string
  /** Whether events are editable (draggable) */
  editable?: boolean
}

/**
 * FullCalendar wrapper optimized for appointment scheduling.
 *
 * Features:
 * - Day and week views (timeGrid)
 * - Spanish locale
 * - Drag-drop with 300ms long press (mobile-friendly)
 * - Business hours 8am-6pm
 * - Sunday hidden
 */
export function AppointmentCalendar({
  events,
  onEventClick,
  onDateSelect,
  onEventDrop,
  onDatesSet,
  initialView = 'timeGridWeek',
  initialDate,
  editable = true,
}: AppointmentCalendarProps) {
  const calendarRef = useRef<FullCalendar>(null)

  // Track current view mode (list or calendar) and range (week or day)
  const getCurrentRange = useCallback(() => {
    const api = calendarRef.current?.getApi()
    const viewType = api?.view.type || initialView
    return viewType.includes('Week') ? 'week' : 'day'
  }, [initialView])

  const isListView = useCallback(() => {
    const api = calendarRef.current?.getApi()
    const viewType = api?.view.type || initialView
    return viewType.startsWith('list')
  }, [initialView])

  // Switch to list view keeping current range
  const switchToList = useCallback(() => {
    const api = calendarRef.current?.getApi()
    if (!api) return
    const range = getCurrentRange()
    api.changeView(range === 'week' ? 'listWeek' : 'listDay')
  }, [getCurrentRange])

  // Switch to calendar view keeping current range
  const switchToCalendar = useCallback(() => {
    const api = calendarRef.current?.getApi()
    if (!api) return
    const range = getCurrentRange()
    api.changeView(range === 'week' ? 'timeGridWeek' : 'timeGridDay')
  }, [getCurrentRange])

  // Switch to week view keeping current mode
  const switchToWeek = useCallback(() => {
    const api = calendarRef.current?.getApi()
    if (!api) return
    const isList = isListView()
    api.changeView(isList ? 'listWeek' : 'timeGridWeek')
  }, [isListView])

  // Switch to day view keeping current mode
  const switchToDay = useCallback(() => {
    const api = calendarRef.current?.getApi()
    if (!api) return
    const isList = isListView()
    api.changeView(isList ? 'listDay' : 'timeGridDay')
  }, [isListView])

  // Memoized event handlers to prevent unnecessary re-renders
  const handleEventClick = useCallback(
    (info: EventClickArg) => {
      onEventClick?.(info)
    },
    [onEventClick]
  )

  const handleDateSelect = useCallback(
    (info: DateSelectArg) => {
      onDateSelect?.(info)
    },
    [onDateSelect]
  )

  const handleEventDrop = useCallback(
    (info: EventDropArg) => {
      onEventDrop?.(info)
    },
    [onEventDrop]
  )

  const handleDatesSet = useCallback(
    (info: DatesSetArg) => {
      onDatesSet?.(info)
    },
    [onDatesSet]
  )

  return (
    <div className="appointment-calendar h-full">
      <FullCalendar
        ref={calendarRef}
        plugins={[timeGridPlugin, listPlugin, interactionPlugin]}
        initialView={initialView}
        initialDate={initialDate}
        locale={esLocale}
        events={events}
        // Custom buttons for simplified navigation
        customButtons={{
          listViewBtn: {
            text: 'Lista',
            click: switchToList,
          },
          calendarViewBtn: {
            text: 'Calendario',
            click: switchToCalendar,
          },
          weekBtn: {
            text: 'Semana',
            click: switchToWeek,
          },
          dayBtn: {
            text: 'Día',
            click: switchToDay,
          },
        }}
        // View configuration
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: 'listViewBtn,calendarViewBtn weekBtn,dayBtn',
        }}
        // Custom button labels in Spanish
        buttonText={{
          today: 'Hoy',
        }}
        // Time configuration - Extended hours with larger slots
        slotMinTime="07:00:00"
        slotMaxTime="20:00:00"
        slotDuration="00:15:00"
        slotLabelInterval="01:00:00"
        // Business hours (visual indicator)
        businessHours={{
          daysOfWeek: [1, 2, 3, 4, 5, 6], // Monday to Saturday
          startTime: '08:00',
          endTime: '18:00',
        }}
        // Hide Sunday
        hiddenDays={[0]}
        // Event interaction
        editable={editable}
        selectable={true}
        selectMirror={true}
        longPressDelay={300} // 300ms long press for mobile drag
        eventDurationEditable={false} // Only move, don't resize
        // Event handlers
        eventClick={handleEventClick}
        select={handleDateSelect}
        eventDrop={handleEventDrop}
        datesSet={handleDatesSet}
        // Display options
        allDaySlot={false}
        nowIndicator={true}
        dayMaxEvents={true}
        weekNumbers={false}
        // Height - auto allows scrolling within container
        height="auto"
        contentHeight={700}
        // Ensure week starts on Monday
        firstDay={1}
      />
    </div>
  )
}

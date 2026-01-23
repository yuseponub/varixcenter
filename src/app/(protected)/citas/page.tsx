import Link from 'next/link'
import { getDoctors, getAppointmentsForCalendar } from '@/lib/queries/appointments'
import { CalendarView } from './calendar-view'
import { Button } from '@/components/ui/button'

/**
 * Calendar Page (Server Component)
 *
 * Main appointment calendar view for the clinic.
 * - Fetches doctors list for filter
 * - Fetches initial appointments for current week
 * - Renders CalendarView client component
 *
 * APT-01: Calendar displays appointments in day and week views
 * APT-02: Doctor filter dropdown shows available medicos
 */
export default async function CitasPage() {
  // Get current week range for initial load
  const now = new Date()
  const startOfWeek = new Date(now)
  const dayOfWeek = now.getDay()
  // Adjust to Monday (day 1), handle Sunday (day 0)
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  startOfWeek.setDate(now.getDate() - daysFromMonday)
  startOfWeek.setHours(0, 0, 0, 0)

  const endOfWeek = new Date(startOfWeek)
  endOfWeek.setDate(startOfWeek.getDate() + 7)
  endOfWeek.setHours(23, 59, 59, 999)

  const startDate = startOfWeek.toISOString()
  const endDate = endOfWeek.toISOString()

  // Fetch doctors and initial events in parallel
  const [doctors, events] = await Promise.all([
    getDoctors(),
    getAppointmentsForCalendar(startDate, endDate),
  ])

  return (
    <div className="container mx-auto py-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Agenda de Citas</h1>
        <Link href="/citas/nueva">
          <Button>Nueva Cita</Button>
        </Link>
      </div>

      {/* Calendar View (client component) */}
      <CalendarView
        doctors={doctors}
        initialEvents={events}
        initialStart={startDate}
        initialEnd={endDate}
      />
    </div>
  )
}

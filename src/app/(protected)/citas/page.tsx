import Link from 'next/link'
import { getDoctors, getAppointmentsForCalendar } from '@/lib/queries/appointments'
import { getActiveServices } from '@/lib/queries/services'
import { getOutlookSyncStatus } from '@/lib/queries/outlook'
import { CalendarView } from './calendar-view'
import { QuickAppointmentBar } from '@/components/appointments/quick-appointment-bar'
import { Button } from '@/components/ui/button'

/**
 * Calendar Page (Server Component)
 *
 * Main appointment calendar view for the clinic.
 * - Fetches doctors list for filter
 * - Fetches initial appointments for current week
 * - Fetches services catalog for adding services to appointments
 * - Renders CalendarView client component
 *
 * APT-01: Calendar displays appointments in day and week views
 * APT-02: Doctor filter dropdown shows available medicos
 * FASE-05: Services can be added to appointments
 */
interface CitasPageProps {
  searchParams: Promise<{ outlook?: string }>
}

export default async function CitasPage({ searchParams }: CitasPageProps) {
  const params = await searchParams
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

  // Fetch doctors, initial events, and services in parallel
  const [doctors, events, services, outlookStatus] = await Promise.all([
    getDoctors(),
    getAppointmentsForCalendar(startDate, endDate),
    getActiveServices(),
    getOutlookSyncStatus(),
  ])

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold">Agenda de Citas</h1>
          <p className="text-[13px] text-muted-foreground">
            Semana, día o lista · arrastra para reprogramar
          </p>
        </div>
        <Link href="/citas/nueva">
          <Button>Nueva Cita</Button>
        </Link>
      </div>

      {/* Cita rapida en un renglon */}
      <QuickAppointmentBar doctors={doctors} services={services} />

      {/* Calendar View (client component) */}
      <CalendarView
        doctors={doctors}
        initialEvents={events}
        initialStart={startDate}
        initialEnd={endDate}
        services={services}
        initialOutlookStatus={outlookStatus}
        initialOutlookNotice={params.outlook}
      />
    </div>
  )
}

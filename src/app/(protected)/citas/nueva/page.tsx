import { searchPatients } from '@/lib/queries/patients'
import { getDoctors } from '@/lib/queries/appointments'
import { AppointmentForm } from '@/components/appointments/appointment-form'

interface NuevaCitaPageProps {
  searchParams: Promise<{
    start?: string
    end?: string
    doctor?: string
  }>
}

/**
 * New Appointment Page
 *
 * Creates a new appointment with:
 * - Patient selection (searchable dropdown)
 * - Doctor selection
 * - Date/time inputs (prefilled from URL params)
 * - Notes and reason
 *
 * URL params (from calendar click):
 * - start: ISO datetime for appointment start
 * - end: ISO datetime for appointment end
 * - doctor: Doctor ID to prefill
 */
export default async function NuevaCitaPage({ searchParams }: NuevaCitaPageProps) {
  const params = await searchParams

  // Fetch data in parallel
  // IMPORTANT: searchPatients takes (query, limit) NOT object
  const [patients, doctors] = await Promise.all([
    searchPatients('', 100), // Empty string = recent patients, limit 100
    getDoctors(),
  ])

  return (
    <div className="container mx-auto py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Nueva Cita</h1>
        <p className="text-muted-foreground">
          Agendar una nueva cita para un paciente
        </p>
      </div>

      <div className="max-w-2xl">
        <AppointmentForm
          patients={patients}
          doctors={doctors}
          defaultValues={{
            start: params.start,
            end: params.end,
            doctor: params.doctor,
          }}
        />
      </div>
    </div>
  )
}

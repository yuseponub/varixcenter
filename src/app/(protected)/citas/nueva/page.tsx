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
 * - Patient selection (API-based search)
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

  // Fetch doctors (patients are searched via API)
  const doctors = await getDoctors()

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

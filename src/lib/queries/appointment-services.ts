import { createClient } from '@/lib/supabase/server'
import type {
  AppointmentService,
  PendingServiceByPatient,
  PendingServicesGroup,
} from '@/types/appointment-services'

/**
 * Get all services for a specific appointment
 *
 * Note: Uses type assertion because appointment_services table is new
 * and Supabase types may not be regenerated yet.
 */
export async function getServicesByAppointment(
  appointmentId: string
): Promise<AppointmentService[]> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('appointment_services')
    .select('*')
    .eq('appointment_id', appointmentId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error fetching appointment services:', error)
    return []
  }

  return (data || []) as AppointmentService[]
}

/**
 * Get all pending (unpaid) services for a patient
 *
 * Note: Uses type assertion because pending_services_by_patient view is new
 * and Supabase types may not be regenerated yet.
 */
export async function getPendingServicesByPatient(
  patientId: string
): Promise<PendingServiceByPatient[]> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('pending_services_by_patient')
    .select('*')
    .eq('patient_id', patientId)
    .order('appointment_date', { ascending: false })

  if (error) {
    console.error('Error fetching pending services:', error)
    return []
  }

  return (data || []) as PendingServiceByPatient[]
}

/**
 * Get pending services grouped by appointment for UI display
 */
export async function getPendingServicesGrouped(
  patientId: string
): Promise<PendingServicesGroup[]> {
  const services = await getPendingServicesByPatient(patientId)

  // Group services by appointment
  const grouped = services.reduce<Record<string, PendingServicesGroup>>(
    (acc, service) => {
      if (!acc[service.appointment_id]) {
        acc[service.appointment_id] = {
          appointment_id: service.appointment_id,
          appointment_date: service.appointment_date,
          services: [],
          total: 0,
        }
      }
      acc[service.appointment_id].services.push(service)
      acc[service.appointment_id].total += service.subtotal
      return acc
    },
    {}
  )

  // Convert to array and sort by date (most recent first)
  return Object.values(grouped).sort(
    (a, b) =>
      new Date(b.appointment_date).getTime() -
      new Date(a.appointment_date).getTime()
  )
}

/**
 * Get single appointment service by ID
 *
 * Note: Uses type assertion because appointment_services table is new.
 */
export async function getAppointmentServiceById(
  id: string
): Promise<AppointmentService | null> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('appointment_services')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    console.error('Error fetching appointment service:', error)
    return null
  }

  return data as AppointmentService | null
}

/**
 * Check if an appointment has any services
 *
 * Note: Uses type assertion because appointment_services table is new.
 */
export async function appointmentHasServices(
  appointmentId: string
): Promise<boolean> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count, error } = await (supabase as any)
    .from('appointment_services')
    .select('*', { count: 'exact', head: true })
    .eq('appointment_id', appointmentId)

  if (error) {
    console.error('Error checking appointment services:', error)
    return false
  }

  return (count || 0) > 0
}

/**
 * Get count of pending services for a patient (for badge display)
 *
 * Note: Uses type assertion because pending_services_by_patient view is new.
 */
export async function getPendingServicesCount(
  patientId: string
): Promise<number> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count, error } = await (supabase as any)
    .from('pending_services_by_patient')
    .select('*', { count: 'exact', head: true })
    .eq('patient_id', patientId)

  if (error) {
    console.error('Error counting pending services:', error)
    return 0
  }

  return count || 0
}

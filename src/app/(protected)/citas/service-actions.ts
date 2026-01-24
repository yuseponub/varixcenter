'use server'

import { createClient } from '@/lib/supabase/server'
import { appointmentServiceSchema, removeAppointmentServiceSchema } from '@/lib/validations/appointment-service'
import { revalidatePath } from 'next/cache'

/**
 * Action state for service actions
 */
export type ServiceActionState = {
  error?: string
  errors?: Record<string, string[]>
  success?: boolean
  data?: { id: string }
}

/**
 * Add a service to an appointment
 *
 * Creates an appointment_service record with snapshot of service details.
 * Called when staff adds a service during or after the appointment.
 */
export async function addServiceToAppointment(
  appointmentId: string,
  serviceId: string,
  cantidad: number,
  precioUnitario: number,
  notas?: string
): Promise<ServiceActionState> {
  const supabase = await createClient()

  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'No autorizado. Por favor inicie sesion.' }
  }

  // Fetch service details for snapshot
  const { data: service, error: serviceError } = await supabase
    .from('services')
    .select('id, nombre, precio_base, precio_variable, precio_minimo, precio_maximo')
    .eq('id', serviceId)
    .single()

  if (serviceError || !service) {
    return { error: 'El servicio seleccionado no existe' }
  }

  // Validate price if service is variable
  if (service.precio_variable) {
    if (service.precio_minimo && precioUnitario < service.precio_minimo) {
      return { error: `El precio no puede ser menor a ${service.precio_minimo}` }
    }
    if (service.precio_maximo && precioUnitario > service.precio_maximo) {
      return { error: `El precio no puede ser mayor a ${service.precio_maximo}` }
    }
  } else {
    // For non-variable services, use the base price
    precioUnitario = service.precio_base
  }

  // Calculate subtotal
  const subtotal = precioUnitario * cantidad

  // Prepare data for validation
  const rawData = {
    appointment_id: appointmentId,
    service_id: serviceId,
    service_name: service.nombre,
    precio_unitario: precioUnitario,
    cantidad,
    subtotal,
    notas: notas || null,
  }

  // Validate with Zod
  const validated = appointmentServiceSchema.safeParse(rawData)

  if (!validated.success) {
    return {
      errors: validated.error.flatten().fieldErrors as Record<string, string[]>,
      error: 'Por favor corrija los errores',
    }
  }

  // Insert appointment service
  // Note: Uses type assertion because appointment_services table is new
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('appointment_services')
    .insert({
      ...validated.data,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error) {
    console.error('Add service error:', error)

    // Handle foreign key violations
    if (error.code === '23503') {
      if (error.message?.includes('appointment_id')) {
        return { error: 'La cita no existe' }
      }
      if (error.message?.includes('service_id')) {
        return { error: 'El servicio no existe' }
      }
    }

    return { error: 'Error al agregar el servicio. Por favor intente de nuevo.' }
  }

  // Revalidate pages
  revalidatePath('/citas')
  revalidatePath('/pagos')

  return { success: true, data: { id: data?.id as string } }
}

/**
 * Remove a service from an appointment
 *
 * Only allowed for pending (unpaid) services.
 * Paid services cannot be removed.
 */
export async function removeServiceFromAppointment(
  appointmentServiceId: string
): Promise<ServiceActionState> {
  const supabase = await createClient()

  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'No autorizado. Por favor inicie sesion.' }
  }

  // Validate input
  const validated = removeAppointmentServiceSchema.safeParse({
    appointment_service_id: appointmentServiceId,
  })

  if (!validated.success) {
    return {
      errors: validated.error.flatten().fieldErrors as Record<string, string[]>,
      error: 'ID de servicio invalido',
    }
  }

  // Check if the service is already paid
  // Note: Uses type assertion because appointment_services table is new
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingService, error: fetchError } = await (supabase as any)
    .from('appointment_services')
    .select('estado_pago')
    .eq('id', appointmentServiceId)
    .single()

  if (fetchError) {
    if (fetchError.code === 'PGRST116') {
      return { error: 'Servicio no encontrado' }
    }
    console.error('Fetch service error:', fetchError)
    return { error: 'Error al verificar el servicio' }
  }

  if (existingService?.estado_pago === 'pagado') {
    return { error: 'No se puede eliminar un servicio que ya fue pagado' }
  }

  // Delete the appointment service
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('appointment_services')
    .delete()
    .eq('id', appointmentServiceId)

  if (error) {
    console.error('Remove service error:', error)
    return { error: 'Error al eliminar el servicio' }
  }

  // Revalidate pages
  revalidatePath('/citas')
  revalidatePath('/pagos')

  return { success: true }
}

/**
 * Get services for an appointment (for client-side use)
 *
 * Note: Uses type assertion because appointment_services table is new.
 */
export async function getAppointmentServices(appointmentId: string) {
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

  return data || []
}

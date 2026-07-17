'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

/**
 * Cita rapida en un renglon (mejora solicitada por la clinica):
 * la secretaria llena un solo renglon (paciente, fecha, hora, duracion,
 * servicio y doctor opcionales) y la cita se crea sola.
 *
 * - Si el paciente no existe, se crea inline con datos minimos
 *   (nombre, apellido, celular; cedula opcional - se completa luego en la ficha).
 * - Si se elige servicio, se agrega a la cita con el precio del catalogo
 *   (snapshot server-side, igual que service-actions.ts).
 */

const quickSchema = z
  .object({
    patient_id: z.string().uuid().optional().or(z.literal('')),
    nuevo_nombre: z.string().trim().max(100).optional().or(z.literal('')),
    nuevo_apellido: z.string().trim().max(100).optional().or(z.literal('')),
    nuevo_celular: z
      .string()
      .regex(/^\d{10}$/, 'El celular debe tener 10 digitos')
      .optional()
      .or(z.literal('')),
    nueva_cedula: z
      .string()
      .regex(/^\d{6,10}$/, 'La cedula debe tener entre 6 y 10 digitos')
      .optional()
      .or(z.literal('')),
    fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha invalida'),
    hora: z.string().regex(/^\d{2}:\d{2}$/, 'Hora invalida'),
    duracion_min: z.coerce.number().int().min(10).max(240).default(30),
    doctor_id: z.string().uuid().optional().or(z.literal('')),
    service_id: z.string().uuid().optional().or(z.literal('')),
    motivo: z.string().trim().max(500).optional().or(z.literal('')),
  })
  .refine(
    (d) => d.patient_id || (d.nuevo_nombre && d.nuevo_apellido),
    'Seleccione un paciente o escriba nombre y apellido para crearlo'
  )

export type QuickCreateResult = {
  success?: boolean
  error?: string
  data?: { appointment_id: string; patient_id: string; created_patient: boolean }
}

export async function quickCreateAppointment(
  input: Record<string, string | number | undefined>
): Promise<QuickCreateResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado. Por favor inicie sesion.' }

  const validated = quickSchema.safeParse(input)
  if (!validated.success) {
    return { error: validated.error.issues[0]?.message ?? 'Datos invalidos' }
  }
  const d = validated.data

  // ==========================================================================
  // 1. Resolver paciente (existente o crearlo inline)
  // ==========================================================================
  let patientId = d.patient_id || ''
  let createdPatient = false

  if (!patientId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: newPatient, error: patientError } = await (supabase as any)
      .from('patients')
      .insert({
        nombre: d.nuevo_nombre,
        apellido: d.nuevo_apellido,
        celular: d.nuevo_celular || null,
        cedula: d.nueva_cedula || null,
        created_by: user.id,
      })
      .select('id')
      .single()

    if (patientError) {
      if (patientError.code === '23505') {
        return { error: 'Ya existe un paciente con esa cedula. Busquelo por nombre o cedula.' }
      }
      console.error('Quick patient creation error:', patientError)
      return { error: 'Error al crear el paciente' }
    }
    patientId = newPatient.id
    createdPatient = true
  }

  // ==========================================================================
  // 2. Crear la cita (Colombia es UTC-5 fijo, sin horario de verano)
  // ==========================================================================
  const inicio = new Date(`${d.fecha}T${d.hora}:00-05:00`)
  const fin = new Date(inicio.getTime() + d.duracion_min * 60_000)

  if (isNaN(inicio.getTime())) return { error: 'Fecha u hora invalida' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: appointment, error: aptError } = await (supabase as any)
    .from('appointments')
    .insert({
      patient_id: patientId,
      doctor_id: d.doctor_id || null,
      fecha_hora_inicio: inicio.toISOString(),
      fecha_hora_fin: fin.toISOString(),
      motivo_consulta: d.motivo || null,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (aptError) {
    if (aptError.code === '23P01') {
      return { error: 'El doctor ya tiene una cita en ese horario. Elija otra hora.' }
    }
    console.error('Quick appointment creation error:', aptError)
    return { error: 'Error al crear la cita' }
  }

  // ==========================================================================
  // 3. Servicio opcional con precio del catalogo (snapshot server-side)
  // ==========================================================================
  if (d.service_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: service } = await (supabase as any)
      .from('services')
      .select('id, nombre, precio_base')
      .eq('id', d.service_id)
      .single()

    if (service) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: svcError } = await (supabase as any)
        .from('appointment_services')
        .insert({
          appointment_id: appointment.id,
          service_id: service.id,
          service_name: service.nombre,
          precio_unitario: service.precio_base,
          cantidad: 1,
          subtotal: service.precio_base,
          created_by: user.id,
        })
      if (svcError) console.error('Quick appointment service error:', svcError)
    }
  }

  revalidatePath('/citas')
  revalidatePath('/pacientes')

  return {
    success: true,
    data: { appointment_id: appointment.id, patient_id: patientId, created_patient: createdPatient },
  }
}

'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { queueOutlookAppointmentSync } from '@/lib/outlook/outbox'

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
    // Varios procedimientos por cita, cada uno con cantidad (ej. 2 sesiones
    // manos/piernas) y precio libre para servicios de precio variable (ECOR).
    servicios: z
      .array(
        z.object({
          service_id: z.string().uuid(),
          cantidad: z.coerce.number().int().min(1).max(50).default(1),
          precio_unitario: z.coerce.number().min(0).optional(),
        })
      )
      .max(10)
      .optional(),
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

export type QuickServiceInput = {
  service_id: string
  cantidad?: number
  precio_unitario?: number
}

export async function quickCreateAppointment(
  input: Record<string, string | number | undefined | QuickServiceInput[]>
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
  // 0. Validar procedimientos ANTES de crear nada (para no dejar citas a
  //    medias si un precio esta fuera del rango del catalogo).
  //    Soporta varios por cita, cantidad por procedimiento y precio libre en
  //    servicios de precio variable (ej. ECOR 250 / ECOR 300).
  // ==========================================================================
  const requested: { service_id: string; cantidad: number; precio_unitario?: number }[] =
    d.servicios && d.servicios.length > 0
      ? d.servicios
      : d.service_id
        ? [{ service_id: d.service_id, cantidad: 1 }]
        : []

  const serviceRows: {
    service_id: string
    service_name: string
    precio_unitario: number
    cantidad: number
    subtotal: number
  }[] = []

  if (requested.length > 0) {
    const ids = [...new Set(requested.map((s) => s.service_id))]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: catalog } = await (supabase as any)
      .from('services')
      .select('id, nombre, precio_base, precio_variable, precio_minimo, precio_maximo')
      .in('id', ids)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const byId = new Map<string, any>((catalog ?? []).map((s: any) => [s.id, s]))

    for (const item of requested) {
      const service = byId.get(item.service_id)
      if (!service) continue

      // Precio: fijo → catalogo; variable → el que digite la secretaria
      // (validado contra el rango del catalogo), o el base si no digita.
      let precio = service.precio_base
      if (service.precio_variable && item.precio_unitario != null && item.precio_unitario > 0) {
        if (service.precio_minimo && item.precio_unitario < service.precio_minimo) {
          return { error: `${service.nombre}: el precio no puede ser menor a ${service.precio_minimo}` }
        }
        if (service.precio_maximo && item.precio_unitario > service.precio_maximo) {
          return { error: `${service.nombre}: el precio no puede ser mayor a ${service.precio_maximo}` }
        }
        precio = item.precio_unitario
      }

      serviceRows.push({
        service_id: service.id,
        service_name: service.nombre,
        precio_unitario: precio,
        cantidad: item.cantidad,
        subtotal: precio * item.cantidad,
      })
    }
  }

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
  // 3. Insertar los procedimientos ya validados en el paso 0
  // ==========================================================================
  if (serviceRows.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: svcError } = await (supabase as any)
      .from('appointment_services')
      .insert(
        serviceRows.map((row) => ({
          appointment_id: appointment.id,
          ...row,
          created_by: user.id,
        }))
      )
    if (svcError) console.error('Quick appointment service error:', svcError)
  }

  await queueOutlookAppointmentSync(supabase, appointment.id)
  revalidatePath('/citas')
  revalidatePath('/pacientes')

  return {
    success: true,
    data: { appointment_id: appointment.id, patient_id: patientId, created_patient: createdPatient },
  }
}

/**
 * Cita rapida en un renglon (mejora solicitada por la clinica).
 *
 * La secretaria llena un solo renglon (paciente, fecha, hora, duracion,
 * servicio y doctor opcionales) y la cita se crea sola:
 *
 * - Si el paciente no existe, se crea inline con datos minimos
 *   (nombre, apellido, celular; cedula opcional - se completa luego en la ficha).
 * - Si se elige servicio, se agrega a la cita con el precio del catalogo
 *   (snapshot server-side, igual que service-actions.ts).
 *
 * Esta funcion es el nucleo compartido: la usa la ruta POST /citas/api/rapida,
 * que el navegador llama con `keepalive` para que el agendado termine aunque la
 * recepcionista cambie de pagina. Por eso es *idempotente*: el mismo
 * `request_id` nunca crea dos citas (indice unico de la migracion 079).
 */

import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import { queueOutlookAppointmentSync } from '@/lib/outlook/outbox'

/** Ventana en la que un paciente recien creado se reutiliza en vez de duplicarse. */
const PATIENT_DEDUP_WINDOW_MS = 5 * 60_000

export const quickAppointmentSchema = z
  .object({
    /** Identifica el intento de agendado; hace idempotente la creacion. */
    request_id: z.string().uuid().optional(),
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
  /** Aviso no bloqueante (ej. ya hay pacientes en esa franja). */
  warning?: string
  data?: {
    appointment_id: string
    patient_id: string
    created_patient: boolean
    /** true cuando la peticion ya se habia procesado y se devolvio la cita existente. */
    duplicate: boolean
  }
}

export type QuickServiceInput = {
  service_id: string
  cantidad?: number
  precio_unitario?: number
}

export type QuickCreateInput = Record<
  string,
  string | number | undefined | QuickServiceInput[]
>

/**
 * Cuenta las citas activas que se cruzan con el rango dado.
 * Solo alimenta un aviso informativo: desde la migracion 079 el solapamiento
 * ya no bloquea el agendamiento, la agenda apila las citas de la misma franja.
 */
async function countOverlapping(
  // La consulta usa columnas que el tipo generado no expone con `count`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  inicio: Date,
  fin: Date,
  excludeId?: string
): Promise<number> {
  let query = supabase
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .lt('fecha_hora_inicio', fin.toISOString())
    .gt('fecha_hora_fin', inicio.toISOString())
    .not('estado', 'in', '(cancelada,no_asistio)')

  if (excludeId) query = query.neq('id', excludeId)

  const { count, error } = await query
  if (error) {
    console.error('Overlap count error:', error)
    return 0
  }
  return count ?? 0
}

export async function createQuickAppointment(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: QuickCreateInput
): Promise<QuickCreateResult> {
  // Migraciones 079 (request_id) y 052 (doctor opcional) no estan en los tipos
  // generados; este modulo usa el mismo limite estrecho que el resto del modulo.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const validated = quickAppointmentSchema.safeParse(input)
  if (!validated.success) {
    return { error: validated.error.issues[0]?.message ?? 'Datos invalidos' }
  }
  const d = validated.data

  // ==========================================================================
  // 0. Idempotencia: si este intento ya se proceso, devolver la cita existente
  //    en vez de crear otra (doble Enter, reintento o reenvio con keepalive).
  // ==========================================================================
  if (d.request_id) {
    const { data: previous } = await db
      .from('appointments')
      .select('id, patient_id')
      .eq('request_id', d.request_id)
      .maybeSingle()

    if (previous) {
      return {
        success: true,
        data: {
          appointment_id: previous.id,
          patient_id: previous.patient_id,
          created_patient: false,
          duplicate: true,
        },
      }
    }
  }

  // ==========================================================================
  // 1. Validar procedimientos ANTES de crear nada (para no dejar citas a
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
    const { data: catalog } = await db
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
  // 2. Resolver paciente (existente o crearlo inline)
  //
  //    Si el mismo usuario acaba de registrar un paciente con ese nombre, se
  //    reutiliza: asi un doble envio no deja dos fichas del mismo paciente.
  //    La ventana es corta a proposito — dos homonimos registrados en dias
  //    distintos siguen siendo dos pacientes distintos.
  // ==========================================================================
  let patientId = d.patient_id || ''
  let createdPatient = false

  if (!patientId) {
    const { data: recent } = await db
      .from('patients')
      .select('id, nombre, apellido')
      .eq('created_by', userId)
      .gte('created_at', new Date(Date.now() - PATIENT_DEDUP_WINDOW_MS).toISOString())
      .order('created_at', { ascending: false })
      .limit(20)

    const sameName = (a: string, b: string) =>
      a.trim().toLocaleLowerCase('es') === b.trim().toLocaleLowerCase('es')

    const twin = (recent ?? []).find(
      (p: { nombre: string; apellido: string }) =>
        sameName(p.nombre, d.nuevo_nombre ?? '') && sameName(p.apellido, d.nuevo_apellido ?? '')
    )

    if (twin) {
      patientId = twin.id
    } else {
      const { data: newPatient, error: patientError } = await db
        .from('patients')
        .insert({
          nombre: d.nuevo_nombre,
          apellido: d.nuevo_apellido,
          celular: d.nuevo_celular || null,
          cedula: d.nueva_cedula || null,
          created_by: userId,
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
  }

  // ==========================================================================
  // 3. Crear la cita (Colombia es UTC-5 fijo, sin horario de verano)
  // ==========================================================================
  const inicio = new Date(`${d.fecha}T${d.hora}:00-05:00`)
  if (isNaN(inicio.getTime())) return { error: 'Fecha u hora invalida' }
  const fin = new Date(inicio.getTime() + d.duracion_min * 60_000)

  // Segunda linea de defensa contra el doble agendamiento: un mismo paciente
  // no puede tener dos citas que arrancan al mismo instante. Los duplicados
  // reales de la clinica se crearon entre 7 s y 5 min despues del primer envio
  // — mas alla de cualquier ventana razonable del navegador —, asi que el
  // servidor lo corta por identidad de la cita, no por tiempo.
  const { data: existing } = await db
    .from('appointments')
    .select('id')
    .eq('patient_id', patientId)
    .eq('fecha_hora_inicio', inicio.toISOString())
    .neq('estado', 'cancelada')
    .limit(1)
    .maybeSingle()

  if (existing) {
    return {
      success: true,
      data: {
        appointment_id: existing.id,
        patient_id: patientId,
        created_patient: createdPatient,
        duplicate: true,
      },
    }
  }

  const insertData = {
    patient_id: patientId,
    doctor_id: d.doctor_id || null,
    fecha_hora_inicio: inicio.toISOString(),
    fecha_hora_fin: fin.toISOString(),
    motivo_consulta: d.motivo || null,
    created_by: userId,
  }

  let { data: appointment, error: aptError } = await db
    .from('appointments')
    .insert({ ...insertData, request_id: d.request_id ?? null })
    .select('id')
    .single()

  // Permite promover el codigo antes de aplicar la migracion 079 sin dejar la
  // agenda sin agendar: se pierde la idempotencia del servidor, no la cita.
  // (Mismo criterio que la agenda usa con el espejo de Outlook / migracion 065.)
  if (aptError && (aptError.code === '42703' || aptError.code === 'PGRST204')) {
    console.warn('[Citas] appointments.request_id no existe todavia (migracion 079 pendiente)')
    ;({ data: appointment, error: aptError } = await db
      .from('appointments')
      .insert(insertData)
      .select('id')
      .single())
  }

  if (aptError) {
    // Carrera con un envio gemelo: el indice unico de request_id ya guardo la
    // cita. Se devuelve esa misma cita, no un error.
    if (aptError.code === '23505' && d.request_id) {
      const { data: twin } = await db
        .from('appointments')
        .select('id, patient_id')
        .eq('request_id', d.request_id)
        .maybeSingle()

      if (twin) {
        return {
          success: true,
          data: {
            appointment_id: twin.id,
            patient_id: twin.patient_id,
            created_patient: createdPatient,
            duplicate: true,
          },
        }
      }
    }

    // Solo mientras la migracion 079 no este aplicada: hasta entonces la base
    // sigue rechazando dos citas del mismo doctor en la misma franja.
    if (aptError.code === '23P01') {
      return { error: 'El doctor ya tiene una cita en ese horario. Elija otra hora.' }
    }

    console.error('Quick appointment creation error:', aptError)
    return { error: 'Error al crear la cita' }
  }

  // ==========================================================================
  // 4. Insertar los procedimientos ya validados en el paso 1
  // ==========================================================================
  if (serviceRows.length > 0) {
    const { error: svcError } = await db.from('appointment_services').insert(
      serviceRows.map((row) => ({
        appointment_id: appointment.id,
        ...row,
        created_by: userId,
      }))
    )
    if (svcError) console.error('Quick appointment service error:', svcError)
  }

  await queueOutlookAppointmentSync(supabase, appointment.id)

  // Aviso informativo, nunca bloqueante: la cita ya quedo agendada.
  const overlapping = await countOverlapping(db, inicio, fin, appointment.id)
  const warning =
    overlapping > 0
      ? `Ojo: en esa franja ya hay ${overlapping} cita${overlapping > 1 ? 's' : ''} mas.`
      : undefined

  return {
    success: true,
    warning,
    data: {
      appointment_id: appointment.id,
      patient_id: patientId,
      created_patient: createdPatient,
      duplicate: false,
    },
  }
}

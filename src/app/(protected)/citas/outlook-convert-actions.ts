'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

/**
 * Convierte un evento de Outlook (ya identificado el paciente por nombre) en una
 * cita nativa de Varix, para que se pueda confirmar, mover de estado, etc.
 *
 * - Crea la fila en `appointments` con el paciente y la hora ya detectados.
 * - Vincula el espejo de Outlook (`outlook_desktop_events` / `outlook_events`)
 *   a la nueva cita para que deje de mostrarse el espejo read-only y aparezca la
 *   cita nativa editable.
 */

const newPatientSchema = z.object({
  cedula: z.string().trim().regex(/^\d{6,10}$/, 'La cédula debe tener entre 6 y 10 dígitos'),
  nombre: z.string().trim().min(2, 'El nombre es muy corto').max(100),
  apellido: z.string().trim().min(2, 'El apellido es muy corto').max(100),
  celular: z.string().trim().regex(/^\d{10}$/, 'El celular debe tener 10 dígitos'),
})

const convertSchema = z
  .object({
    // id del evento en el calendario: "outlook-desktop-<uuid>" o "outlook-<uuid>"
    eventId: z.string().min(1).max(120),
    // Asociar a un paciente existente…
    patientId: z.string().uuid('Paciente inválido').optional(),
    // …o crear uno nuevo en el momento.
    newPatient: newPatientSchema.optional(),
    start: z.string().datetime({ offset: true }),
    end: z.string().datetime({ offset: true }),
    motivo: z.string().trim().max(500).optional().or(z.literal('')),
  })
  .refine((v) => Boolean(v.patientId) || Boolean(v.newPatient), {
    message: 'Falta el paciente: asocia uno existente o crea uno nuevo',
  })

export type ConvertResult = {
  success?: boolean
  error?: string
  data?: { appointment_id: string }
}

function resolveMirror(eventId: string): { table: string; rowId: string } | null {
  const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
  const desktop = eventId.match(new RegExp(`^outlook-desktop-(${uuid})$`, 'i'))
  if (desktop) return { table: 'outlook_desktop_events', rowId: desktop[1] }
  const graph = eventId.match(new RegExp(`^outlook-(${uuid})$`, 'i'))
  if (graph) return { table: 'outlook_events', rowId: graph[1] }
  return null
}

type ConvertInput = {
  eventId?: string
  patientId?: string
  newPatient?: { cedula: string; nombre: string; apellido: string; celular: string }
  start?: string
  end?: string
  motivo?: string
}

export async function convertOutlookEventToAppointment(
  input: ConvertInput
): Promise<ConvertResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado. Por favor inicie sesión.' }

  const validated = convertSchema.safeParse(input)
  if (!validated.success) {
    return { error: validated.error.issues[0]?.message ?? 'Datos inválidos' }
  }
  const { eventId, patientId, newPatient, start, end, motivo } = validated.data

  const mirror = resolveMirror(eventId)
  if (!mirror) return { error: 'Evento de Outlook no reconocido' }

  const inicio = new Date(start)
  const fin = new Date(end)
  if (isNaN(inicio.getTime()) || isNaN(fin.getTime()) || fin <= inicio) {
    return { error: 'Rango de fecha/hora inválido' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  // Evitar doble conversión: si el espejo ya está vinculado, no crear otra cita.
  const { data: mirrorRow, error: mirrorError } = await db
    .from(mirror.table)
    .select('id, appointment_id')
    .eq('id', mirror.rowId)
    .maybeSingle()
  if (mirrorError) {
    console.error('[Convertir Outlook] Error leyendo espejo:', mirrorError)
    return { error: 'No se pudo leer el evento de Outlook' }
  }
  if (!mirrorRow) return { error: 'El evento de Outlook ya no existe' }
  if (mirrorRow.appointment_id) {
    return { error: 'Esta cita ya fue convertida a una cita de Varix' }
  }

  // Resolver el paciente: existente (patientId) o crear uno nuevo.
  let finalPatientId = patientId
  if (newPatient) {
    const { data: created, error: createError } = await db
      .from('patients')
      .insert({
        cedula: newPatient.cedula,
        nombre: newPatient.nombre,
        apellido: newPatient.apellido,
        celular: newPatient.celular,
        created_by: user.id,
      })
      .select('id')
      .single()

    if (createError) {
      // Cédula duplicada: reutilizar el paciente que ya existe en vez de fallar.
      if (createError.code === '23505') {
        const { data: existing } = await db
          .from('patients')
          .select('id')
          .eq('cedula', newPatient.cedula)
          .maybeSingle()
        if (existing) {
          finalPatientId = existing.id
        } else {
          return { error: 'Ya existe un paciente con esa cédula' }
        }
      } else {
        console.error('[Convertir Outlook] Error creando paciente:', createError)
        return { error: 'No se pudo crear el paciente' }
      }
    } else {
      finalPatientId = created.id
    }
  }

  if (!finalPatientId) return { error: 'Falta el paciente' }

  // Verificar que el paciente exista.
  const { data: patient } = await db
    .from('patients')
    .select('id')
    .eq('id', finalPatientId)
    .maybeSingle()
  if (!patient) return { error: 'Paciente no encontrado' }

  // 1. Crear la cita nativa (doctor opcional; estado por defecto = programada).
  const { data: appointment, error: aptError } = await db
    .from('appointments')
    .insert({
      patient_id: finalPatientId,
      doctor_id: null,
      fecha_hora_inicio: inicio.toISOString(),
      fecha_hora_fin: fin.toISOString(),
      motivo_consulta: motivo || null,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (aptError || !appointment) {
    console.error('[Convertir Outlook] Error creando cita:', aptError)
    return { error: 'Error al crear la cita' }
  }

  // 2. Vincular el espejo de Outlook a la nueva cita (oculta el espejo read-only).
  const { error: linkError } = await db
    .from(mirror.table)
    .update({ appointment_id: appointment.id, match_status: 'matched' })
    .eq('id', mirror.rowId)

  if (linkError) {
    console.error('[Convertir Outlook] Error vinculando espejo:', linkError)
    // La cita quedó creada; el espejo se re-vinculará en el próximo sync por nombre/hora.
  }

  revalidatePath('/citas')
  revalidatePath('/pacientes')
  return { success: true, data: { appointment_id: appointment.id } }
}

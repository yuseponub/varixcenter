/**
 * Deteccion de citas repetidas (lado cliente).
 *
 * Una cita esta "repetida" cuando ese mismo dia (Bogota) hay otra cita viva de
 * la misma persona: mismo paciente, misma cedula, mismo celular o mismo nombre
 * completo. Con eso la agenda decide si muestra el boton "Borrar cita
 * repetida"; el servidor (`delete_duplicate_appointment`, migracion 080)
 * vuelve a comprobar la repeticion con el mismo criterio antes de borrar.
 *
 * Solo cuentan las citas nativas de Varix: un evento de Outlook sin convertir
 * no se puede borrar desde aqui ni sirve de copia para conservar.
 */

import type { CalendarEvent } from '@/types/appointments'

const dayKeyFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Bogota',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Dia civil 'YYYY-MM-DD' en Bogota. */
export function bogotaDayKey(value: string | Date): string {
  return dayKeyFmt.format(new Date(value))
}

/** Minusculas, sin tildes y con espacios colapsados (igual que en SQL). */
export function normalizePersonName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

export interface PersonKey {
  patientId?: string | null
  cedula?: string | null
  celular?: string | null
  name?: string | null
}

export function isSamePerson(a: PersonKey, b: PersonKey): boolean {
  if (a.patientId && b.patientId && a.patientId === b.patientId) return true
  if (a.cedula && b.cedula && a.cedula === b.cedula) return true
  if (a.celular && b.celular && a.celular.length >= 7 && a.celular === b.celular) return true
  const na = normalizePersonName(a.name ?? '')
  const nb = normalizePersonName(b.name ?? '')
  return na.length > 0 && na === nb
}

function personOf(event: CalendarEvent): PersonKey {
  const props = event.extendedProps
  return {
    patientId: props.patientId,
    cedula: props.patientCedula,
    celular: props.patientCelular,
    name: props.matchedPatientName || props.patientName,
  }
}

const ATTENDED = new Set(['en_atencion', 'completada'])

/**
 * Devuelve la cita que se conservaria si `event` se borrara como repetida, o
 * null si no esta repetida. Entre varias copias se prefiere la ya atendida y
 * luego la agendada mas temprano.
 */
export function findDuplicateOf(
  event: CalendarEvent,
  events: CalendarEvent[]
): CalendarEvent | null {
  if (event.extendedProps.source !== 'varix') return null

  const day = bogotaDayKey(event.start)
  const me = personOf(event)

  const copies = events.filter(
    (other) =>
      other.id !== event.id &&
      other.extendedProps.source === 'varix' &&
      other.extendedProps.estado !== 'cancelada' &&
      bogotaDayKey(other.start) === day &&
      isSamePerson(me, personOf(other))
  )
  if (copies.length === 0) return null

  copies.sort((a, b) => {
    const attended =
      Number(ATTENDED.has(b.extendedProps.estado)) - Number(ATTENDED.has(a.extendedProps.estado))
    if (attended !== 0) return attended
    return new Date(a.start).getTime() - new Date(b.start).getTime()
  })
  return copies[0]
}

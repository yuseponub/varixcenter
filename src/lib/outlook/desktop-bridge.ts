import { timingSafeEqual } from 'node:crypto'

export const DESKTOP_BRIDGE_MAX_EVENTS = 5_000
export const DESKTOP_BRIDGE_MAX_BODY_BYTES = 3_500_000
const MAX_WINDOW_DAYS = 800
const MATCH_TOLERANCE_MS = 10 * 60 * 1000

export interface DesktopBridgeEventInput {
  externalId: string
  globalId: string | null
  subject: string
  start: string
  end: string
  isAllDay: boolean
  showAs: string | null
  location: string | null
  categories: string[]
  lastModifiedAt: string | null
  appointmentId: string | null
}

export interface DesktopBridgeSnapshot {
  deviceId: string
  calendarName: string
  generatedAt: string
  windowStart: string
  windowEnd: string
  complete: true
  events: DesktopBridgeEventInput[]
}

export interface BridgeAppointmentCandidate {
  id: string
  fecha_hora_inicio: string
  fecha_hora_fin: string
  estado: string
  patients: {
    nombre: string
    apellido: string
  } | Array<{
    nombre: string
    apellido: string
  }>
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} debe ser un objeto`)
  }
  return value as Record<string, unknown>
}

function boundedString(
  value: unknown,
  label: string,
  maxLength: number,
  options?: { allowEmpty?: boolean }
): string {
  if (typeof value !== 'string') throw new Error(`${label} debe ser texto`)
  const normalized = value.trim()
  if (!options?.allowEmpty && !normalized) throw new Error(`${label} no puede estar vacio`)
  if (normalized.length > maxLength) throw new Error(`${label} supera ${maxLength} caracteres`)
  return normalized
}

function optionalString(value: unknown, label: string, maxLength: number): string | null {
  if (value === null || value === undefined || value === '') return null
  return boundedString(value, label, maxLength)
}

function isoDate(value: unknown, label: string): string {
  const serialized = boundedString(value, label, 64)
  const parsed = new Date(serialized)
  if (Number.isNaN(parsed.getTime())) throw new Error(`${label} no es una fecha valida`)
  return parsed.toISOString()
}

function optionalIsoDate(value: unknown, label: string): string | null {
  if (value === null || value === undefined || value === '') return null
  return isoDate(value, label)
}

function optionalUuid(value: unknown, label: string): string | null {
  if (value === null || value === undefined || value === '') return null
  const id = boundedString(value, label, 64)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error(`${label} no es UUID`)
  }
  return id.toLowerCase()
}

function parseEvent(value: unknown, index: number): DesktopBridgeEventInput {
  const event = requireObject(value, `events[${index}]`)
  const start = isoDate(event.start, `events[${index}].start`)
  const end = isoDate(event.end, `events[${index}].end`)
  if (new Date(end) <= new Date(start)) {
    throw new Error(`events[${index}] tiene un rango invalido`)
  }

  const rawCategories = event.categories ?? []
  if (!Array.isArray(rawCategories) || rawCategories.length > 20) {
    throw new Error(`events[${index}].categories no es valida`)
  }

  return {
    externalId: boundedString(event.externalId, `events[${index}].externalId`, 512),
    globalId: optionalString(event.globalId, `events[${index}].globalId`, 512),
    subject: boundedString(event.subject ?? '(Sin asunto)', `events[${index}].subject`, 500),
    start,
    end,
    isAllDay: event.isAllDay === true,
    showAs: optionalString(event.showAs, `events[${index}].showAs`, 50),
    location: optionalString(event.location, `events[${index}].location`, 500),
    categories: rawCategories.map((category, categoryIndex) =>
      boundedString(category, `events[${index}].categories[${categoryIndex}]`, 100)
    ),
    lastModifiedAt: optionalIsoDate(
      event.lastModifiedAt,
      `events[${index}].lastModifiedAt`
    ),
    appointmentId: optionalUuid(event.appointmentId, `events[${index}].appointmentId`),
  }
}

export function parseDesktopBridgeSnapshot(value: unknown): DesktopBridgeSnapshot {
  const snapshot = requireObject(value, 'payload')
  const deviceId = boundedString(snapshot.deviceId, 'deviceId', 64)
  if (!/^[A-Za-z0-9._-]+$/.test(deviceId)) {
    throw new Error('deviceId contiene caracteres no permitidos')
  }

  const generatedAt = isoDate(snapshot.generatedAt, 'generatedAt')
  const windowStart = isoDate(snapshot.windowStart, 'windowStart')
  const windowEnd = isoDate(snapshot.windowEnd, 'windowEnd')
  const windowMs = new Date(windowEnd).getTime() - new Date(windowStart).getTime()
  if (windowMs <= 0 || windowMs > MAX_WINDOW_DAYS * 24 * 60 * 60 * 1000) {
    throw new Error('La ventana del calendario no es valida')
  }
  if (snapshot.complete !== true) throw new Error('El snapshot debe ser completo')
  if (!Array.isArray(snapshot.events) || snapshot.events.length > DESKTOP_BRIDGE_MAX_EVENTS) {
    throw new Error(`events debe contener maximo ${DESKTOP_BRIDGE_MAX_EVENTS} elementos`)
  }

  const events = snapshot.events.map(parseEvent)
  if (new Set(events.map((event) => event.externalId)).size !== events.length) {
    throw new Error('El snapshot contiene externalId duplicados')
  }

  return {
    deviceId,
    calendarName: boundedString(snapshot.calendarName, 'calendarName', 200),
    generatedAt,
    windowStart,
    windowEnd,
    complete: true,
    events,
  }
}

export function desktopBridgeTokenMatches(provided: string | null, expected: string | undefined) {
  if (!provided || !expected || expected.length < 32) return false
  const providedBuffer = Buffer.from(provided, 'utf8')
  const expectedBuffer = Buffer.from(expected, 'utf8')
  return providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
}

function patientName(appointment: BridgeAppointmentCandidate): string {
  const patient = Array.isArray(appointment.patients)
    ? appointment.patients[0]
    : appointment.patients
  return patient ? `${patient.nombre} ${patient.apellido}`.trim() : ''
}

function meaningfulTokens(value: string): string[] {
  return normalizeDesktopSubject(value)
    .split(' ')
    .filter((token) => token.length >= 3)
}

function normalizeDesktopSubject(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export function desktopEventMatchesPatient(subject: string, fullName: string): boolean {
  const normalizedSubject = normalizeDesktopSubject(subject)
  const tokens = meaningfulTokens(fullName)
  return tokens.length > 0 && tokens.every((token) => normalizedSubject.includes(token))
}

/**
 * La agenda de Outlook de la clínica guarda la hora REAL en el asunto
 * ("8.00 NOMBRE", "10.15 NOMBRE", "2.30 NOMBRE") mientras el slot de Outlook
 * queda apilado cada 30 min desde la medianoche, sin relación con la hora real.
 * Esta función deriva inicio/fin correctos leyendo la hora del asunto.
 *
 * Convención: hora al inicio como `H.MM` / `H:MM`. Horario clínica ~7:00–19:00
 * (Colombia UTC-5 fijo, sin horario de verano):
 *   1–6 → PM (+12) · 7–11 → AM · 12 → mediodía.
 * Si el asunto no trae una hora válida se conserva el valor original.
 */
export function deriveDesktopEventTime(
  subject: string,
  startISO: string,
  endISO: string,
  isAllDay: boolean
): { start: string; end: string; derived: boolean } {
  const original = { start: startISO, end: endISO, derived: false }
  if (isAllDay) return original
  const match = subject.match(/^\s*(\d{1,2})[.:hH](\d{2})(?!\d)/)
  if (!match) return original
  let hour = Number.parseInt(match[1], 10)
  const minute = Number.parseInt(match[2], 10)
  if (hour < 1 || hour > 12 || minute > 59) return original
  if (hour >= 1 && hour <= 6) hour += 12 // 1–6 = tarde
  // Fecha (Bogotá, UTC-5) del slot original
  const bogotaDate = new Date(new Date(startISO).getTime() - 5 * 3600 * 1000)
    .toISOString()
    .slice(0, 10)
  const pad = (value: number) => String(value).padStart(2, '0')
  const start = new Date(`${bogotaDate}T${pad(hour)}:${pad(minute)}:00-05:00`)
  if (Number.isNaN(start.getTime())) return original
  let durationMs = new Date(endISO).getTime() - new Date(startISO).getTime()
  if (!(durationMs > 0) || durationMs > 8 * 3600 * 1000) durationMs = 15 * 60 * 1000
  const end = new Date(start.getTime() + durationMs)
  return { start: start.toISOString(), end: end.toISOString(), derived: true }
}

export function findDesktopAppointmentMatch(
  event: Pick<DesktopBridgeEventInput, 'subject' | 'start'>,
  appointments: BridgeAppointmentCandidate[],
  claimedAppointmentIds: Set<string>
): { appointmentId: string | null; conflict: boolean } {
  const eventStart = new Date(event.start).getTime()
  const near = appointments.filter((appointment) =>
    !claimedAppointmentIds.has(appointment.id) &&
    Math.abs(new Date(appointment.fecha_hora_inicio).getTime() - eventStart) <= MATCH_TOLERANCE_MS
  )
  const named = near.filter((appointment) =>
    desktopEventMatchesPatient(event.subject, patientName(appointment))
  )

  if (named.length === 1) return { appointmentId: named[0].id, conflict: false }
  if (named.length > 1) return { appointmentId: null, conflict: true }
  return { appointmentId: null, conflict: false }
}

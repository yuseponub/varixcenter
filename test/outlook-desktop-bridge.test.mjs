import assert from 'node:assert/strict'
import test from 'node:test'

import {
  desktopBridgeTokenMatches,
  desktopEventMatchesPatient,
  findDesktopAppointmentMatch,
  parseDesktopBridgeSnapshot,
} from '../src/lib/outlook/desktop-bridge.ts'

function validSnapshot() {
  return {
    deviceId: 'recepcion-new',
    calendarName: 'Mi calendario',
    generatedAt: '2026-07-23T04:00:00Z',
    windowStart: '2026-06-23T00:00:00Z',
    windowEnd: '2027-08-27T00:00:00Z',
    complete: true,
    events: [
      {
        externalId: 'event-hash-1',
        globalId: 'global-1',
        subject: '10.30 María José Pérez control',
        start: '2026-07-23T15:30:00Z',
        end: '2026-07-23T16:00:00Z',
        isAllDay: false,
        showAs: 'busy',
        location: 'Consultorio',
        categories: ['Agenda'],
        lastModifiedAt: '2026-07-22T20:00:00Z',
        appointmentId: null,
      },
    ],
  }
}

test('valida un snapshot completo del Outlook local', () => {
  const parsed = parseDesktopBridgeSnapshot(validSnapshot())
  assert.equal(parsed.deviceId, 'recepcion-new')
  assert.equal(parsed.events.length, 1)
  assert.equal(parsed.events[0].start, '2026-07-23T15:30:00.000Z')
})

test('rechaza IDs duplicados y rangos de eventos invalidos', () => {
  const duplicate = validSnapshot()
  duplicate.events.push({ ...duplicate.events[0] })
  assert.throws(() => parseDesktopBridgeSnapshot(duplicate), /duplicados/)

  const invalidRange = validSnapshot()
  invalidRange.events[0].end = invalidRange.events[0].start
  assert.throws(() => parseDesktopBridgeSnapshot(invalidRange), /rango invalido/)
})

test('compara el token sin aceptar valores parciales', () => {
  const token = 'a'.repeat(64)
  assert.equal(desktopBridgeTokenMatches(token, token), true)
  assert.equal(desktopBridgeTokenMatches(token.slice(1), token), false)
  assert.equal(desktopBridgeTokenMatches('', token), false)
})

test('concilia por hora cercana y nombre dentro del asunto libre', () => {
  assert.equal(
    desktopEventMatchesPatient('10.30 MARÍA-JOSÉ PÉREZ CONTROL', 'María José Pérez'),
    true
  )

  const match = findDesktopAppointmentMatch(
    { subject: '10.30 MARÍA JOSÉ PÉREZ CONTROL', start: '2026-07-23T15:30:00Z' },
    [
      {
        id: 'appointment-1',
        fecha_hora_inicio: '2026-07-23T15:30:00Z',
        fecha_hora_fin: '2026-07-23T16:00:00Z',
        estado: 'programada',
        patients: { nombre: 'María José', apellido: 'Pérez' },
      },
    ],
    new Set()
  )

  assert.deepEqual(match, { appointmentId: 'appointment-1', conflict: false })
})

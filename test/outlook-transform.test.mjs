import assert from 'node:assert/strict'
import test from 'node:test'

import {
  graphDateTimeToIso,
  graphEventToUpsert,
  normalizeOutlookSubject,
} from '../src/lib/outlook/transform.ts'

test('normaliza asuntos para conciliar citas importadas', () => {
  assert.equal(normalizeOutlookSubject('  María-José   Pérez '), 'MARIA JOSE PEREZ')
})

test('convierte fechas UTC de Microsoft Graph sin desplazar la hora', () => {
  assert.equal(
    graphDateTimeToIso({ dateTime: '2026-07-22T15:30:00.0000000', timeZone: 'UTC' }),
    '2026-07-22T15:30:00.000Z'
  )
})

test('convierte la zona de Bogotá a UTC', () => {
  assert.equal(
    graphDateTimeToIso({
      dateTime: '2026-07-22T10:30:00',
      timeZone: 'SA Pacific Standard Time',
    }),
    '2026-07-22T15:30:00.000Z'
  )
})

test('rechaza zonas sin conversión segura en lugar de guardar una hora incorrecta', () => {
  assert.equal(
    graphDateTimeToIso({ dateTime: '2026-07-22T10:30:00', timeZone: 'Unknown Zone' }),
    null
  )
})

test('crea el espejo mínimo y rechaza rangos inválidos', () => {
  const valid = graphEventToUpsert(
    {
      id: 'event-1',
      subject: 'Paciente prueba',
      start: { dateTime: '2026-07-22T15:30:00Z', timeZone: 'UTC' },
      end: { dateTime: '2026-07-22T16:00:00Z', timeZone: 'UTC' },
      location: { displayName: 'Consultorio 1' },
      categories: ['VarixCenter'],
    },
    { connectionId: 'connection-1' }
  )

  assert.equal(valid?.subject, 'Paciente prueba')
  assert.equal(valid?.location, 'Consultorio 1')
  assert.equal(valid?.match_status, 'unmatched')

  const invalid = graphEventToUpsert(
    {
      id: 'event-2',
      start: { dateTime: '2026-07-22T16:00:00Z', timeZone: 'UTC' },
      end: { dateTime: '2026-07-22T15:30:00Z', timeZone: 'UTC' },
    },
    { connectionId: 'connection-1' }
  )
  assert.equal(invalid, null)
})

test('conserva la fecha civil de eventos de día completo', () => {
  const event = graphEventToUpsert(
    {
      id: 'event-all-day',
      isAllDay: true,
      start: { dateTime: '2026-07-22T00:00:00.0000000', timeZone: 'UTC' },
      end: { dateTime: '2026-07-23T00:00:00.0000000', timeZone: 'UTC' },
    },
    { connectionId: 'connection-1' }
  )

  assert.equal(event?.start_at, '2026-07-22T00:00:00.000Z')
  assert.equal(event?.end_at, '2026-07-23T00:00:00.000Z')
  assert.equal(event?.is_all_day, true)
})

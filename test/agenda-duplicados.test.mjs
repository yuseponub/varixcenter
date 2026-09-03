import assert from 'node:assert/strict'
import test from 'node:test'

import {
  bogotaDayKey,
  findDuplicateOf,
  isSamePerson,
  normalizePersonName,
} from '../src/lib/appointments/duplicates.ts'

/** Cita nativa de Varix con los datos minimos que usa el detector. */
function cita(id, start, persona = {}, extra = {}) {
  return {
    id,
    title: persona.name ?? 'Paciente',
    start,
    end: new Date(new Date(start).getTime() + 30 * 60_000).toISOString(),
    extendedProps: {
      source: 'varix',
      appointmentId: id,
      patientId: persona.patientId ?? `p-${id}`,
      patientName: persona.name ?? 'Paciente Prueba',
      patientCedula: persona.cedula ?? '',
      patientCelular: persona.celular ?? '',
      doctorId: null,
      estado: 'programada',
      motivoConsulta: null,
      notas: null,
      ...extra,
    },
  }
}

// 09:00 y 11:00 de Bogota del mismo dia (UTC-5).
const LUNES_9 = '2026-09-07T14:00:00.000Z'
const LUNES_11 = '2026-09-07T16:00:00.000Z'
// 23:30 Bogota del lunes = 04:30 UTC del martes: sigue siendo lunes en la clinica.
const LUNES_2330 = '2026-09-08T04:30:00.000Z'
const MARTES_9 = '2026-09-08T14:00:00.000Z'

test('normaliza nombres: tildes, mayusculas y espacios', () => {
  assert.equal(normalizePersonName('  José   PÉREZ '), 'jose perez')
  assert.equal(normalizePersonName('Maria Muñoz'), normalizePersonName('MARÍA MUNOZ'))
})

test('el dia civil se calcula en Bogota, no en UTC', () => {
  assert.equal(bogotaDayKey(LUNES_2330), '2026-09-07')
  assert.equal(bogotaDayKey(MARTES_9), '2026-09-08')
})

test('misma persona por paciente, cedula, celular o nombre', () => {
  assert.ok(isSamePerson({ patientId: 'a' }, { patientId: 'a' }))
  assert.ok(isSamePerson({ patientId: 'a', cedula: '123456' }, { patientId: 'b', cedula: '123456' }))
  assert.ok(isSamePerson({ celular: '3001234567' }, { celular: '3001234567' }))
  assert.ok(isSamePerson({ name: 'Ana Gómez' }, { name: 'ana gomez' }))
  // Sin datos no hay coincidencia: dos pacientes sin cedula ni celular no son la misma persona.
  assert.equal(isSamePerson({ patientId: 'a', cedula: '' }, { patientId: 'b', cedula: '' }), false)
  assert.equal(isSamePerson({ celular: '123' }, { celular: '123' }), false)
})

test('detecta la copia del mismo paciente el mismo dia', () => {
  const a = cita('a', LUNES_9, { patientId: 'p1' })
  const b = cita('b', LUNES_11, { patientId: 'p1' })
  assert.equal(findDuplicateOf(a, [a, b])?.id, 'b')
  assert.equal(findDuplicateOf(b, [a, b])?.id, 'a')
})

test('detecta repetidas por cedula, celular o nombre aunque sean fichas distintas', () => {
  const base = cita('a', LUNES_9, { patientId: 'p1', cedula: '1020', celular: '3001112233', name: 'Ana Gómez' })
  const porCedula = cita('b', LUNES_11, { patientId: 'p2', cedula: '1020' })
  const porCelular = cita('c', LUNES_11, { patientId: 'p3', celular: '3001112233' })
  const porNombre = cita('d', LUNES_11, { patientId: 'p4', name: 'ANA GOMEZ' })
  assert.equal(findDuplicateOf(base, [base, porCedula])?.id, 'b')
  assert.equal(findDuplicateOf(base, [base, porCelular])?.id, 'c')
  assert.equal(findDuplicateOf(base, [base, porNombre])?.id, 'd')
})

test('no es repetida si la otra cita es otro dia, esta cancelada o es de Outlook', () => {
  const a = cita('a', LUNES_9, { patientId: 'p1' })
  const otroDia = cita('b', MARTES_9, { patientId: 'p1' })
  const cancelada = cita('c', LUNES_11, { patientId: 'p1' }, { estado: 'cancelada' })
  const outlook = cita('d', LUNES_11, { patientId: 'p1' }, { source: 'outlook' })
  assert.equal(findDuplicateOf(a, [a, otroDia, cancelada, outlook]), null)
  // La propia cita no cuenta como copia.
  assert.equal(findDuplicateOf(a, [a]), null)
})

test('una cita de Outlook nunca se ofrece para borrar', () => {
  const a = cita('a', LUNES_9, { patientId: 'p1' }, { source: 'outlook' })
  const b = cita('b', LUNES_11, { patientId: 'p1' })
  assert.equal(findDuplicateOf(a, [a, b]), null)
})

test('la cita de las 23:30 de Bogota sigue siendo del mismo dia', () => {
  const a = cita('a', LUNES_9, { patientId: 'p1' })
  const tarde = cita('b', LUNES_2330, { patientId: 'p1' })
  assert.equal(findDuplicateOf(a, [a, tarde])?.id, 'b')
})

test('conserva la ya atendida y, si no, la mas temprana', () => {
  const a = cita('a', LUNES_11, { patientId: 'p1' })
  const temprana = cita('b', LUNES_9, { patientId: 'p1' })
  const atendida = cita('c', LUNES_2330, { patientId: 'p1' }, { estado: 'completada' })
  assert.equal(findDuplicateOf(a, [a, temprana, atendida])?.id, 'c')
  assert.equal(findDuplicateOf(a, [a, temprana])?.id, 'b')
})

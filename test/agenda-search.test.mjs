import assert from 'node:assert/strict'
import test from 'node:test'

import {
  normalizeName,
  scoreName,
  searchTokens,
  toAccentInsensitivePattern,
} from '../src/lib/appointments/name-match.ts'

/** Simula el buscador: qué personas de una lista devolvería una consulta. */
function buscar(query, nombres) {
  const tokens = searchTokens(query)
  return nombres
    .map((name) => ({ name, score: scoreName(normalizeName(name), tokens) }))
    .filter((entry) => entry.score !== null)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.name)
}

const PACIENTES = [
  'Daniela Paez',
  'Daniela Restrepo',
  'Daniela Andrea Gomez',
  'Luis Paez',
  'Maria Jose Perez',
]

// El defecto reportado: 'Daniela' la encontraba, 'Daniela Paez' no. El filtro
// viejo era `nombre ilike %q% OR apellido ilike %q%`, y el nombre completo no
// cabe en ninguna de las dos columnas por separado.
test('el nombre completo encuentra a la persona, no la pierde', () => {
  assert.deepEqual(buscar('Daniela', PACIENTES), [
    'Daniela Paez',
    'Daniela Restrepo',
    'Daniela Andrea Gomez',
  ])
  assert.deepEqual(buscar('Daniela Paez', PACIENTES), ['Daniela Paez'])
})

test('el orden de los términos no importa', () => {
  assert.deepEqual(buscar('Paez Daniela', PACIENTES), ['Daniela Paez'])
})

test('encuentra saltando el segundo nombre', () => {
  assert.deepEqual(buscar('Daniela Gomez', PACIENTES), ['Daniela Andrea Gomez'])
})

test('las tildes y las mayúsculas no cambian el resultado', () => {
  assert.deepEqual(buscar('DANIELA PÁEZ', PACIENTES), ['Daniela Paez'])
  assert.deepEqual(buscar('maría josé pérez', PACIENTES), ['Maria Jose Perez'])
  assert.deepEqual(buscar('maria jose perez', ['María José Pérez']), ['María José Pérez'])
})

test('los términos parciales sirven', () => {
  assert.deepEqual(buscar('dani pae', PACIENTES), ['Daniela Paez'])
})

test('un término que no aparece descarta a la persona', () => {
  assert.deepEqual(buscar('Daniela Zapata', PACIENTES), [])
})

test('quien arranca palabra puntúa más que quien cae a mitad', () => {
  assert.ok(scoreName('GOMEZ ANDREA', ['GOM']) > scoreName('ANGOMEZ ANDREA', ['GOM']))
})

test('normaliza igual que el índice de pacientes', () => {
  assert.equal(normalizeName('  María-José   Pérez '), 'MARIA JOSE PEREZ')
})

test('descarta términos de una sola letra', () => {
  assert.deepEqual(searchTokens('Daniela P'), ['DANIELA'])
})

test('el regex de Outlook tolera tildes en los dos sentidos', () => {
  const patron = toAccentInsensitivePattern('PAEZ')
  assert.ok(new RegExp(patron, 'i').test('8.00 Daniela Páez'))
  assert.ok(new RegExp(patron, 'i').test('8.00 Daniela Paez'))
  assert.ok(!new RegExp(patron, 'i').test('8.00 Daniela Restrepo'))
})

test('el regex escapa los caracteres especiales del texto buscado', () => {
  const patron = toAccentInsensitivePattern(normalizeName('Perez (2)'))
  assert.doesNotThrow(() => new RegExp(patron))
})

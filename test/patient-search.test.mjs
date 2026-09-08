import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { createClient } from '@supabase/supabase-js'
import * as nameMatch from '../src/lib/appointments/name-match.ts'

const path = 'src/lib/queries/patients.ts'
const source = process.env.SEARCH_BASELINE
  ? execFileSync('git', ['show', `${process.env.SEARCH_BASELINE}:${path}`], { encoding: 'utf8' })
  : readFileSync(path, 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

// Datos ficticios; el cliente Supabase real construye la petición. El transporte
// local aplica los filtros y luego el límite, como PostgREST, sin tocar la BD.
function setup(rows, fail = false) {
  const requests = []
  const db = createClient('https://search.test', 'fixture-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input) => {
      const url = new URL(input)
      requests.push(url)
      if (fail) return new Response(JSON.stringify({ code: 'XX000', message: 'fixture failure' }), { status: 500 })
      let result = rows.slice()
      for (const group of url.searchParams.getAll('or')) {
        const filters = group.slice(1, -1).split(',').map(filter => {
          const [, column, op, pattern] = filter.match(/^(\w+)\.(\w+)\.(.*)$/)
          assert.ok(['ilike', 'imatch'].includes(op))
          const regex = new RegExp(op === 'ilike'
            ? '^' + pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$'
            : pattern, 'i')
          return row => row[column] != null && regex.test(row[column])
        })
        result = result.filter(row => filters.some(filter => filter(row)))
      }
      const orders = (url.searchParams.get('order') ?? '').split(',').filter(Boolean)
      result.sort((a, b) => {
        for (const order of orders) {
          const [column, direction] = order.split('.')
          const cmp = String(a[column] ?? '').localeCompare(String(b[column] ?? ''))
          if (cmp) return direction === 'desc' ? -cmp : cmp
        }
        return 0
      })
      result = result.slice(0, Number(url.searchParams.get('limit') ?? 1000))
      return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } })
    } },
  })
  const exports = {}
  runInNewContext(compiled, {
    exports,
    require: id => {
      if (id === '@/lib/supabase/server') return { createClient: async () => db }
      if (id === './notifications') return {}
      if (id === '@/lib/appointments/name-match') return nameMatch
      throw new Error(`Unexpected import ${id}`)
    },
  })
  return { search: exports.searchPatients, requests }
}

const patient = (id, nombre, apellido, extra = {}) => ({
  id, nombre, apellido, cedula: null, celular: null, created_at: '2026-01-01', ...extra,
})
const ids = rows => Array.from(rows, row => row.id)

test('nombre con/sin tildes, mayúsculas y orden inverso encuentra la misma ficha', async () => {
  const { search } = setup([patient('target', 'María José', 'Pérez Muñoz'), patient('other', 'Luis', 'Pérez')])
  for (const q of ['maria perez', 'MARÍA PÉREZ', 'muñoz jose', 'Munoz Maria', '  pérez   maría  ', 'mar per']) {
    assert.deepEqual(ids(await search(q)), ['target'], q)
  }
})

test('no pierde el apellido después de más de 500 candidatos con el mismo nombre', async () => {
  const rows = Array.from({ length: 650 }, (_, i) => patient(`f-${i}`, 'Ana', 'Común'))
  rows.push(patient('target', 'Ana', 'Zapata'))
  const { search } = setup(rows)
  assert.deepEqual(ids(await search('Ana Zapata', 30)), ['target'])
})

test('las variantes fonéticas se combinan y toleran tildes', async () => {
  const { search } = setup([patient('target', 'Vicente', 'Sánchez')])
  assert.deepEqual(ids(await search('bizente sanchez')), ['target'])
})

test('prioriza el nombre escrito antes del límite de resultados fonéticos', async () => {
  const rows = Array.from({ length: 40 }, (_, i) => patient(`f-${i}`, 'Vera', 'Acosta'))
  rows.push(patient('target', 'Bera', 'Zuluaga'))
  const { search } = setup(rows)
  const results = await search('Bera', 8)
  assert.equal(results.length, 8)
  assert.equal(results[0].id, 'target')
  assert.equal(new Set(ids(results)).size, results.length)
})

test('cédula y teléfono aceptan puntos, guiones, espacios y prefijo', async () => {
  const { search } = setup([
    patient('document', 'Prueba', 'Uno', { cedula: '9876543210' }),
    patient('phone', 'Prueba', 'Dos', { celular: '+57 300-000-0011' }),
  ])
  for (const q of ['9876543210', '9.876.543.210', '9 876 543 210']) {
    assert.deepEqual(ids(await search(q)), ['document'], q)
  }
  assert.deepEqual(ids(await search('3000000011')), ['phone'])
  assert.deepEqual(ids(await search('+57 (300) 000-0011')), ['phone'])
})

test('separa puntuación en nombres sin permitir filtros o comodines', async () => {
  const { search, requests } = setup([patient('target', 'María-José', 'Pérez'), patient('other', 'Ana', 'Soto')])
  assert.deepEqual(ids(await search('Maria-Jose Perez')), ['target'])
  const count = requests.length
  assert.deepEqual(ids(await search('%,()._*')), [])
  assert.equal(requests.length, count)
  assert.deepEqual(ids(await search('Maria,apellido.neq.fake')), [])
})

test('no ignora palabras ni mezcla nombre con documento ajeno; tolera cédula nula', async () => {
  const { search } = setup([patient('target', 'Ana', 'Zapata'), patient('other', 'Luis', 'Soto', { cedula: '9876543210' })])
  assert.deepEqual(ids(await search('Ana Zapata')), ['target'])
  assert.deepEqual(ids(await search('Ana inexistente')), [])
  assert.deepEqual(ids(await search('Ana 9876')), [])
})

test('conserva pacientes recientes para los consumidores sin texto de búsqueda', async () => {
  const { search } = setup([
    patient('old', 'Ana', 'Soto', { created_at: '2025-01-01' }),
    patient('new', 'Ana', 'Zapata', { created_at: '2026-01-01' }),
  ])
  assert.deepEqual(ids(await search(' ', 1)), ['new'])
})

test('propaga los errores de base de datos para no presentarlos como ausencia de pacientes', async () => {
  const { search } = setup([], true)
  await assert.rejects(() => search('Ana'), error => error.code === 'XX000')
})

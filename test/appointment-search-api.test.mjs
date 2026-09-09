import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { createClient } from '@supabase/supabase-js'
import * as nameMatch from '../src/lib/appointments/name-match.ts'

const path = 'src/app/api/appointments/search/route.ts'
const source = process.env.SEARCH_BASELINE
  ? execFileSync('git', ['show', `${process.env.SEARCH_BASELINE}:${path}`], { encoding: 'utf8' })
  : readFileSync(path, 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

function setup({ authenticated = true, failingTable, indexFails = false } = {}) {
  const requests = []
  const client = createClient('https://fixture.test', 'fixture-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async input => {
      const url = new URL(input)
      requests.push(url)
      const table = url.pathname.split('/').at(-1)
      if (table === failingTable) {
        return new Response(JSON.stringify({ code: '42501', message: 'fixture denied' }), { status: 403 })
      }
      let rows = []
      if (['outlook_events', 'outlook_desktop_events'].includes(table) && url.searchParams.get('start_at')?.startsWith('gte.')) {
        rows = [{ id: table, external_id: 'fixture-event', graph_event_id: 'fixture-graph',
          subject: 'María Pérez', start_at: '2099-01-01T15:00:00Z', end_at: '2099-01-01T15:30:00Z',
          is_all_day: false, location: null, web_link: null, appointment_id: null, match_status: 'unmatched' }]
        for (const filter of url.searchParams.getAll('subject')) {
          assert.ok(filter.startsWith('imatch.'), 'el cliente debe construir un filtro imatch real')
          rows = rows.filter(row => new RegExp(filter.slice(7), 'i').test(row.subject))
        }
      }
      return new Response(JSON.stringify(rows), { headers: { 'Content-Type': 'application/json' } })
    } },
  })
  client.auth.getUser = async () => ({ data: { user: authenticated ? { id: 'fixture-user' } : null }, error: null })
  const exports = {}
  runInNewContext(compiled, {
    exports, URL, console: { error() {} },
    require: id => {
      if (id === '@/lib/supabase/server') return { createClient: async () => client }
      if (id === 'next/server') return { NextResponse: { json: (data, init) => Response.json(data, init) } }
      if (id === '@/lib/appointments/name-match') return nameMatch
      if (id === '@/lib/queries/patient-name-index') return { getPatientNameIndex: async () => {
        if (indexFails) throw new Error('fixture unavailable')
        return [{ id: 'fixture-patient', normalized: 'MARIA PEREZ', cedula: '9876543210', celular: '' }]
      } }
      if (id === '@/lib/queries/appointments') return { STATUS_COLORS: {}, cleanOutlookSubject: subject => subject }
      throw new Error(`Unexpected import: ${id}`)
    },
  })
  return { get: query => exports.GET(new Request(`https://fixture.test/api/appointments/search?q=${encodeURIComponent(query)}`)), requests }
}

test('GET completo usa la API real del SDK y encuentra nombres con tildes en ambas fuentes Outlook', async () => {
  const { get, requests } = setup()
  const response = await get('Maria Perez')
  assert.equal(response.status, 200)
  const result = await response.json()
  assert.deepEqual(result.appointments.map(row => row.origen).sort(), ['outlook', 'outlook-escritorio'])
  const outlook = requests.filter(url => url.pathname.includes('outlook'))
  assert.equal(outlook.length, 4)
  for (const url of outlook) assert.equal(url.searchParams.getAll('subject').length, 2)
})

test('una fuente que falla devuelve error, no ausencia de citas', async () => {
  const { get } = setup({ failingTable: 'appointments' })
  const response = await get('Maria Perez')
  assert.equal(response.status, 500)
  assert.ok((await response.json()).error)
})

test('fallo del índice tampoco se presenta como búsqueda sin coincidencias', async () => {
  const { get } = setup({ indexFails: true })
  const response = await get('Maria Perez')
  assert.equal(response.status, 500)
})

test('sin sesión no consulta fuentes de datos', async () => {
  const { get, requests } = setup({ authenticated: false })
  assert.equal((await get('Maria Perez')).status, 401)
  assert.equal(requests.length, 0)
})

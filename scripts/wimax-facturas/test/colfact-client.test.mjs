import test from 'node:test'
import assert from 'node:assert/strict'
import { ColfactClient } from '../lib/colfact-client.mjs'

const CUFE = 'c195f520ffb56b89e120414bf803bc3b9968a36bf8c33431e6edc88f849e3bded91d4cfffe7e60791f168ab24afc8a49'
const OTHER_CUFE = 'b'.repeat(96)
const EMISSION_MS = Date.parse('2026-07-24T02:23:36.000Z')

function jsonResponse(value, { cookie = false } = {}) {
  const headers = { 'content-type': 'application/json' }
  if (cookie) headers['set-cookie'] = '.ASPXAUTH=test-session; path=/; HttpOnly; Secure'
  return new Response(JSON.stringify(value), { status: 200, headers })
}

function invoiceRow(overrides = {}) {
  return {
    IdSegmento: 202607,
    IdTransaccion: 1481681,
    TipoTransaccion: 'FAC',
    NumeroTransaccion: 'FE7864',
    CodigoTransaccion: CUFE,
    CodigoErp: 'FE7864',
    FechaEmision: `/Date(${EMISSION_MS})/`,
    Monto: 100000,
    IdentificacionEmisor: '900343036',
    IdentificacionComprador: '1098627818',
    EstaCompletada: true,
    EsFallido: false,
    ...overrides,
  }
}

function clientWith(rows, { xmlCufe = CUFE, calls = [] } = {}) {
  const fetchImpl = async (input, options = {}) => {
    const url = new URL(input)
    calls.push({ url, options })
    if (url.pathname.endsWith('/Login/Ingresar')) {
      return jsonResponse({ id: 1, redirect: '/admin/Comprobantes' }, { cookie: true })
    }
    if (url.pathname.endsWith('/Comprobantes/ExtraerDatos')) {
      return jsonResponse({ meta: { total: rows.length }, data: rows })
    }
    if (url.pathname.endsWith('/Comprobantes/DescargarXML')) {
      const xml = `<Invoice xmlns:cbc="urn:test"><cbc:UUID schemeName="CUFE-SHA384" schemeID="1">${xmlCufe}</cbc:UUID></Invoice>`
      return new Response(xml, { status: 200, headers: { 'content-type': 'application/xml' } })
    }
    throw new Error(`URL no esperada: ${url.pathname}`)
  }
  return new ColfactClient({
    username: 'portal-user',
    password: 'portal-password',
    emisorNit: '900343036',
    fetchImpl,
  })
}

const expected = {
  numero: 'FE7864',
  emision: '2026-07-23',
  cedula: '1098627818',
  total: 100000,
}

test('confirma CUFE solo cuando portal, identidad, monto y XML coinciden', async () => {
  const calls = []
  const result = await clientWith([invoiceRow()], { calls }).findInvoice(expected)

  assert.equal(result.cufe, CUFE)
  assert.equal(result.xmlCufeVerified, true)
  assert.equal(calls.length, 3)
  assert.equal(calls[1].url.searchParams.get('NroDocumento'), 'FE7864')
  assert.equal(calls[1].url.searchParams.get('IdentificacionComprador'), '1098627818')
  assert.equal(calls[1].url.searchParams.get('FechaInicial'), '23-07-2026')
  assert.match(String(calls[1].options.headers.Cookie), /^\.ASPXAUTH=/)
})

test('devuelve pendiente cuando ColFact aun no publica la factura', async () => {
  const result = await clientWith([]).findInvoice(expected)
  assert.equal(result, null)
})

test('bloquea una factura del mismo numero con monto distinto', async () => {
  await assert.rejects(
    clientWith([invoiceRow({ Monto: 99999 })]).findInvoice(expected),
    /COLFACT_MISMATCH: el total no coincide/,
  )
})

test('bloquea si el CUFE del XML oficial difiere del portal', async () => {
  await assert.rejects(
    clientWith([invoiceRow()], { xmlCufe: OTHER_CUFE }).findInvoice(expected),
    /COLFACT_MISMATCH: el CUFE del XML no coincide/,
  )
})

test('nunca permite enviar credenciales a un host diferente', () => {
  assert.throws(
    () => new ColfactClient({
      username: 'u',
      password: 'p',
      emisorNit: '900343036',
      baseUrl: 'https://example.com/admin',
    }),
    /COLFACT_CONFIG/,
  )
})

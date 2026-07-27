import test from 'node:test'
import assert from 'node:assert/strict'
import { ColfactClient } from '../lib/colfact-client.mjs'

const CUFE = 'c'.repeat(96)
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
    NumeroTransaccion: 'FE99007301',
    CodigoTransaccion: CUFE,
    CodigoErp: 'FE99007301',
    FechaEmision: `/Date(${EMISSION_MS})/`,
    Monto: 100000,
    IdentificacionEmisor: '900000000',
    IdentificacionComprador: '99007301',
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
    if (url.pathname.endsWith('/Comprobantes/DescargarPDF')) {
      return new Response('%PDF-1.7\nverified', {
        status: 200,
        headers: { 'content-type': 'application/pdf' },
      })
    }
    throw new Error(`URL no esperada: ${url.pathname}`)
  }
  return new ColfactClient({
    username: 'portal-user',
    password: 'portal-password',
    emisorNit: '900000000',
    fetchImpl,
  })
}

const expected = {
  numero: 'FE99007301',
  emision: '2026-07-23',
  cedula: '99007301',
  total: 100000,
}

test('confirma CUFE solo cuando portal, identidad, monto y XML coinciden', async () => {
  const calls = []
  const result = await clientWith([invoiceRow()], { calls }).findInvoice(expected)

  assert.equal(result.cufe, CUFE)
  assert.equal(result.xmlCufeVerified, true)
  assert.equal(calls.length, 3)
  assert.equal(calls[1].url.searchParams.get('NroDocumento'), 'FE99007301')
  assert.equal(calls[1].url.searchParams.get('IdentificacionComprador'), '99007301')
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
      emisorNit: '900000000',
      baseUrl: 'https://example.com/admin',
    }),
    /COLFACT_CONFIG/,
  )
})

test('pagina la consulta historica hasta que ColFact devuelve una pagina vacia', async () => {
  const pages = []
  const client = new ColfactClient({
    username: 'portal-user',
    password: 'portal-password',
    emisorNit: '900000000',
    fetchImpl: async (input) => {
      const url = new URL(input)
      if (url.pathname.endsWith('/Login/Ingresar')) {
        return jsonResponse({ id: 1 }, { cookie: true })
      }
      const page = Number(url.searchParams.get('Pagina'))
      pages.push(page)
      const data = page <= 2
        ? [invoiceRow({ IdTransaccion: page, NumeroTransaccion: `FE900${page}` })]
        : []
      return jsonResponse({ data })
    },
  })

  const rows = await client.listInvoiceRows({
    from: '2026-07-01',
    to: '2026-07-31',
  })

  assert.deepEqual(pages, [1, 2, 3])
  assert.deepEqual(rows.map((row) => row.NumeroTransaccion), ['FE9001', 'FE9002'])
})

test('detiene una paginacion que repite exactamente la ultima pagina', async () => {
  let requests = 0
  const repeated = invoiceRow({ IdTransaccion: 42, NumeroTransaccion: 'FE9042' })
  const client = new ColfactClient({
    username: 'portal-user',
    password: 'portal-password',
    emisorNit: '900000000',
    fetchImpl: async (input) => {
      const url = new URL(input)
      if (url.pathname.endsWith('/Login/Ingresar')) {
        return jsonResponse({ id: 1 }, { cookie: true })
      }
      requests += 1
      return jsonResponse({ data: [repeated] })
    },
  })

  const rows = await client.listInvoiceRows({
    from: '2026-07-01',
    to: '2026-07-31',
  })

  assert.equal(requests, 2)
  assert.equal(rows.length, 1)
})

test('descarga el PDF oficial usando la misma identidad ColFact validada', async () => {
  const calls = []
  const client = clientWith([invoiceRow()], { calls })
  const invoice = await client.findInvoice(expected)
  const pdf = await client.downloadInvoicePdf(invoice)

  assert.equal(Buffer.from(pdf).subarray(0, 5).toString('ascii'), '%PDF-')
  const call = calls.find(({ url }) => url.pathname.endsWith('/DescargarPDF'))
  assert.equal(call.url.searchParams.get('NumeroTransaccion'), 'FE99007301')
  assert.equal(call.url.searchParams.get('CodigoTransaccion'), CUFE)
})

test('rechaza una respuesta que declara PDF pero no tiene firma PDF', async () => {
  const client = new ColfactClient({
    username: 'portal-user',
    password: 'portal-password',
    emisorNit: '900000000',
    fetchImpl: async (input) => {
      const url = new URL(input)
      if (url.pathname.endsWith('/Login/Ingresar')) {
        return jsonResponse({ id: 1 }, { cookie: true })
      }
      return new Response('<html>error</html>', {
        status: 200,
        headers: { 'content-type': 'application/pdf' },
      })
    },
  })
  await assert.rejects(
    client.downloadInvoicePdf({
      numero: 'FE99007301',
      cufe: CUFE,
      idSegmento: 202607,
      idTransaccion: 1481681,
    }),
    /COLFACT_PDF/,
  )
})

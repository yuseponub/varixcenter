import { amountEqual, digitsOnly } from './normalize.mjs'

const DEFAULT_BASE_URL = 'https://nube.conexusit.com/admin'
const CUFE_SHA384 = /^[0-9a-f]{96}$/

function portalError(code, message) {
  return new Error(`${code}: ${message}`)
}

function normalizedInvoice(value) {
  return String(value ?? '').trim().toUpperCase()
}

function portalDate(dateText) {
  const match = String(dateText ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) throw portalError('COLFACT_INPUT', 'fecha de emision invalida')
  return `${match[3]}-${match[2]}-${match[1]}`
}

function bogotaDateFromAspNet(value) {
  const match = String(value ?? '').match(/^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/)
  if (!match) return null
  const date = new Date(Number(match[1]))
  if (Number.isNaN(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function responseCookies(headers) {
  const values = typeof headers.getSetCookie === 'function'
    ? headers.getSetCookie()
    : [headers.get('set-cookie')].filter(Boolean)
  return values
    .map((value) => String(value).split(';', 1)[0].trim())
    .filter(Boolean)
    .join('; ')
}

function cufeFromXml(xml) {
  const matches = new Set()
  const uuid = /<(?:(?:[A-Za-z0-9_-]+):)?UUID\b([^>]*)>([0-9a-f]{64,128})<\/(?:(?:[A-Za-z0-9_-]+):)?UUID>/gi
  for (const match of xml.matchAll(uuid)) {
    if (!/\bschemeName\s*=\s*["']CUFE-SHA384["']/i.test(match[1])) continue
    matches.add(match[2].toLowerCase())
  }
  if (matches.size !== 1) {
    throw portalError('COLFACT_XML', 'el XML oficial no contiene un CUFE SHA-384 unico')
  }
  return [...matches][0]
}

export class ColfactClient {
  constructor({
    username,
    password,
    emisorNit,
    baseUrl = DEFAULT_BASE_URL,
    fetchImpl = globalThis.fetch,
    timeoutMs = 30_000,
  }) {
    const parsedUrl = new URL(baseUrl)
    if (parsedUrl.protocol !== 'https:' || parsedUrl.hostname !== 'nube.conexusit.com') {
      throw portalError('COLFACT_CONFIG', 'COLFACT_BASE_URL debe usar nube.conexusit.com por HTTPS')
    }
    if (!String(username ?? '').trim() || !String(password ?? '')) {
      throw portalError('COLFACT_CONFIG', 'faltan credenciales del portal')
    }
    const normalizedNit = digitsOnly(emisorNit)
    if (!normalizedNit) throw portalError('COLFACT_CONFIG', 'falta COLFACT_EMISOR_NIT')
    if (typeof fetchImpl !== 'function') throw portalError('COLFACT_CONFIG', 'fetch no disponible')
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000) {
      throw portalError('COLFACT_CONFIG', 'timeout HTTP invalido')
    }

    this.baseUrl = parsedUrl.toString().replace(/\/$/, '')
    this.username = String(username).trim()
    this.password = String(password)
    this.emisorNit = normalizedNit
    this.fetch = fetchImpl
    this.timeoutMs = timeoutMs
    this.cookie = null
  }

  async fetchPortal(url, options = {}) {
    try {
      return await this.fetch(url, {
        ...options,
        signal: options.signal ?? AbortSignal.timeout(this.timeoutMs),
      })
    } catch {
      throw portalError('COLFACT_NETWORK', 'no fue posible consultar el portal')
    }
  }

  async authenticate(force = false) {
    if (this.cookie && !force) return
    const form = new URLSearchParams({ User: this.username, Pass: this.password })
    const response = await this.fetchPortal(`${this.baseUrl}/Login/Ingresar`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: form,
    })
    if (!response.ok) throw portalError('COLFACT_AUTH', 'el portal rechazo el inicio de sesion')

    let result
    try {
      result = await response.json()
    } catch {
      throw portalError('COLFACT_AUTH', 'respuesta de inicio de sesion invalida')
    }
    if (Number(result?.id) !== 1) {
      throw portalError('COLFACT_AUTH', 'usuario o contrasena rechazados')
    }
    const cookie = responseCookies(response.headers)
    if (!cookie) throw portalError('COLFACT_AUTH', 'el portal no entrego una sesion')
    this.cookie = cookie
  }

  async request(pathname, { searchParams, accept }, retry = true) {
    await this.authenticate()
    const url = new URL(`${this.baseUrl}${pathname}`)
    for (const [key, value] of Object.entries(searchParams ?? {})) {
      url.searchParams.set(key, String(value ?? ''))
    }
    const response = await this.fetchPortal(url, {
      headers: { Accept: accept, Cookie: this.cookie },
    })
    const type = response.headers.get('content-type') ?? ''
    if (retry && (response.status === 401 || response.status === 403 || /text\/html/i.test(type))) {
      this.cookie = null
      await this.authenticate(true)
      return this.request(pathname, { searchParams, accept }, false)
    }
    if (!response.ok) throw portalError('COLFACT_HTTP', `consulta rechazada con HTTP ${response.status}`)
    return response
  }

  async findInvoice({ numero, emision, cedula, total }) {
    const expectedNumber = normalizedInvoice(numero)
    const expectedCedula = digitsOnly(cedula)
    const expectedTotal = Number(total)
    if (!/^FE\d+$/.test(expectedNumber) || !expectedCedula || !Number.isFinite(expectedTotal)) {
      throw portalError('COLFACT_INPUT', 'identidad de factura incompleta')
    }

    const response = await this.request('/Comprobantes/ExtraerDatos', {
      accept: 'application/json',
      searchParams: {
        IdentificacionEmisor: this.emisorNit,
        IdentificacionComprador: expectedCedula,
        TipoTransaccion: 'FAC',
        NroDocumento: expectedNumber,
        TipoFecha: 'FechaEmisionDocumento',
        Estado: '0',
        FechaInicial: portalDate(emision),
        FechaFinal: portalDate(emision),
        FormaPago: '',
        Pagina: '1',
      },
    })

    let payload
    try {
      payload = await response.json()
    } catch {
      throw portalError('COLFACT_RESPONSE', 'respuesta de comprobantes invalida')
    }
    if (!Array.isArray(payload?.data)) {
      throw portalError('COLFACT_RESPONSE', 'el portal no devolvio una lista de comprobantes')
    }
    const candidates = payload.data.filter((row) =>
      normalizedInvoice(row?.NumeroTransaccion) === expectedNumber &&
      normalizedInvoice(row?.CodigoErp) === expectedNumber
    )
    if (candidates.length === 0) return null
    if (candidates.length !== 1) {
      throw portalError('COLFACT_AMBIGUOUS', 'el portal devolvio varias facturas con el mismo numero')
    }

    const row = candidates[0]
    if (digitsOnly(row.IdentificacionEmisor) !== this.emisorNit) {
      throw portalError('COLFACT_MISMATCH', 'el emisor no coincide')
    }
    if (digitsOnly(row.IdentificacionComprador) !== expectedCedula) {
      throw portalError('COLFACT_MISMATCH', 'el comprador no coincide')
    }
    if (!amountEqual(row.Monto, expectedTotal)) {
      throw portalError('COLFACT_MISMATCH', 'el total no coincide')
    }
    if (bogotaDateFromAspNet(row.FechaEmision) !== emision) {
      throw portalError('COLFACT_MISMATCH', 'la fecha de emision no coincide')
    }
    if (row.EsFallido === true) {
      throw portalError('COLFACT_REJECTED', 'ColFact marco la factura como fallida')
    }
    if (row.EstaCompletada !== true) return null

    const portalCufe = String(row.CodigoTransaccion ?? '').trim().toLowerCase()
    if (!CUFE_SHA384.test(portalCufe)) {
      throw portalError('COLFACT_RESPONSE', 'CodigoTransaccion no es un CUFE SHA-384')
    }

    const xmlResponse = await this.request('/Comprobantes/DescargarXML', {
      accept: 'application/xml',
      searchParams: {
        IdSegmento: row.IdSegmento,
        IdTransaccion: row.IdTransaccion,
        CodigoTransaccion: portalCufe,
        TipoTransaccion: 'FAC',
        NumeroTransaccion: expectedNumber,
      },
    })
    const xmlType = xmlResponse.headers.get('content-type') ?? ''
    if (!/\b(?:application|text)\/xml\b/i.test(xmlType)) {
      throw portalError('COLFACT_XML', 'el portal no devolvio XML oficial')
    }
    const xmlCufe = cufeFromXml(await xmlResponse.text())
    if (xmlCufe !== portalCufe) {
      throw portalError('COLFACT_MISMATCH', 'el CUFE del XML no coincide con el portal')
    }

    return {
      numero: expectedNumber,
      emision,
      total: expectedTotal,
      cufe: xmlCufe,
      completed: true,
      failed: false,
      xmlCufeVerified: true,
      idSegmento: Number(row.IdSegmento),
      idTransaccion: Number(row.IdTransaccion),
    }
  }
}

export function createColfactClientFromEnv(env = process.env, options = {}) {
  return new ColfactClient({
    username: env.COLFACT_USERNAME,
    password: env.COLFACT_PASSWORD,
    emisorNit: env.COLFACT_EMISOR_NIT,
    baseUrl: env.COLFACT_BASE_URL || DEFAULT_BASE_URL,
    timeoutMs: Number(env.COLFACT_HTTP_TIMEOUT_SECONDS ?? 30) * 1_000,
    ...options,
  })
}

export async function waitForColfactInvoice({
  client,
  invoice,
  timeoutMs,
  pollMs,
  onPoll = async () => {},
}) {
  const deadline = Date.now() + timeoutMs
  do {
    const result = await client.findInvoice(invoice)
    if (result) return result
    await onPoll()
    if (Date.now() >= deadline) return null
    await new Promise((resolve) => setTimeout(resolve, pollMs))
  } while (Date.now() < deadline)
  return null
}

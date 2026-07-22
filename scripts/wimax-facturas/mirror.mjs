/**
 * Espejo WiMAX/FoxPro -> Supabase.
 *
 * Garantia operacional: este proceso solo abre archivos de WIMAX para lectura.
 * No escribe, renombra ni elimina nada dentro de WIMAX_DIR.
 */

import { createClient } from '@supabase/supabase-js'
import { DBFFile } from 'dbffile'
import { existsSync, readFileSync } from 'node:fs'
import { hostname } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const AGENT_VERSION = 'wimax-facturas/1.0.0'
const BATCH_SIZE = 500
const AGENT_RUN_TAG = String(process.env.WIMAX_RUN_TAG ?? '')
  .replace(/[^a-zA-Z0-9._-]/g, '')
  .slice(0, 80)

function loadEnv() {
  const envFile = fileURLToPath(new URL('.env', import.meta.url))
  if (!existsSync(envFile)) return

  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (!match || process.env[match[1]]) continue
    process.env[match[1]] = match[2].replace(/^(["'])(.*)\1$/, '$2')
  }
}

loadEnv()

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const WIMAX_DIR = process.env.WIMAX_DIR

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !WIMAX_DIR) {
  console.error(
    'ERROR: faltan SUPABASE_URL, SUPABASE_SERVICE_KEY o WIMAX_DIR en .env'
  )
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function upperRecord(record) {
  return new Map(
    Object.entries(record).map(([key, value]) => [key.trim().toUpperCase(), value])
  )
}

function firstValue(record, aliases) {
  const values = record instanceof Map ? record : upperRecord(record)
  for (const alias of aliases) {
    const value = values.get(alias)
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      return value
    }
  }
  return null
}

function normalizeKey(value) {
  return value === null || value === undefined ? '' : String(value).trim()
}

function digitsOnly(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits || null
}

function textOrNull(value) {
  const text = String(value ?? '').trim()
  return text || null
}

function numericValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (value === null || value === undefined) return null

  let text = String(value).trim().replace(/\s/g, '')
  if (!text) return null

  // Handles both 1,234.56 and 1.234,56 without changing DBF numeric values.
  const lastComma = text.lastIndexOf(',')
  const lastDot = text.lastIndexOf('.')
  if (lastComma > lastDot) {
    text = text.replace(/\./g, '').replace(',', '.')
  } else {
    text = text.replace(/,/g, '')
  }

  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : null
}

function dateOnly(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const text = String(value ?? '').trim()
  if (!text) return null
  const iso = text.match(/^(\d{4})[-/]([01]\d)[-/]([0-3]\d)/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const latin = text.match(/^([0-3]?\d)[-/]([01]?\d)[-/](\d{4})/)
  if (latin) {
    return `${latin[3]}-${latin[2].padStart(2, '0')}-${latin[1].padStart(2, '0')}`
  }
  return null
}

function sourceForMonth(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const configuredBase = path.basename(WIMAX_DIR)
  const configuredParent = path.dirname(WIMAX_DIR)
  const centerMatch = configuredBase.match(/^CENTER\d{2}$/i)
  const directory = centerMatch
    ? path.join(configuredParent, `CENTER${String(year).slice(-2)}`)
    : WIMAX_DIR

  return {
    file: path.join(directory, `trafac${month}.dbf`),
    month: `${year}-${month}`,
  }
}

async function readDbf(file) {
  if (!existsSync(file)) throw new Error(`No existe el archivo DBF: ${file}`)

  const dbf = await DBFFile.open(file, {
    encoding: 'win1252',
    readMode: 'loose',
    includeDeletedRecords: false,
  })
  const rows = []
  for await (const record of dbf) rows.push(record)
  return {
    rows,
    fields: dbf.fields.map((field) => field.name.trim().toUpperCase()),
  }
}

function assertFields(fields, requirements, file) {
  const missing = requirements.filter(
    (aliases) => !aliases.some((alias) => fields.includes(alias))
  )
  if (missing.length === 0) return

  throw new Error(
    `Faltan campos requeridos en ${file}: ${missing
      .map((aliases) => aliases.join('/'))
      .join(', ')}. Disponibles: ${fields.join(', ')}`
  )
}

async function buildDirectoryMap() {
  const file = path.join(WIMAX_DIR, 'tmdir.dbf')
  const { rows, fields } = await readDbf(file)
  assertFields(fields, [['CLAVE'], ['DIREC4']], file)

  const directory = new Map()
  for (const raw of rows) {
    const row = upperRecord(raw)
    const key = normalizeKey(firstValue(row, ['CLAVE']))
    if (!key) continue

    directory.set(key, {
      cedula: digitsOnly(firstValue(row, ['DIREC4'])),
      nombre: textOrNull(
        firstValue(row, ['NOMBRE', 'NOMDIR', 'RAZON', 'RAZONSOC'])
      ),
    })
  }

  console.log(`Directorio WiMAX: ${directory.size} claves leidas de tmdir.dbf`)
  return directory
}

async function readInvoiceMonth(source, directory, syncAt) {
  const { rows, fields } = await readDbf(source.file)
  assertFields(
    fields,
    [
      ['TIPO', 'TIPODOC', 'TIPO_DOC'],
      ['NUMERO', 'NUMFAC', 'NROFAC', 'FACTURA'],
      ['EMISION', 'FECHA', 'FECEMI', 'FECHA_EMI'],
      ['CLAVE', 'CODCLI', 'CLIENTE'],
      ['TOTAL', 'VRTOTAL', 'VALTOTAL', 'NETO'],
    ],
    source.file
  )

  let feRows = 0
  let skipped = 0
  const invoices = []

  for (const raw of rows) {
    const row = upperRecord(raw)
    const type = String(
      firstValue(row, ['TIPO', 'TIPODOC', 'TIPO_DOC']) ?? ''
    )
      .trim()
      .toUpperCase()
    if (type !== 'FE') continue
    feRows += 1

    const numero = textOrNull(
      firstValue(row, ['NUMERO', 'NUMFAC', 'NROFAC', 'FACTURA'])
    )
    const emision = dateOnly(
      firstValue(row, ['EMISION', 'FECHA', 'FECEMI', 'FECHA_EMI'])
    )
    const total = numericValue(
      firstValue(row, ['TOTAL', 'VRTOTAL', 'VALTOTAL', 'NETO'])
    )
    const key = normalizeKey(
      firstValue(row, ['CLAVE', 'CODCLI', 'CLIENTE'])
    )

    if (!numero || !emision || total === null || total < 0) {
      skipped += 1
      continue
    }

    const customer = directory.get(key)
    invoices.push({
      numero,
      emision,
      cedula: customer?.cedula ?? null,
      nombre:
        textOrNull(firstValue(row, ['NOMBRE', 'NOMCLI', 'RAZON', 'RAZONSOC'])) ??
        customer?.nombre ??
        null,
      total: Math.round(total * 100) / 100,
      mes_origen: source.month,
      sync_at: syncAt,
    })
  }

  console.log(
    `${path.basename(source.file)}: ${rows.length} filas, ${feRows} FE, ${skipped} FE omitidas`
  )
  return { invoices, rowsRead: rows.length, feRows, skipped }
}

async function upsertInvoices(invoices) {
  for (let offset = 0; offset < invoices.length; offset += BATCH_SIZE) {
    const batch = invoices.slice(offset, offset + BATCH_SIZE)
    const { error } = await supabase
      .from('wimax_facturas')
      .upsert(batch, { onConflict: 'numero' })
    if (error) throw new Error(`Upsert wimax_facturas: ${error.message}`)
  }
}

async function createSyncRun() {
  const { data, error } = await supabase
    .from('sync_runs')
    .insert({
      source: 'wimax_facturas',
      agent_info: `${AGENT_VERSION}; host=${hostname()}; node=${process.version}${
        AGENT_RUN_TAG ? `; tag=${AGENT_RUN_TAG}` : ''
      }`,
    })
    .select('id')
    .single()
  if (error) throw new Error(`No se pudo iniciar sync_runs: ${error.message}`)
  return data.id
}

async function finishSyncRun(id, values) {
  const { error } = await supabase
    .from('sync_runs')
    .update({ finished_at: new Date().toISOString(), ...values })
    .eq('id', id)
  if (error) console.error(`No se pudo cerrar sync_runs: ${error.message}`)
}

async function main() {
  let syncRunId = null
  try {
    syncRunId = await createSyncRun()
    const syncAt = new Date().toISOString()
    const now = new Date()
    const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const sources = [sourceForMonth(previous), sourceForMonth(now)]
    const directory = await buildDirectoryMap()

    const monthResults = []
    for (const source of sources) {
      monthResults.push(await readInvoiceMonth(source, directory, syncAt))
    }

    // The current file wins if WiMAX happens to repeat a number across both files.
    const byNumber = new Map()
    for (const result of monthResults) {
      for (const invoice of result.invoices) byNumber.set(invoice.numero, invoice)
    }
    const invoices = [...byNumber.values()]
    await upsertInvoices(invoices)

    const { data: cross, error: crossError } = await supabase.rpc(
      'cruzar_facturacion_wimax'
    )
    if (crossError) throw new Error(`Cruce WiMAX: ${crossError.message}`)

    const stats = {
      files: sources.map((source) => source.file),
      rows_read: monthResults.reduce((sum, item) => sum + item.rowsRead, 0),
      fe_found: monthResults.reduce((sum, item) => sum + item.feRows, 0),
      skipped: monthResults.reduce((sum, item) => sum + item.skipped, 0),
      upserted: invoices.length,
      cross,
    }
    await finishSyncRun(syncRunId, { ok: true, stats })
    console.log(
      `OK: ${invoices.length} facturas reflejadas. Cruce: ${JSON.stringify(cross)}`
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`ERROR: ${message}`)
    if (syncRunId) {
      await finishSyncRun(syncRunId, {
        ok: false,
        error: message.slice(0, 4000),
        stats: {},
      })
    }
    process.exitCode = 1
  }
}

await main()

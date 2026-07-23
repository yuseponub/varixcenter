import { DBFFile } from 'dbffile'
import { existsSync } from 'node:fs'
import path from 'node:path'
import {
  dateOnly,
  digitsOnly,
  normalizeInvoiceNumber,
  normalizeKey,
  numericValue,
  textOrNull,
} from './normalize.mjs'

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

export async function readDbf(file) {
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
    recordCount: dbf.recordCount,
  }
}

function assertFields(fields, requirements, file) {
  const missing = requirements.filter(
    (aliases) => !aliases.some((alias) => fields.includes(alias))
  )
  if (missing.length === 0) return
  throw new Error(
    `DBF_SCHEMA: ${path.basename(file)} sin ${missing
      .map((aliases) => aliases.join('/'))
      .join(', ')}`
  )
}

export async function readDirectory(wimaxDir) {
  const file = path.join(wimaxDir, 'tmdir.dbf')
  if (!existsSync(file)) throw new Error('DBF_MISSING: tmdir.dbf')
  const { rows, fields } = await readDbf(file)
  assertFields(fields, [['CLAVE'], ['DIREC4']], file)

  const byCedula = new Map()
  const byCode = new Map()
  for (const raw of rows) {
    const row = upperRecord(raw)
    const code = normalizeKey(firstValue(row, ['CLAVE']))
    if (!code) continue
    const customer = {
      code,
      cedula: digitsOnly(firstValue(row, ['DIREC4'])),
      nombre: textOrNull(firstValue(row, ['NOMBRE', 'RAZON', 'RAZONSOC'])),
    }
    byCode.set(code, customer)
    if (customer.cedula) {
      const matches = byCedula.get(customer.cedula) ?? []
      matches.push(customer)
      byCedula.set(customer.cedula, matches)
    }
  }

  return { byCedula, byCode, rowsRead: rows.length, file }
}

function companyDirectoryForYear(wimaxDir, year) {
  const base = path.basename(wimaxDir)
  if (!/^CENTER\d{2}$/i.test(base)) return wimaxDir
  return path.join(path.dirname(wimaxDir), `CENTER${String(year).slice(-2)}`)
}

function monthSources(wimaxDir, startDate, endDate) {
  const start = new Date(`${startDate}T12:00:00`)
  const end = new Date(`${endDate}T12:00:00`)
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1, 12)
  const result = []
  while (cursor <= end) {
    const year = cursor.getFullYear()
    const month = String(cursor.getMonth() + 1).padStart(2, '0')
    result.push({
      file: path.join(companyDirectoryForYear(wimaxDir, year), `trafac${month}.dbf`),
      month: `${year}-${month}`,
    })
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return result
}

export async function readInvoices(wimaxDir, startDate, endDate, directory) {
  const sources = monthSources(wimaxDir, startDate, endDate)
  const invoices = []
  const missing = []
  let rowsRead = 0

  for (const source of sources) {
    if (!existsSync(source.file)) {
      missing.push(path.basename(source.file))
      continue
    }
    const { rows, fields } = await readDbf(source.file)
    rowsRead += rows.length
    assertFields(
      fields,
      [
        ['TIPO', 'TIPODOC', 'TIPO_DOC'],
        ['NUMERO', 'NUMFAC', 'NROFAC', 'FACTURA'],
        ['EMISION', 'FECHA', 'FECEMI', 'FECHA_EMI'],
        ['CLAVE', 'CODCLI', 'CLIENTE'],
        ['TOTAL_FAC', 'TOTAL', 'VRTOTAL', 'VALTOTAL', 'NETO'],
      ],
      source.file
    )

    for (const raw of rows) {
      const row = upperRecord(raw)
      const type = normalizeKey(firstValue(row, ['TIPO', 'TIPODOC', 'TIPO_DOC']))
      if (type !== 'FE') continue
      const number = normalizeInvoiceNumber(
        type,
        firstValue(row, ['NUMERO', 'NUMFAC', 'NROFAC', 'FACTURA'])
      )
      const emission = dateOnly(
        firstValue(row, ['EMISION', 'FECHA', 'FECEMI', 'FECHA_EMI'])
      )
      const total = numericValue(
        firstValue(row, ['TOTAL_FAC', 'TOTAL', 'VRTOTAL', 'VALTOTAL', 'NETO'])
      )
      const customerCode = normalizeKey(
        firstValue(row, ['CLAVE', 'CODCLI', 'CLIENTE'])
      )
      if (!number || !emission || total === null || total < 0) continue
      const customer = directory.byCode.get(customerCode)
      invoices.push({
        numero: number,
        emision: emission,
        total: Math.round(total * 100) / 100,
        clienteCodigo: customerCode || null,
        cedula:
          digitsOnly(firstValue(row, ['NIT', 'IDENTIFICACION'])) ??
          customer?.cedula ??
          null,
        nombre:
          textOrNull(firstValue(row, ['NOMBRE', 'NOMCLI', 'RAZON', 'RAZONSOC'])) ??
          customer?.nombre ??
          null,
        mesOrigen: source.month,
      })
    }
  }

  return {
    invoices,
    missing,
    rowsRead,
    files: sources.map((source) => path.basename(source.file)),
  }
}

export async function readCufeBuffer(wimaxDir) {
  const file = path.join(wimaxDir, 'tmfecufe.dbf')
  if (!existsSync(file)) return []
  const { rows, fields } = await readDbf(file)
  assertFields(fields, [['CUFE'], ['NUMERO']], file)
  return rows
    .map((raw) => {
      const row = upperRecord(raw)
      const cufe = normalizeKey(firstValue(row, ['CUFE'])).toLowerCase()
      const type = normalizeKey(firstValue(row, ['TIPO'])) || 'FE'
      const numero = normalizeInvoiceNumber(type, firstValue(row, ['NUMERO']))
      return { numero, cufe }
    })
    .filter((row) => row.numero && /^[0-9a-f]{64,128}$/.test(row.cufe))
}

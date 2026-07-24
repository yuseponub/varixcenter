import path from 'node:path'
import {
  addDays,
  amountEqual,
  buildCustomerCode,
  buildCustomerCodeCandidates,
  dateOnly,
  digitsOnly,
} from './normalize.mjs'
import { readDirectory, readInvoices } from './dbf-reader.mjs'

function invoiceEvidence(invoice, source) {
  return {
    numero: invoice.numero,
    emision: invoice.emision,
    total: invoice.total,
    source,
  }
}

/**
 * The safe result is deliberately conservative: any unconsumed recent FE for
 * this cedula blocks the UI robot because WiMAX invoices may aggregate several
 * Varix payments. Only a durable one-to-one link to a different payment can
 * consume a candidate; amount similarity never overrides the block.
 */
export async function preflightDedup({
  job,
  cloudInvoices,
  consumedInvoiceNumbers = [],
  wimaxDir,
}) {
  const cedula = digitsOnly(job.paciente?.cedula)
  if (!cedula) {
    return {
      status: 'ambiguo',
      customerCode: null,
      evidence: { reason: 'cedula_invalida' },
    }
  }

  const paymentDate = String(job.paciente?.payment_created_at ?? '').slice(0, 10)
  const startDate = addDays(paymentDate, -2)
  const endDate = [addDays(paymentDate, 45), dateOnly(new Date())].sort()[0]
  const directory = await readDirectory(wimaxDir)
  const customerMatches = directory.byCedula.get(cedula) ?? []

  if (customerMatches.length > 1) {
    return {
      status: 'ambiguo',
      customerCode: null,
      evidence: {
        reason: 'multiples_clientes_misma_cedula',
        directory_matches: customerMatches.length,
        directory_rows: directory.rowsRead,
      },
    }
  }

  let customerCode = customerMatches[0]?.code ?? null
  let customerCodeFallback = false
  if (!customerCode) {
    const primaryCode = buildCustomerCode(cedula, job.paciente?.nombre)
    const codeCandidates = buildCustomerCodeCandidates(
      cedula,
      job.paciente?.nombre,
      job.paciente?.apellido,
    )
    if (!primaryCode || codeCandidates.length === 0) {
      return {
        status: 'ambiguo',
        customerCode: null,
        evidence: { reason: 'no_se_pudo_generar_codigo_cliente' },
      }
    }
    customerCode = codeCandidates.find((candidate) => {
      const row = directory.byCode.get(candidate)
      return !row || row.cedula === cedula
    }) ?? null
    if (!customerCode) {
      return {
        status: 'ambiguo',
        customerCode: primaryCode,
        evidence: {
          reason: 'colision_todos_codigos_cliente',
          attempted_codes: codeCandidates,
          directory_rows: directory.rowsRead,
        },
      }
    }
    customerCodeFallback = customerCode !== primaryCode
  }

  const dbf = await readInvoices(wimaxDir, startDate, endDate, directory)
  if (dbf.missing.length > 0) {
    return {
      status: 'ambiguo',
      customerCode,
      evidence: {
        reason: 'archivos_trafac_faltantes',
        missing: dbf.missing,
        checked_files: dbf.files,
      },
    }
  }

  const consumedNumbers = new Set(
    consumedInvoiceNumbers.map((number) => String(number).trim().toUpperCase())
  )
  const allDbfCandidates = dbf.invoices.filter(
    (invoice) =>
      invoice.cedula === cedula ||
      (customerCode && invoice.clienteCodigo === customerCode)
  )
  const allCloudCandidates = (cloudInvoices ?? []).filter(
    (invoice) => digitsOnly(invoice.cedula) === cedula
  )
  const dbfCandidates = allDbfCandidates.filter(
    (invoice) => !consumedNumbers.has(invoice.numero)
  )
  const cloudCandidates = allCloudCandidates.filter(
    (invoice) => !consumedNumbers.has(invoice.numero)
  )
  const consumedRecentInvoices = [...new Set([
    ...allCloudCandidates,
    ...allDbfCandidates,
  ]
    .map((invoice) => invoice.numero)
    .filter((number) => consumedNumbers.has(number)))]
    .sort()
  const evidenceByNumber = new Map()
  for (const invoice of cloudCandidates) {
    evidenceByNumber.set(invoice.numero, invoiceEvidence(invoice, 'wimax_facturas'))
  }
  for (const invoice of dbfCandidates) {
    evidenceByNumber.set(invoice.numero, invoiceEvidence(invoice, 'trafac'))
  }
  const candidates = [...evidenceByNumber.values()].sort((left, right) =>
    `${left.emision}:${left.numero}`.localeCompare(`${right.emision}:${right.numero}`)
  )

  const evidence = {
    checked_at: new Date().toISOString(),
    tmdir_file: path.basename(directory.file),
    directory_rows: directory.rowsRead,
    customer_exists: customerMatches.length === 1,
    customer_code_fallback: customerCodeFallback,
    checked_files: dbf.files,
    trafac_rows: dbf.rowsRead,
    consumed_prior_invoices: consumedRecentInvoices,
    exact_amount_candidates: candidates.filter((invoice) => amountEqual(invoice.total, job.monto)).length,
    recent_invoices: candidates,
  }

  if (candidates.length > 0) {
    return { status: 'duplicado', customerCode, evidence }
  }
  return { status: 'limpio', customerCode, evidence }
}

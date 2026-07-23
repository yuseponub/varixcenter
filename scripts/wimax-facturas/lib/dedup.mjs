import path from 'node:path'
import {
  addDays,
  amountEqual,
  buildCustomerCode,
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
 * The safe result is deliberately conservative: any recent FE for this cedula
 * blocks the UI robot because WiMAX invoices may aggregate several Varix
 * payments. A human can reconcile the candidate; the robot never overrides it.
 */
export async function preflightDedup({ job, cloudInvoices, wimaxDir }) {
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
  if (!customerCode) {
    customerCode = buildCustomerCode(cedula, job.paciente?.nombre)
    if (!customerCode) {
      return {
        status: 'ambiguo',
        customerCode: null,
        evidence: { reason: 'no_se_pudo_generar_codigo_cliente' },
      }
    }
    const collision = directory.byCode.get(customerCode)
    if (collision && collision.cedula !== cedula) {
      return {
        status: 'ambiguo',
        customerCode,
        evidence: {
          reason: 'colision_codigo_cliente',
          directory_rows: directory.rowsRead,
        },
      }
    }
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

  const dbfCandidates = dbf.invoices.filter(
    (invoice) =>
      invoice.cedula === cedula ||
      (customerCode && invoice.clienteCodigo === customerCode)
  )
  const cloudCandidates = (cloudInvoices ?? []).filter(
    (invoice) => digitsOnly(invoice.cedula) === cedula
  )
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
    checked_files: dbf.files,
    trafac_rows: dbf.rowsRead,
    exact_amount_candidates: candidates.filter((invoice) => amountEqual(invoice.total, job.monto)).length,
    recent_invoices: candidates,
  }

  if (candidates.length > 0) {
    return { status: 'duplicado', customerCode, evidence }
  }
  return { status: 'limpio', customerCode, evidence }
}

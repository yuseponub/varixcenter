/**
 * Read-only by default. Audits every active payment that contains a card or
 * bank-transfer portion against completed ColFact FAC documents.
 *
 * --apply performs only deterministic writes:
 * - imports completed portal invoice identities for deduplication;
 * - links one-to-one exact matches after XML/CUFE and PDF verification;
 * - records ambiguous/no-match review state without emitting anything;
 * - backfills private PDFs for already-linked invoices.
 */

import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createColfactClientFromEnv } from './lib/colfact-client.mjs'
import { storeInvoicePdf } from './lib/colfact-pdf.mjs'
import { reconcileMissingColfactPdfs } from './lib/colfact-reconcile.mjs'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const APPLY = process.argv.includes('--apply')

function loadEnv() {
  const file = path.join(ROOT, '.env')
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (!match || process.env[match[1]]) continue
    process.env[match[1]] = match[2].replace(/^(?:"(.*)"|'(.*)')$/, '$1$2')
  }
}

function required(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`CONFIG: falta ${name}`)
  return value
}

function digitsOnly(value) {
  return String(value ?? '').replace(/\D/g, '')
}

function normalizedInvoice(value) {
  return String(value ?? '').trim().toUpperCase()
}

function amount(value) {
  const result = Math.round(Number(String(value ?? '0').replace(/,/g, '')) * 100) / 100
  return Number.isFinite(result) ? result : null
}

function bogotaDate(value) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))
}

function aspNetDate(value) {
  const match = String(value ?? '').match(/^\/Date\((-?\d+)/)
  return match ? bogotaDate(Number(match[1])) : null
}

function dayNumber(value) {
  return Date.parse(`${value}T12:00:00Z`) / 86_400_000
}

function shiftDate(value, days) {
  return new Date(Date.parse(`${value}T12:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10)
}

async function query(label, promise) {
  const { data, error } = await promise
  if (error) throw new Error(`${label}: ${error.message}`)
  return data ?? []
}

async function paged(queryFactory) {
  const rows = []
  for (let from = 0; ; from += 1_000) {
    const page = await query('COLFACT_DB', queryFactory(from, from + 999))
    rows.push(...page)
    if (page.length < 1_000) return rows
  }
}

async function queryInBatches(label, values, queryFactory, batchSize = 100) {
  const rows = []
  for (let offset = 0; offset < values.length; offset += batchSize) {
    rows.push(...await query(label, queryFactory(values.slice(offset, offset + batchSize))))
  }
  return rows
}

export function portalInvoice(row, emisorNit) {
  const numero = normalizedInvoice(row?.NumeroTransaccion)
  const codigoErp = normalizedInvoice(row?.CodigoErp)
  const cufe = String(row?.CodigoTransaccion ?? '').trim().toLowerCase()
  const emision = aspNetDate(row?.FechaEmision)
  const total = amount(row?.Monto)
  const cedula = digitsOnly(row?.IdentificacionComprador)
  if (
    !/^FE\d+$/.test(numero) ||
    codigoErp !== numero ||
    digitsOnly(row?.IdentificacionEmisor) !== emisorNit ||
    !/^[0-9a-f]{96}$/.test(cufe) ||
    !emision ||
    !cedula ||
    total === null ||
    row?.EstaCompletada !== true ||
    row?.EsFallido === true
  ) {
    return null
  }
  return {
    numero,
    emision,
    cedula,
    nombre: String(row?.DescripcionComprador ?? '').trim() || null,
    total,
    cufe,
    pdfAvailable: row?.TienePDF === true,
  }
}

export function classifyPayments({ payments, methods, invoices, usedNumbers }) {
  const methodsByPayment = new Map()
  for (const method of methods) {
    const current = methodsByPayment.get(method.payment_id) ?? []
    current.push(method)
    methodsByPayment.set(method.payment_id, current)
  }

  const rows = payments.map((payment) => {
    const paymentMethods = methodsByPayment.get(payment.id) ?? []
    const electronicTotal = amount(
      paymentMethods.reduce((sum, method) => sum + Number(method.monto), 0)
    )
    const paymentDate = bogotaDate(payment.created_at)
    const cedula = digitsOnly(payment.patients?.cedula)
    const configured = payment.payment_invoicing?.monto_a_facturar
    const targets = new Set([
      amount(configured ?? payment.total),
      amount(payment.total),
      electronicTotal,
    ].filter((value) => value !== null))
    const sameCedula = invoices.filter((invoice) => {
      const difference = dayNumber(invoice.emision) - dayNumber(paymentDate)
      return invoice.cedula === cedula &&
        !usedNumbers.has(invoice.numero) &&
        difference >= -2 &&
        difference <= 45
    })
    const exact = sameCedula.filter((invoice) => targets.has(invoice.total))
    return {
      payment,
      paymentDate,
      cedula,
      electronicTotal,
      exact,
      sameCedula,
    }
  })

  const invoiceUsers = new Map()
  for (const row of rows) {
    for (const invoice of row.exact) {
      const current = invoiceUsers.get(invoice.numero) ?? []
      current.push(row.payment.id)
      invoiceUsers.set(invoice.numero, current)
    }
  }

  for (const row of rows) {
    if (
      row.exact.length === 1 &&
      invoiceUsers.get(row.exact[0].numero)?.length === 1
    ) {
      row.classification = 'unica'
    } else if (row.exact.length > 0 || row.sameCedula.length > 0) {
      row.classification = 'ambigua'
    } else {
      row.classification = 'sin_factura'
    }
  }
  return rows
}

function grouped(rows, selector) {
  return Object.fromEntries(
    [...new Set(rows.map(selector))].sort().map((key) => [
      key,
      rows.filter((row) => selector(row) === key).length,
    ])
  )
}

export async function main() {
  loadEnv()
  const supabase = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const client = createColfactClientFromEnv(process.env)

  const methods = await paged((from, to) => supabase
    .from('payment_methods')
    .select('payment_id,metodo,monto')
    .in('metodo', ['tarjeta', 'transferencia'])
    .range(from, to))
  const paymentIds = [...new Set(methods.map((row) => row.payment_id))]
  const payments = []
  for (let offset = 0; offset < paymentIds.length; offset += 150) {
    payments.push(...await query('COLFACT_DB', supabase
      .from('payments')
      .select(`
        id,numero_factura,total,estado,created_at,
        patients(nombre,apellido,cedula),
        payment_invoicing(
          estado,monto_a_facturar,wimax_factura_numero,colfact_revision_estado
        )
      `)
      .in('id', paymentIds.slice(offset, offset + 150))))
  }
  const activeUnlinked = payments.filter((payment) =>
    payment.estado === 'activo' &&
    !['facturada_total', 'facturada_parcial', 'descartada'].includes(
      payment.payment_invoicing?.estado ?? ''
    )
  )
  if (activeUnlinked.length === 0) {
    console.log(JSON.stringify({ apply: APPLY, eligible_unlinked: 0 }))
    return
  }

  const firstDate = activeUnlinked.map((payment) => bogotaDate(payment.created_at)).sort()[0]
  const lastDate = bogotaDate(Date.now())
  const portalInvoices = (await client.listInvoiceRows({
    from: shiftDate(firstDate, -2),
    to: lastDate,
  }))
    .map((row) => portalInvoice(row, client.emisorNit))
    .filter(Boolean)

  const existing = await paged((from, to) => supabase
    .from('wimax_facturas')
    .select('numero,emision,cedula,total,estado_dian')
    .range(from, to))
  const existingByNumber = new Map(existing.map((invoice) => [invoice.numero, invoice]))
  const softDateCorrections = []
  const hardIdentityConflicts = []
  const invoices = portalInvoices.filter((invoice) => {
    const previous = existingByNumber.get(invoice.numero)
    if (!previous) return true
    const sameCedula = digitsOnly(previous.cedula) === invoice.cedula
    const sameTotal = amount(previous.total) === invoice.total
    const dateDifference = Math.abs(dayNumber(previous.emision) - dayNumber(invoice.emision))
    if (sameCedula && sameTotal && dateDifference <= 2) {
      if (dateDifference > 0) softDateCorrections.push(invoice.numero)
      return true
    }
    hardIdentityConflicts.push(invoice.numero)
    return false
  })

  const links = await paged((from, to) => supabase
    .from('payment_invoicing')
    .select('wimax_factura_numero')
    .not('wimax_factura_numero', 'is', null)
    .range(from, to))
  const usedNumbers = new Set(links.map((row) => normalizedInvoice(row.wimax_factura_numero)))
  const classified = classifyPayments({
    payments: activeUnlinked,
    methods,
    invoices,
    usedNumbers,
  })

  const summary = {
    apply: APPLY,
    portal_completed: portalInvoices.length,
    portal_usable: invoices.length,
    portal_with_pdf: portalInvoices.filter((invoice) => invoice.pdfAvailable).length,
    corrected_date_identities: softDateCorrections.length,
    blocked_identity_conflicts: hardIdentityConflicts,
    eligible_unlinked: classified.length,
    classification: grouped(classified, (row) => row.classification),
    by_month: Object.fromEntries(
      [...new Set(classified.map((row) => row.paymentDate.slice(0, 7)))].sort()
        .map((month) => [
          month,
          grouped(
            classified.filter((row) => row.paymentDate.startsWith(month)),
            (row) => row.classification,
          ),
        ])
    ),
    linked: 0,
    reviews_recorded: 0,
    pdf_backfill: { checked: 0, stored: 0, pending: 0, failed: 0 },
    linked_without_portal_document: [],
    errors: [],
  }

  if (!APPLY) {
    console.log(JSON.stringify(summary, null, 2))
    return
  }

  // Import every completed identity before any link. This expands cloud dedup
  // to months that the rolling DBF mirror no longer reads. Existing identities
  // must agree exactly; CUFE/PDF are written only after XML verification.
  const syncAt = new Date().toISOString()
  for (let offset = 0; offset < invoices.length; offset += 400) {
    const batch = invoices.slice(offset, offset + 400).map((invoice) => ({
      numero: invoice.numero,
      emision: invoice.emision,
      cedula: invoice.cedula,
      nombre: invoice.nombre,
      total: invoice.total,
      mes_origen: invoice.emision.slice(0, 7),
      sync_at: syncAt,
      estado_dian: existingByNumber.get(invoice.numero)?.estado_dian
        ?? 'observada_portal',
    }))
    const { error } = await supabase
      .from('wimax_facturas')
      .upsert(batch, { onConflict: 'numero', defaultToNull: false })
    if (error) throw new Error(`COLFACT_DB: ${error.message}`)
  }

  for (const row of classified) {
    try {
      if (row.classification === 'unica') {
        const candidate = row.exact[0]
        const verified = await client.findInvoice({
          numero: candidate.numero,
          emision: candidate.emision,
          cedula: row.cedula,
          total: candidate.total,
        })
        if (!verified) throw new Error('COLFACT_PENDING: factura aun no completada')
        const pdf = await storeInvoicePdf({
          supabase,
          invoice: verified,
          pdfBytes: await client.downloadInvoicePdf(verified),
        })
        const { error } = await supabase.rpc('robot_wimax_consolidar_pago_colfact', {
          p_payment_id: row.payment.id,
          p_numero: verified.numero,
          p_emision: verified.emision,
          p_cedula: row.cedula,
          p_nombre: candidate.nombre,
          p_total: verified.total,
          p_cufe: verified.cufe,
          p_pdf_path: pdf.path,
          p_pdf_sha256: pdf.sha256,
          p_pdf_size: pdf.size,
          p_evidence: {
            colfact_confirmed: true,
            xml_cufe_verified: verified.xmlCufeVerified,
            pdf_verified: true,
            unique_match: true,
            matching_fields: ['cedula', 'monto', 'ventana_fecha'],
            checked_at: new Date().toISOString(),
          },
        })
        if (error) throw new Error(`COLFACT_DB: ${error.message}`)
        usedNumbers.add(verified.numero)
        summary.linked += 1
        if (summary.linked % 10 === 0) {
          console.log(`ColFact: ${summary.linked} coincidencias exactas consolidadas`)
        }
      } else {
        const evidence = {
          candidate_count: row.exact.length,
          same_cedula_count: row.sameCedula.length,
          candidates: row.sameCedula.slice(0, 20).map((invoice) => ({
            numero: invoice.numero,
            emision: invoice.emision,
            total: invoice.total,
          })),
          checked_at: new Date().toISOString(),
        }
        const { error } = await supabase.rpc('robot_wimax_registrar_revision_colfact', {
          p_payment_id: row.payment.id,
          p_estado: row.classification === 'sin_factura'
            ? 'sin_coincidencia'
            : 'coincidencia_ambigua',
          p_evidence: evidence,
        })
        if (error) throw new Error(`COLFACT_DB: ${error.message}`)
        summary.reviews_recorded += 1
      }
    } catch (error) {
      summary.errors.push({
        payment: row.payment.numero_factura,
        code: String(error?.message ?? error).split(':', 1)[0],
      })
    }
  }

  // Existing exact links get the same private, verified PDF treatment.
  for (let batch = 0; batch < 20; batch += 1) {
    const pdfs = await reconcileMissingColfactPdfs({
      supabase,
      client,
      limit: 50,
    })
    for (const key of Object.keys(summary.pdf_backfill)) {
      summary.pdf_backfill[key] += pdfs[key]
    }
    if (pdfs.checked === 0 || pdfs.stored === 0) break
  }

  const linkedRows = await paged((from, to) => supabase
    .from('payment_invoicing')
    .select('wimax_factura_numero')
    .in('estado', ['facturada_total', 'facturada_parcial'])
    .not('wimax_factura_numero', 'is', null)
    .range(from, to))
  const linkedNumbers = [...new Set(linkedRows.map((row) => row.wimax_factura_numero))]
  const missingDocuments = await queryInBatches(
    'COLFACT_DB',
    linkedNumbers,
    (batch) => supabase
      .from('wimax_facturas')
      .select('numero')
      .in('numero', batch)
      .is('pdf_storage_path', null),
  )
  summary.linked_without_portal_document = missingDocuments.map((row) => row.numero)
  if (summary.linked_without_portal_document.length > 0) {
    const checkedAt = new Date().toISOString()
    const { error } = await supabase
      .from('payment_invoicing')
      .update({
        colfact_revision_estado: 'coincidencia_ambigua',
        colfact_revision_at: checkedAt,
        colfact_evidence: {
          reason: 'linked_dbf_invoice_not_found_colfact',
          portal_candidate_count: 0,
          checked_at: checkedAt,
        },
      })
      .in('wimax_factura_numero', summary.linked_without_portal_document)
    if (error) throw new Error(`COLFACT_DB: ${error.message}`)
  }

  console.log(JSON.stringify(summary, null, 2))
  if (summary.errors.length > 0 || summary.pdf_backfill.failed > 0) {
    process.exitCode = 1
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await main()
  } catch (error) {
    const code = String(error?.message ?? error).match(/^([A-Z_]{3,40}):/)?.[1]
      ?? 'COLFACT_CONSOLIDATE_ERROR'
    console.error(`ERROR: ${code}`)
    process.exitCode = 1
  }
}

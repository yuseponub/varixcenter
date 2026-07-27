import { digitsOnly } from './normalize.mjs'
import { storeInvoicePdf } from './colfact-pdf.mjs'

function codeOf(error) {
  return String(error?.message ?? error).match(/^([A-Z_]{3,40}):/)?.[1] ?? 'COLFACT_ERROR'
}

async function linkedInvoiceNumbers(supabase) {
  const numbers = new Set()
  for (let from = 0; ; from += 1_000) {
    const { data, error } = await supabase
      .from('payment_invoicing')
      .select('wimax_factura_numero')
      .in('estado', ['facturada_total', 'facturada_parcial'])
      .not('wimax_factura_numero', 'is', null)
      .range(from, from + 999)
    if (error) throw new Error(`COLFACT_DB: ${error.message}`)
    for (const row of data ?? []) {
      if (row.wimax_factura_numero) numbers.add(row.wimax_factura_numero)
    }
    if ((data ?? []).length < 1_000) return [...numbers]
  }
}

async function invoicesMissingPdf(supabase, numbers, limit) {
  const invoices = []
  for (let offset = 0; offset < numbers.length; offset += 100) {
    const { data, error } = await supabase
      .from('wimax_facturas')
      .select('numero,emision,cedula,total,cufe,pdf_storage_path')
      .in('numero', numbers.slice(offset, offset + 100))
      .is('pdf_storage_path', null)
      .order('emision', { ascending: false })
      .limit(limit)
    if (error) throw new Error(`COLFACT_DB: ${error.message}`)
    invoices.push(...(data ?? []))
  }
  return invoices
    .sort((left, right) => String(right.emision).localeCompare(String(left.emision)))
    .slice(0, limit)
}

export async function reconcilePendingColfactJobs({
  supabase,
  client,
  limit = 10,
  logger = console,
}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new Error('COLFACT_CONFIG: limite de conciliacion invalido')
  }
  const { data: jobs, error: jobsError } = await supabase
    .from('wimax_invoice_jobs')
    .select('id,monto,paciente,wimax_factura_numero,updated_at')
    .eq('estado', 'emitida_sin_cufe')
    .not('wimax_factura_numero', 'is', null)
    .order('updated_at', { ascending: true })
    .limit(limit)
  if (jobsError) throw new Error(`COLFACT_DB: ${jobsError.message}`)

  const stats = { checked: 0, completed: 0, pending: 0, failed: 0 }
  for (const job of jobs ?? []) {
    stats.checked += 1
    try {
      const { data: invoice, error: invoiceError } = await supabase
        .from('wimax_facturas')
        .select('numero,emision,cedula,total,cufe')
        .eq('numero', job.wimax_factura_numero)
        .single()
      if (invoiceError) throw new Error(`COLFACT_DB: ${invoiceError.message}`)
      if (digitsOnly(invoice.cedula) !== digitsOnly(job.paciente?.cedula)) {
        throw new Error('COLFACT_MISMATCH: cedula DBF y trabajo no coinciden')
      }
      if (Number(invoice.total) !== Number(job.monto)) {
        throw new Error('COLFACT_MISMATCH: total DBF y trabajo no coinciden')
      }

      const result = await client.findInvoice({
        numero: invoice.numero,
        emision: invoice.emision,
        cedula: job.paciente?.cedula,
        total: job.monto,
      })
      if (!result) {
        stats.pending += 1
        continue
      }

      const pdfBytes = await client.downloadInvoicePdf(result)
      const pdf = await storeInvoicePdf({
        supabase,
        invoice: result,
        pdfBytes,
      })
      const evidence = {
        colfact_confirmed: true,
        completed: result.completed,
        failed: result.failed,
        xml_cufe_verified: result.xmlCufeVerified,
        pdf_verified: true,
        pdf_sha256: pdf.sha256,
        checked_at: new Date().toISOString(),
      }

      const { error: rpcError } = await supabase.rpc('robot_wimax_completar_desde_portal_pdf', {
        p_job_id: job.id,
        p_cufe: result.cufe,
        p_pdf_path: pdf.path,
        p_pdf_sha256: pdf.sha256,
        p_pdf_size: pdf.size,
        p_evidence: evidence,
      })
      if (rpcError) throw new Error(`COLFACT_DB: ${rpcError.message}`)
      stats.completed += 1
      logger.log(`ColFact completo trabajo ${job.id.slice(0, 8)}`)
    } catch (error) {
      stats.failed += 1
      logger.error(`ColFact no concilio trabajo ${job.id.slice(0, 8)}: ${codeOf(error)}`)
    }
  }
  return stats
}

export async function reconcileMissingColfactPdfs({
  supabase,
  client,
  limit = 10,
  logger = console,
}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new Error('COLFACT_CONFIG: limite de documentos invalido')
  }

  const numbers = await linkedInvoiceNumbers(supabase)
  if (numbers.length === 0) {
    return { checked: 0, stored: 0, pending: 0, failed: 0 }
  }

  const invoices = await invoicesMissingPdf(supabase, numbers, limit)

  const stats = { checked: 0, stored: 0, pending: 0, failed: 0 }
  for (const invoice of invoices ?? []) {
    stats.checked += 1
    try {
      const result = await client.findInvoice(invoice)
      if (!result) {
        stats.pending += 1
        continue
      }
      const pdf = await storeInvoicePdf({
        supabase,
        invoice: result,
        pdfBytes: await client.downloadInvoicePdf(result),
      })
      const evidence = {
        colfact_confirmed: true,
        xml_cufe_verified: result.xmlCufeVerified,
        pdf_verified: true,
        pdf_sha256: pdf.sha256,
        checked_at: new Date().toISOString(),
      }
      const { error } = await supabase.rpc('robot_wimax_registrar_documento_colfact', {
        p_numero: invoice.numero,
        p_emision: invoice.emision,
        p_cedula: invoice.cedula,
        p_total: invoice.total,
        p_cufe: result.cufe,
        p_pdf_path: pdf.path,
        p_pdf_sha256: pdf.sha256,
        p_pdf_size: pdf.size,
        p_evidence: evidence,
      })
      if (error) throw new Error(`COLFACT_DB: ${error.message}`)
      stats.stored += 1
      logger.log(`ColFact guardo PDF ${invoice.numero}`)
    } catch (error) {
      stats.failed += 1
      logger.error(`ColFact no guardo PDF ${invoice.numero}: ${codeOf(error)}`)
    }
  }
  return stats
}

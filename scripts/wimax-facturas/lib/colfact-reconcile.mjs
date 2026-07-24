import { digitsOnly } from './normalize.mjs'

function codeOf(error) {
  return String(error?.message ?? error).match(/^([A-Z_]{3,40}):/)?.[1] ?? 'COLFACT_ERROR'
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

      const { error: rpcError } = await supabase.rpc('robot_wimax_completar_desde_portal', {
        p_job_id: job.id,
        p_cufe: result.cufe,
        p_evidence: {
          colfact_confirmed: true,
          completed: result.completed,
          failed: result.failed,
          xml_cufe_verified: result.xmlCufeVerified,
          checked_at: new Date().toISOString(),
        },
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

/**
 * Explicit recovery for invoices emitted under direct supervision while the
 * UI profile was being calibrated. It never drives WiMAX and never discovers
 * a match by itself: every job must be paired with an exact FE number, then
 * validated against read-only trafac/tmdir data before the recovery RPC runs.
 */

import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createColfactClientFromEnv } from './lib/colfact-client.mjs'
import { reconcilePendingColfactJobs } from './lib/colfact-reconcile.mjs'
import { readDirectory, readInvoices } from './lib/dbf-reader.mjs'
import {
  addDays,
  amountEqual,
  dateOnly,
  digitsOnly,
} from './lib/normalize.mjs'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const FE = /^FE[0-9]+$/

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

export function parseObservedLinks(args) {
  if (!Array.isArray(args) || args.length === 0) {
    throw new Error('RECOVERY_INPUT: use JOB_UUID=FE1234')
  }
  const links = args.map((raw) => {
    const match = String(raw).trim().match(/^([^=]+)=(FE[0-9]+)$/i)
    const jobId = match?.[1]?.toLowerCase()
    const numero = match?.[2]?.toUpperCase()
    if (!jobId || !numero || !UUID.test(jobId) || !FE.test(numero)) {
      throw new Error('RECOVERY_INPUT: enlace JOB_UUID=FE invalido')
    }
    return { jobId, numero }
  })
  if (new Set(links.map((link) => link.jobId)).size !== links.length) {
    throw new Error('RECOVERY_INPUT: trabajo repetido')
  }
  if (new Set(links.map((link) => link.numero)).size !== links.length) {
    throw new Error('RECOVERY_INPUT: factura repetida')
  }
  return links
}

export function assertObservedInvoice({ job, numero, invoices }) {
  const candidates = (invoices ?? []).filter(
    (invoice) => String(invoice.numero ?? '').trim().toUpperCase() === numero
  )
  if (candidates.length !== 1) {
    throw new Error('RECOVERY_DBF: la FE indicada no aparece exactamente una vez')
  }
  const invoice = candidates[0]
  if (digitsOnly(invoice.cedula) !== digitsOnly(job.paciente?.cedula)) {
    throw new Error('RECOVERY_DBF: la cedula de la FE no coincide con el trabajo')
  }
  if (!amountEqual(invoice.total, job.monto)) {
    throw new Error('RECOVERY_DBF: el total de la FE no coincide con el trabajo')
  }
  return invoice
}

async function exactJob(supabase, jobId) {
  const { data, error } = await supabase
    .from('wimax_invoice_jobs')
    .select('id,estado,monto,paciente,wimax_factura_numero')
    .eq('id', jobId)
    .single()
  if (error) throw new Error(`RECOVERY_DB: ${error.message}`)
  return data
}

async function observedInvoice(job, numero, wimaxDir) {
  const paymentDate = String(job.paciente?.payment_created_at ?? '').slice(0, 10)
  const start = addDays(paymentDate, -2)
  const end = [addDays(paymentDate, 45), dateOnly(new Date())].sort()[0]
  const directory = await readDirectory(wimaxDir)
  const { invoices } = await readInvoices(wimaxDir, start, end, directory)
  return assertObservedInvoice({ job, numero, invoices })
}

export async function main(args = process.argv.slice(2)) {
  loadEnv()
  const links = parseObservedLinks(args)
  const supabase = createClient(
    required('SUPABASE_URL'),
    required('SUPABASE_SERVICE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const wimaxDir = required('WIMAX_DIR')
  const recovered = []

  for (const link of links) {
    const job = await exactJob(supabase, link.jobId)
    if (job.wimax_factura_numero && job.wimax_factura_numero !== link.numero) {
      throw new Error('RECOVERY_STATE: el trabajo ya referencia otra FE')
    }
    if (job.estado === 'completada' && job.wimax_factura_numero === link.numero) {
      recovered.push({ jobId: job.id, numero: link.numero, state: 'completada' })
      continue
    }

    const invoice = await observedInvoice(job, link.numero, wimaxDir)
    if (job.estado !== 'emitida_sin_cufe') {
      const { error } = await supabase.rpc('robot_wimax_registrar_emision_observada', {
        p_job_id: job.id,
        p_numero: invoice.numero,
        p_emision: invoice.emision,
        p_cedula: invoice.cedula,
        p_nombre: invoice.nombre,
        p_total: invoice.total,
        p_evidence: {
          trafac_confirmed: true,
          supervised_calibration: true,
          recovered_at: new Date().toISOString(),
        },
      })
      if (error) throw new Error(`RECOVERY_DB: ${error.message}`)
    }
    recovered.push({ jobId: job.id, numero: link.numero, state: 'emitida_sin_cufe' })
  }

  let colfact = null
  if (process.env.COLFACT_RECONCILE_ENABLED === 'true') {
    colfact = await reconcilePendingColfactJobs({
      supabase,
      client: createColfactClientFromEnv(process.env),
      limit: Math.min(50, Math.max(10, links.length)),
    })
    if (colfact.failed > 0 || colfact.pending > 0) {
      throw new Error('RECOVERY_COLFACT: quedaron facturas sin CUFE confirmado')
    }
  }

  const result = { recovered, colfact }
  console.log(JSON.stringify(result))
  return result
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main()
  } catch (error) {
    const code = String(error?.message ?? error).match(/^([A-Z_]{3,40}):/)?.[1]
      ?? 'RECOVERY_ERROR'
    console.error(`ERROR: ${code}`)
    process.exitCode = 1
  }
}

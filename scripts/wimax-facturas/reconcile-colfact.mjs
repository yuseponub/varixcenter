/**
 * Portal-only reconciler. It never drives WiMAX or emits fiscal documents.
 * It closes jobs that already have an FE linked after verifying the exact
 * invoice and CUFE in ColFact's official XML.
 */

import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createColfactClientFromEnv } from './lib/colfact-client.mjs'
import {
  reconcileMissingColfactPdfs,
  reconcilePendingColfactJobs,
} from './lib/colfact-reconcile.mjs'

const ROOT = path.dirname(fileURLToPath(import.meta.url))

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

export async function main() {
  loadEnv()
  if (process.env.COLFACT_RECONCILE_ENABLED !== 'true') {
    console.log('Conciliacion ColFact deshabilitada')
    return { enabled: false }
  }

  const supabase = createClient(
    required('SUPABASE_URL'),
    required('SUPABASE_SERVICE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const client = createColfactClientFromEnv(process.env)
  const limit = Number(process.env.COLFACT_RECONCILE_LIMIT ?? 10)
  const jobs = await reconcilePendingColfactJobs({ supabase, client, limit })
  const pdfs = await reconcileMissingColfactPdfs({ supabase, client, limit })
  const stats = { jobs, pdfs }
  console.log(`ColFact: ${JSON.stringify(stats)}`)
  if (jobs.failed > 0 || pdfs.failed > 0) {
    throw new Error('COLFACT_RECONCILE: uno o mas trabajos requieren revision')
  }
  return { enabled: true, ...stats }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main()
  } catch (error) {
    const code = String(error?.message ?? error).match(/^([A-Z_]{3,40}):/)?.[1]
      ?? 'COLFACT_ERROR'
    console.error(`ERROR: ${code}`)
    process.exitCode = 1
  }
}

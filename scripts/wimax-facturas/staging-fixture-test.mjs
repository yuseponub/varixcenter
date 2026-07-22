/**
 * End-to-end staging smoke test for mirror.mjs.
 *
 * Creates DBFs only inside a fresh OS temp directory, verifies that mirror.mjs
 * leaves them byte-for-byte unchanged, then removes its two synthetic Supabase
 * rows and sync_runs entry. Requires SUPABASE_URL and SUPABASE_SERVICE_KEY.
 */

import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { DBFFile } from 'dbffile'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error('Faltan SUPABASE_URL y SUPABASE_SERVICE_KEY para la prueba')
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const invoiceNumbers = ['064AGENTPREV', '064AGENTCURR']
const startedAt = new Date().toISOString()
const tempRoot = await mkdtemp(path.join(tmpdir(), 'varix-wimax-test-'))
const runTag = path.basename(tempRoot)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function centerDirectory(date) {
  return path.join(tempRoot, `CENTER${String(date.getFullYear()).slice(-2)}`)
}

async function createFixtures() {
  const now = new Date()
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  await mkdir(centerDirectory(now), { recursive: true })
  await mkdir(centerDirectory(previous), { recursive: true })

  const directory = await DBFFile.create(
    path.join(centerDirectory(now), 'tmdir.dbf'),
    [
      { name: 'CLAVE', type: 'C', size: 10 },
      { name: 'DIREC4', type: 'C', size: 30 },
      { name: 'NOMBRE', type: 'C', size: 50 },
    ]
  )
  await directory.appendRecords([
    { CLAVE: 'A1', DIREC4: 'CC 99.123.456', NOMBRE: 'Agente Anterior' },
    { CLAVE: 'A2', DIREC4: 'NIT 900-765-432', NOMBRE: 'Agente Actual' },
  ])

  const fields = [
    { name: 'TIPO', type: 'C', size: 2 },
    { name: 'NUMERO', type: 'C', size: 20 },
    { name: 'EMISION', type: 'D', size: 8 },
    { name: 'CLAVE', type: 'C', size: 10 },
    { name: 'NOMBRE', type: 'C', size: 50 },
    { name: 'TOTAL', type: 'N', size: 12, decimalPlaces: 2 },
  ]
  const fixtures = [
    [previous, invoiceNumbers[0], 'A1', 123456],
    [now, invoiceNumbers[1], 'A2', 654321],
  ]

  for (const [date, numero, clave, total] of fixtures) {
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const dbf = await DBFFile.create(
      path.join(centerDirectory(date), `trafac${month}.dbf`),
      fields
    )
    await dbf.appendRecords([
      {
        TIPO: 'FE',
        NUMERO: numero,
        EMISION: new Date(date.getFullYear(), date.getMonth(), 15),
        CLAVE: clave,
        NOMBRE: '',
        TOTAL: total,
      },
      {
        TIPO: 'FV',
        NUMERO: `NO-${month}`,
        EMISION: new Date(date.getFullYear(), date.getMonth(), 15),
        CLAVE: clave,
        NOMBRE: '',
        TOTAL: 1,
      },
    ])
  }

  return {
    wimaxDir: centerDirectory(now),
    files: [
      path.join(centerDirectory(now), 'tmdir.dbf'),
      path.join(
        centerDirectory(previous),
        `trafac${String(previous.getMonth() + 1).padStart(2, '0')}.dbf`
      ),
      path.join(
        centerDirectory(now),
        `trafac${String(now.getMonth() + 1).padStart(2, '0')}.dbf`
      ),
    ],
  }
}

async function hashes(files) {
  const result = new Map()
  for (const file of files) {
    const digest = createHash('sha256').update(await readFile(file)).digest('hex')
    result.set(file, digest)
  }
  return result
}

async function runMirror(wimaxDir) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['mirror.mjs'], {
      cwd: scriptDir,
      env: {
        ...process.env,
        WIMAX_DIR: wimaxDir,
        WIMAX_RUN_TAG: runTag,
      },
      stdio: 'inherit',
    })
    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`mirror.mjs termino con codigo ${code}`))
    })
  })
}

async function cleanupStaging() {
  const { error: invoiceError } = await supabase
    .from('wimax_facturas')
    .delete()
    .in('numero', invoiceNumbers)
  if (invoiceError) throw invoiceError

  const { data: runs, error: runsError } = await supabase
    .from('sync_runs')
    .select('id')
    .eq('source', 'wimax_facturas')
    .like('agent_info', `%tag=${runTag}%`)
  if (runsError) throw runsError
  if (runs?.length) {
    const { error: deleteRunsError } = await supabase
      .from('sync_runs')
      .delete()
      .in(
        'id',
        runs.map((run) => run.id)
      )
    if (deleteRunsError) throw deleteRunsError
  }
}

try {
  await cleanupStaging()
  const fixture = await createFixtures()
  const before = await hashes(fixture.files)
  await runMirror(fixture.wimaxDir)
  const after = await hashes(fixture.files)

  for (const file of fixture.files) {
    if (before.get(file) !== after.get(file)) {
      throw new Error(`mirror.mjs modifico el DBF de prueba: ${file}`)
    }
  }

  const { data: invoices, error: invoicesError } = await supabase
    .from('wimax_facturas')
    .select('numero, cedula, total, mes_origen')
    .in('numero', invoiceNumbers)
    .order('numero')
  if (invoicesError) throw invoicesError

  if (
    invoices?.length !== 2 ||
    invoices.find((row) => row.numero === invoiceNumbers[0])?.cedula !==
      '99123456' ||
    invoices.find((row) => row.numero === invoiceNumbers[1])?.cedula !==
      '900765432'
  ) {
    throw new Error(`Espejo inesperado: ${JSON.stringify(invoices)}`)
  }

  const { data: run, error: runError } = await supabase
    .from('sync_runs')
    .select('ok, stats')
    .eq('source', 'wimax_facturas')
    .like('agent_info', `%tag=${runTag}%`)
    .gte('started_at', startedAt)
    .order('started_at', { ascending: false })
    .limit(1)
    .single()
  if (runError) throw runError
  if (!run.ok || run.stats?.upserted !== 2) {
    throw new Error(`sync_runs inesperado: ${JSON.stringify(run)}`)
  }

  console.log(
    JSON.stringify({
      result: 'ok',
      invoices: 2,
      cedulas_normalized: true,
      dbf_unchanged: true,
      sync_run_ok: true,
    })
  )
} finally {
  await cleanupStaging()
  await rm(tempRoot, { recursive: true })
}

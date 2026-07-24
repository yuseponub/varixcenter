/**
 * Scheduled WiMAX invoicing robot.
 *
 * Safety invariants:
 * - C:\wimax is only opened through dbffile in read mode.
 * - Urgent jobs require explicit desktop consent; close jobs require idle time.
 * - Cloud + tmdir/trafac dedup runs before typing and again before emission.
 * - The irreversible accounting acceptance requires an audited exact snapshot approval.
 * - payment_invoicing completes only after trafac FE + CUFE are both observed.
 */

import { createClient } from '@supabase/supabase-js'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { readdir, rmdir, stat, unlink } from 'node:fs/promises'
import { hostname } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createColfactClientFromEnv,
  waitForColfactInvoice,
} from './lib/colfact-client.mjs'
import { reconcilePendingColfactJobs } from './lib/colfact-reconcile.mjs'
import { preflightDedup } from './lib/dedup.mjs'
import { readCufeBuffer, readDirectory, readInvoices } from './lib/dbf-reader.mjs'
import { GuiDriver, WimaxWorkflow } from './lib/gui.mjs'
import { dailyWindow, shutdownDecision } from './lib/schedule.mjs'
import {
  addDays,
  amountEqual,
  dateOnly,
  digitsOnly,
  splitPatientName,
} from './lib/normalize.mjs'

const AGENT_VERSION = 'wimax-facturas/2.4.0'
const ROOT = path.dirname(fileURLToPath(import.meta.url))

function loadEnv() {
  const envFile = path.join(ROOT, '.env')
  if (!existsSync(envFile)) return
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
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

function integerEnv(name, fallback, min, max) {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`CONFIG: ${name} invalido`)
  }
  return value
}

function booleanEnv(name, fallback = false) {
  const value = String(process.env[name] ?? fallback).trim().toLowerCase()
  if (value === 'true') return true
  if (value === 'false') return false
  throw new Error(`CONFIG: ${name} debe ser true o false`)
}

function loadProfile(file) {
  if (!existsSync(file)) throw new Error('CONFIG: no existe WIMAX_UI_PROFILE')
  const profile = JSON.parse(readFileSync(file, 'utf8'))
  if (profile.version !== 1 || profile.calibrated !== true) {
    throw new Error('CONFIG: el perfil UI no esta calibrado y aprobado')
  }
  if (
    profile.sessionId !== 'current' &&
    (!Number.isInteger(profile.sessionId) || profile.sessionId < 1)
  ) {
    throw new Error('CONFIG: sessionId debe ser un entero positivo o current')
  }
  for (const flow of [
    'createCustomer',
    'prepareInvoice',
    'addItem',
    'finishBeforeApproval',
    'emit',
    'abort',
  ]) {
    if (!Array.isArray(profile.flows?.[flow]) || profile.flows[flow].length === 0) {
      throw new Error(`CONFIG: falta flujo UI ${flow}`)
    }
  }
  return profile
}

function withinAllowedHours(spec, now = new Date()) {
  if (!spec?.trim()) return true
  const match = spec.trim().match(/^([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-3]):([0-5]\d)$/)
  if (!match) throw new Error('CONFIG: WIMAX_ALLOWED_HOURS debe ser HH:MM-HH:MM')
  const current = now.getHours() * 60 + now.getMinutes()
  const start = Number(match[1]) * 60 + Number(match[2])
  const end = Number(match[3]) * 60 + Number(match[4])
  return start <= end
    ? current >= start && current <= end
    : current >= start || current <= end
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function cleanupLocalEvidence(stateDir, retentionHours) {
  if (!existsSync(stateDir)) return
  const cutoff = Date.now() - retentionHours * 60 * 60 * 1_000
  const directories = await readdir(stateDir, { withFileTypes: true })
  for (const directory of directories) {
    if (!directory.isDirectory() || !/^[0-9a-f-]{36}$/i.test(directory.name)) continue
    const jobDir = path.join(stateDir, directory.name)
    for (const entry of await readdir(jobDir, { withFileTypes: true })) {
      if (!entry.isFile() || !/^[0-9]{2}-[A-Za-z0-9._-]+\.png$/.test(entry.name)) continue
      const file = path.join(jobDir, entry.name)
      if ((await stat(file)).mtimeMs < cutoff) await unlink(file)
    }
    try {
      await rmdir(jobDir)
    } catch {
      // The directory still contains current evidence.
    }
  }
}

function safeError(error) {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/\b\d{5,}\b/g, '[numero]').slice(0, 900)
}

function errorCode(error) {
  const message = error instanceof Error ? error.message : String(error)
  const prefix = message.match(/^([A-Z_]{3,40}):/)?.[1]
  return prefix ?? 'ROBOT_ERROR'
}

async function rpc(supabase, name, args = {}) {
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw new Error(`RPC_${name.toUpperCase()}: ${error.message}`)
  return data
}

async function cloudDedupContextForJob(supabase, job) {
  const cedula = digitsOnly(job.paciente?.cedula)
  const paymentDate = String(job.paciente?.payment_created_at ?? '').slice(0, 10)
  const start = addDays(paymentDate, -2)
  const end = [addDays(paymentDate, 45), dateOnly(new Date())].sort()[0]
  const { data, error } = await supabase
    .from('wimax_facturas')
    .select('numero,emision,cedula,nombre,total')
    .gte('emision', start)
    .lte('emision', end)
  if (error) throw new Error(`CLOUD_DEDUP: ${error.message}`)
  const invoices = (data ?? []).filter(
    (invoice) => digitsOnly(invoice.cedula) === cedula
  )
  if (invoices.length === 0) {
    return { invoices, consumedInvoiceNumbers: [] }
  }

  const { data: consumed, error: consumedError } = await supabase
    .from('payment_invoicing')
    .select('payment_id,wimax_factura_numero,estado')
    .in('wimax_factura_numero', invoices.map((invoice) => invoice.numero))
    .neq('payment_id', job.payment_id)
    .in('estado', ['facturada_total', 'facturada_parcial'])
  if (consumedError) throw new Error(`CLOUD_DEDUP: ${consumedError.message}`)
  return {
    invoices,
    consumedInvoiceNumbers: (consumed ?? [])
      .map((row) => row.wimax_factura_numero)
      .filter(Boolean),
  }
}

function wimaxWindows(desktop, profile) {
  return (desktop.windows ?? []).filter((window) => {
    if (
      profile.window.process &&
      window.ProcessName?.toLowerCase() !== profile.window.process.toLowerCase()
    ) {
      return false
    }
    return true
  })
}

export function cleanWimaxDesktop(desktop, profile) {
  const windows = wimaxWindows(desktop, profile)
  if (windows.length !== 1) return false
  return windows.some((window) => {
    if (profile.window.titlePattern && !new RegExp(profile.window.titlePattern, 'i').test(window.Title ?? '')) {
      return false
    }
    if (profile.window.classPattern && !new RegExp(profile.window.classPattern, 'i').test(window.ClassName ?? '')) {
      return false
    }
    return true
  })
}

export function sessionIdForDesktop(profile, desktop) {
  const currentSessionId = Number(desktop?.sessionId)
  if (!Number.isInteger(currentSessionId) || currentSessionId < 1) return null
  return profile.sessionId === 'current' ? currentSessionId : profile.sessionId
}

async function desktopReady(driver, profile, minIdleSeconds) {
  const desktop = await driver.inspect()
  if (desktop.interactiveDesktop === false) {
    return { ready: false, reason: 'sesion_bloqueada' }
  }
  const expectedSessionId = sessionIdForDesktop(profile, desktop)
  if (!expectedSessionId || Number(desktop.sessionId) !== expectedSessionId) {
    return { ready: false, reason: 'sesion_interactiva_incorrecta' }
  }
  const windows = wimaxWindows(desktop, profile)
  if (windows.length === 0) return { ready: false, reason: 'wimax_no_abierto' }
  if (windows.some((window) => Number(window.SessionId) !== expectedSessionId)) {
    return { ready: false, reason: 'wimax_en_otra_sesion' }
  }
  if (!cleanWimaxDesktop(desktop, profile)) {
    return { ready: false, reason: 'interfaz_wimax_no_limpia' }
  }
  if (
    desktop.screen?.width !== profile.display.width ||
    desktop.screen?.height !== profile.display.height
  ) {
    return { ready: false, reason: 'resolucion_no_calibrada' }
  }
  if (Number(desktop.idleSeconds ?? 0) < minIdleSeconds) {
    return { ready: false, reason: 'escritorio_en_uso' }
  }
  return { ready: true, desktop }
}

function contextFor(job, customerCode) {
  const names = splitPatientName(job.paciente)
  return {
    customer: {
      code: customerCode,
      cedula: digitsOnly(job.paciente.cedula),
      celular: digitsOnly(job.paciente.celular) ?? '',
      primerNombre: names.primerNombre,
      segundoNombre: names.segundoNombre,
      primerApellido: names.primerApellido,
      segundoApellido: names.segundoApellido,
      department: 'Santander',
      city: 'Bucaramanga',
      postalCode: '680011',
      regimen: 'P',
    },
    invoice: {
      total: Number(job.monto),
      bankAccount: '1.1.10.05.01.03',
    },
    item: null,
  }
}

async function currentJobState(supabase, jobId) {
  const { data, error } = await supabase
    .from('wimax_invoice_jobs')
    .select('estado,lease_token,lease_expires_at')
    .eq('id', jobId)
    .single()
  if (error) throw new Error(`JOB_STATE: ${error.message}`)
  return data
}

async function waitForApproval({ supabase, job, approvalTimeoutMinutes }) {
  const deadline = Date.now() + approvalTimeoutMinutes * 60_000
  let lastHeartbeat = 0
  while (Date.now() < deadline) {
    if (Date.now() - lastHeartbeat >= 45_000) {
      await rpc(supabase, 'robot_wimax_heartbeat', {
        p_job_id: job.id,
        p_lease_token: job.lease_token,
        p_step: 'esperando_aprobacion_humana',
      })
      lastHeartbeat = Date.now()
    }
    const current = await currentJobState(supabase, job.id)
    if (current.lease_token !== job.lease_token) {
      throw new Error('JOB_STATE: el lease cambio durante la aprobacion')
    }
    if (current.estado === 'aprobada') return
    if (current.estado !== 'esperando_aprobacion') {
      throw new Error(`JOB_STATE: estado inesperado ${current.estado}`)
    }
    await sleep(2_000)
  }
  throw new Error('APPROVAL_TIMEOUT: no se autorizo la emision a tiempo')
}

async function heartbeat(supabase, job, step) {
  await rpc(supabase, 'robot_wimax_heartbeat', {
    p_job_id: job.id,
    p_lease_token: job.lease_token,
    p_step: step,
  })
}

function startCufeWatcher(wimaxDir, intervalMs = 75) {
  let stopped = false
  const captured = new Map()
  const promise = (async () => {
    while (!stopped) {
      try {
        for (const row of await readCufeBuffer(wimaxDir)) {
          captured.set(row.numero, row.cufe)
        }
      } catch {
        // WiMAX briefly locks this temporary DBF; the next read retries.
      }
      await sleep(intervalMs)
    }
    return captured
  })()
  return {
    async stop() {
      stopped = true
      return promise
    },
    captured,
  }
}

async function readPatientInvoices(job, wimaxDir) {
  const paymentDate = String(job.paciente.payment_created_at).slice(0, 10)
  const start = addDays(paymentDate, -2)
  const end = [addDays(paymentDate, 45), dateOnly(new Date())].sort()[0]
  const directory = await readDirectory(wimaxDir)
  const result = await readInvoices(wimaxDir, start, end, directory)
  const cedula = digitsOnly(job.paciente.cedula)
  return result.invoices.filter(
    (invoice) =>
      invoice.cedula === cedula ||
      (job.wimax_cliente_codigo && invoice.clienteCodigo === job.wimax_cliente_codigo)
  )
}

async function waitForNewInvoice({ job, wimaxDir, baselineNumbers, timeoutMs }) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const candidates = (await readPatientInvoices(job, wimaxDir)).filter(
        (invoice) =>
          !baselineNumbers.has(invoice.numero) && amountEqual(invoice.total, job.monto)
      )
      if (candidates.length === 1) return candidates[0]
      if (candidates.length > 1) {
        throw new Error('VERIFY_AMBIGUOUS: aparecieron varias FE nuevas')
      }
    } catch (error) {
      if (errorCode(error) === 'VERIFY_AMBIGUOUS') throw error
      // DBFs can be locked while WiMAX commits; retry until the deadline.
    }
    await sleep(500)
  }
  throw new Error('VERIFY_TIMEOUT: no aparecio una FE nueva en trafac')
}

async function abortPreparedUi(workflow, context, profile) {
  try {
    await workflow.run('abort', context)
    await workflow.capture('abortado')
    return cleanWimaxDesktop(await workflow.driver.inspect(), profile)
  } catch {
    return false
  }
}

async function processJob({
  supabase,
  driver,
  profile,
  stateDir,
  wimaxDir,
  approvalTimeoutMinutes,
  verificationTimeoutSeconds,
  cufeGraceSeconds,
  colfactClient,
  colfactLookupTimeoutSeconds,
  colfactLookupPollSeconds,
  job,
}) {
  const workflow = new WimaxWorkflow({ driver, profile, stateDir, jobId: job.id })
  let context = null
  let uiStarted = false
  let irreversibleStarted = false
  let unsafeUiState = false

  try {
    const cloudDedup = await cloudDedupContextForJob(supabase, job)
    const preflight = await preflightDedup({
      job,
      cloudInvoices: cloudDedup.invoices,
      consumedInvoiceNumbers: cloudDedup.consumedInvoiceNumbers,
      wimaxDir,
    })
    await rpc(supabase, 'robot_wimax_registrar_preflight', {
      p_job_id: job.id,
      p_lease_token: job.lease_token,
      p_resultado: preflight.status,
      p_cliente_codigo: preflight.customerCode,
      p_evidence: preflight.evidence,
    })
    if (preflight.status !== 'limpio') {
      console.log(`Trabajo ${job.id.slice(0, 8)} bloqueado por deduplicacion`)
      return { emitted: false }
    }
    await heartbeat(supabase, job, 'preflight_limpio')

    job.wimax_cliente_codigo = preflight.customerCode
    context = contextFor(job, preflight.customerCode)
    const baselineNumbers = new Set(
      (await readPatientInvoices(job, wimaxDir)).map((invoice) => invoice.numero)
    )

    uiStarted = true
    if (!preflight.evidence.customer_exists) {
      await workflow.run('createCustomer', context)
      await heartbeat(supabase, job, 'cliente_preparado')
    }
    await workflow.run('prepareInvoice', context)
    await heartbeat(supabase, job, 'encabezado_preparado')
    for (const item of job.items) {
      await workflow.run('addItem', {
        ...context,
        item: {
          reference: item.referencia,
          description: item.descripcion,
          quantity: Number(item.cantidad),
          unitPrice: Number(item.precio_unitario),
        },
      })
      await heartbeat(supabase, job, 'item_preparado')
    }
    await workflow.run('finishBeforeApproval', context)
    await workflow.capture('esperando-aprobacion')
    await rpc(supabase, 'robot_wimax_esperar_aprobacion', {
      p_job_id: job.id,
      p_lease_token: job.lease_token,
      p_ui_evidence: { steps: workflow.evidence },
    })

    await waitForApproval({ supabase, job, approvalTimeoutMinutes })

    // A second authoritative read closes the race between preparation and the
    // human approval. Any new FE aborts before the DIAN step.
    const secondCloudDedup = await cloudDedupContextForJob(supabase, job)
    const secondPreflight = await preflightDedup({
      job,
      cloudInvoices: secondCloudDedup.invoices,
      consumedInvoiceNumbers: secondCloudDedup.consumedInvoiceNumbers,
      wimaxDir,
    })
    if (secondPreflight.status !== 'limpio') {
      const aborted = await abortPreparedUi(workflow, context, profile)
      unsafeUiState = !aborted
      throw new Error(
        aborted
          ? 'DEDUP_RACE: aparecio una FE antes de la aprobacion'
          : 'DEDUP_RACE: aparecio una FE y no se pudo cerrar la pantalla'
      )
    }

    await rpc(supabase, 'robot_wimax_marcar_verificando', {
      p_job_id: job.id,
      p_lease_token: job.lease_token,
    })
    irreversibleStarted = true
    const cufeWatcher = startCufeWatcher(wimaxDir)
    let newInvoice
    try {
      await workflow.run('emit', context)
      newInvoice = await waitForNewInvoice({
        job,
        wimaxDir,
        baselineNumbers,
        timeoutMs: verificationTimeoutSeconds * 1_000,
      })
      // trafac can become visible just before the provider writes its short-
      // lived CUFE buffer. Keep the fast watcher alive for a bounded grace.
      await sleep(cufeGraceSeconds * 1_000)
    } finally {
      await cufeWatcher.stop()
    }

    let cufe = cufeWatcher.captured.get(newInvoice.numero)
    let cufeSource = cufe ? 'tmfecufe' : null
    let colfactError = null
    if (!cufe && colfactClient) {
      try {
        const portalInvoice = await waitForColfactInvoice({
          client: colfactClient,
          invoice: {
            numero: newInvoice.numero,
            emision: newInvoice.emision,
            cedula: newInvoice.cedula,
            total: newInvoice.total,
          },
          timeoutMs: colfactLookupTimeoutSeconds * 1_000,
          pollMs: colfactLookupPollSeconds * 1_000,
        })
        if (portalInvoice) {
          cufe = portalInvoice.cufe
          cufeSource = 'colfact_xml'
        }
      } catch (error) {
        colfactError = errorCode(error)
        console.error(`ColFact no confirmo trabajo ${job.id.slice(0, 8)}: ${colfactError}`)
      }
    }
    const evidence = {
      steps: workflow.evidence,
      trafac_confirmed: true,
      tmfecufe_captured: cufeSource === 'tmfecufe',
      colfact_checked: Boolean(colfactClient),
      colfact_xml_confirmed: cufeSource === 'colfact_xml',
      colfact_error: colfactError,
    }
    if (cufe) {
      await rpc(supabase, 'robot_wimax_completar', {
        p_job_id: job.id,
        p_lease_token: job.lease_token,
        p_numero: newInvoice.numero,
        p_emision: newInvoice.emision,
        p_cedula: newInvoice.cedula,
        p_nombre: newInvoice.nombre,
        p_total: newInvoice.total,
        p_cufe: cufe,
        p_evidence: evidence,
      })
      console.log(`Trabajo ${job.id.slice(0, 8)} completado como ${newInvoice.numero}`)
    } else {
      await rpc(supabase, 'robot_wimax_emitida_sin_cufe', {
        p_job_id: job.id,
        p_lease_token: job.lease_token,
        p_numero: newInvoice.numero,
        p_emision: newInvoice.emision,
        p_cedula: newInvoice.cedula,
        p_nombre: newInvoice.nombre,
        p_total: newInvoice.total,
        p_evidence: evidence,
      })
      console.error(`Trabajo ${job.id.slice(0, 8)} emitido; CUFE pendiente`)
    }
    return { emitted: true, cufePending: !cufe }
  } catch (error) {
    if (uiStarted && !irreversibleStarted && context) {
      const aborted = await abortPreparedUi(workflow, context, profile)
      unsafeUiState = !aborted
    }
    try {
      await rpc(supabase, 'robot_wimax_fallar', {
        p_job_id: job.id,
        p_lease_token: job.lease_token,
        p_error_code: errorCode(error),
        p_error_message: safeError(error),
        p_resultado_ambiguo: irreversibleStarted || unsafeUiState,
      })
    } catch (stateError) {
      console.error(`No se pudo cerrar trabajo ${job.id.slice(0, 8)}: ${safeError(stateError)}`)
    }
    throw error
  }
}

const UNRESOLVED_JOB_STATES = [
  'en_cola',
  'preparando',
  'esperando_aprobacion',
  'aprobada',
  'verificando',
  'bloqueada_duplicado',
  'emitida_sin_cufe',
  'requiere_revision',
  'error',
]

async function firstQueuedJob(supabase, modes) {
  const { data, error } = await supabase
    .from('wimax_invoice_jobs')
    .select('id,modo_ejecucion,queued_at')
    .eq('estado', 'en_cola')
    .in('modo_ejecucion', modes)
    .order('queued_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
  if (error) throw new Error(`QUEUE_STATE: ${error.message}`)
  return data?.[0] ?? null
}

async function unresolvedJobs(supabase) {
  const { data, error } = await supabase
    .from('wimax_invoice_jobs')
    .select('id,estado,modo_ejecucion,updated_at')
    .in('estado', UNRESOLVED_JOB_STATES)
  if (error) throw new Error(`QUEUE_STATE: ${error.message}`)
  return data ?? []
}

async function scheduleWindowsShutdown(delaySeconds) {
  const args = [
    '/s',
    '/t',
    String(delaySeconds),
    '/d',
    'p:0:0',
    '/c',
    'VarixCenter termino facturacion y conciliacion. Use shutdown /a para cancelar.',
  ]
  const child = spawn('shutdown.exe', args, {
    windowsHide: true,
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  let stderr = ''
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk) => {
    stderr += chunk
  })
  const exitCode = await new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('close', resolve)
  })
  if (exitCode !== 0) {
    throw new Error(`SHUTDOWN_FAILED: ${stderr.trim().split(/\r?\n/)[0] || exitCode}`)
  }
}

async function main() {
  loadEnv()
  if (process.platform !== 'win32') throw new Error('CONFIG: el robot solo corre en Windows interactivo')
  if (process.env.WIMAX_ROBOT_ENABLED !== 'true') {
    console.log('Robot WiMAX deshabilitado (WIMAX_ROBOT_ENABLED no es true)')
    return
  }

  const supabaseUrl = required('SUPABASE_URL')
  const serviceKey = required('SUPABASE_SERVICE_KEY')
  const wimaxDir = required('WIMAX_DIR')
  const profilePath = path.resolve(ROOT, required('WIMAX_UI_PROFILE'))
  const profile = loadProfile(profilePath)
  const stateDir = path.resolve(ROOT, process.env.WIMAX_STATE_DIR || 'state')
  const pollSeconds = integerEnv('WIMAX_POLL_SECONDS', 30, 5, 3600)
  const minIdleSeconds = integerEnv('WIMAX_MIN_IDLE_SECONDS', 300, 30, 86400)
  const urgentPromptTimeoutSeconds = integerEnv(
    'WIMAX_URGENT_PROMPT_TIMEOUT_SECONDS', 45, 15, 120
  )
  const urgentReminderSeconds = integerEnv(
    'WIMAX_URGENT_REMINDER_SECONDS', 300, 60, 3600
  )
  const endOfDayEnabled = booleanEnv('WIMAX_END_OF_DAY_ENABLED', false)
  const endOfDayTime = process.env.WIMAX_END_OF_DAY_TIME?.trim() || '21:00'
  const endOfDayWindowMinutes = integerEnv(
    'WIMAX_END_OF_DAY_WINDOW_MINUTES', 360, 60, 720
  )
  const endOfDayMinIdleSeconds = integerEnv(
    'WIMAX_END_OF_DAY_MIN_IDLE_SECONDS', 600, 60, 86400
  )
  const endOfDayQuietSeconds = integerEnv(
    'WIMAX_END_OF_DAY_QUIET_SECONDS', 120, 30, 900
  )
  const endOfDayShutdown = booleanEnv('WIMAX_END_OF_DAY_SHUTDOWN', false)
  const shutdownDelaySeconds = integerEnv(
    'WIMAX_SHUTDOWN_DELAY_SECONDS', 60, 30, 600
  )
  const approvalTimeoutMinutes = integerEnv('WIMAX_APPROVAL_TIMEOUT_MINUTES', 120, 5, 480)
  const verificationTimeoutSeconds = integerEnv('WIMAX_VERIFY_TIMEOUT_SECONDS', 120, 30, 600)
  const cufeGraceSeconds = integerEnv('WIMAX_CUFE_GRACE_SECONDS', 15, 1, 60)
  const colfactLookupTimeoutSeconds = integerEnv(
    'COLFACT_LOOKUP_TIMEOUT_SECONDS', 5, 5, 600
  )
  const colfactLookupPollSeconds = integerEnv(
    'COLFACT_LOOKUP_POLL_SECONDS', 3, 1, 60
  )
  const colfactPostBatchDelaySeconds = integerEnv(
    'COLFACT_POST_BATCH_DELAY_SECONDS', 120, 30, 900
  )
  const colfactPostBatchAttempts = integerEnv(
    'COLFACT_POST_BATCH_ATTEMPTS', 3, 1, 10
  )
  const colfactReconcileLimit = integerEnv(
    'COLFACT_RECONCILE_LIMIT', 10, 1, 50
  )
  const screenshotRetentionHours = integerEnv('WIMAX_SCREENSHOT_RETENTION_HOURS', 24, 1, 168)
  const agentId = (process.env.WIMAX_AGENT_ID || `${hostname()}-session1`)
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .slice(0, 80)
  const runOnce = process.argv.includes('--once')

  // Validate schedule syntax once at startup instead of producing a repeated
  // configuration error every polling cycle.
  if (endOfDayEnabled) {
    dailyWindow({ start: endOfDayTime, windowMinutes: endOfDayWindowMinutes })
  }
  withinAllowedHours(process.env.WIMAX_ALLOWED_HOURS)

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const colfactClient = process.env.COLFACT_RECONCILE_ENABLED === 'true'
    ? createColfactClientFromEnv(process.env)
    : null
  const driver = new GuiDriver({ scriptPath: path.join(ROOT, 'gui-driver.ps1') })
  let colfactReconcileDueAt = colfactClient
    ? Date.now() + colfactPostBatchDelaySeconds * 1_000
    : 0
  let colfactAttemptsRemaining = colfactClient ? 1 : 0
  let urgentSnoozedUntil = 0
  let closeQuietStartedAt = 0
  let closeBusinessDate = null
  let lastDeferredReason = null
  let lastDeferredLogAt = 0
  let shutdownReadyLoggedDate = null
  console.log(
    `${AGENT_VERSION}; agent=${agentId}; scheduled=${endOfDayEnabled}; close=${endOfDayTime}; shutdown=${endOfDayShutdown}`
  )

  await cleanupLocalEvidence(stateDir, screenshotRetentionHours)

  function logDeferred(reason, context) {
    const now = Date.now()
    if (reason !== lastDeferredReason || now - lastDeferredLogAt >= 5 * 60_000) {
      console.log(`${context}: ${reason}`)
      lastDeferredReason = reason
      lastDeferredLogAt = now
    }
  }

  async function processNext(modes, requiredIdleSeconds) {
    const desktop = await desktopReady(driver, profile, requiredIdleSeconds)
    if (!desktop.ready) return { processed: false, reason: desktop.reason }

    const claimed = await rpc(supabase, 'robot_wimax_reclamar_modos', {
      p_agent_id: agentId,
      p_modos: modes,
    })
    const job = claimed?.job
    if (!job) return { processed: false, reason: 'cola_vacia' }

    const result = await processJob({
      supabase,
      driver,
      profile,
      stateDir,
      wimaxDir,
      approvalTimeoutMinutes,
      verificationTimeoutSeconds,
      cufeGraceSeconds,
      colfactClient,
      colfactLookupTimeoutSeconds,
      colfactLookupPollSeconds,
      job,
    })
    if (result?.emitted && colfactClient) {
      colfactReconcileDueAt = Date.now() + colfactPostBatchDelaySeconds * 1_000
      colfactAttemptsRemaining = colfactPostBatchAttempts
    }
    await cleanupLocalEvidence(stateDir, screenshotRetentionHours)
    return { processed: true, result }
  }

  do {
    try {
      // Portal reconciliation never touches the WiMAX GUI. Emissions debounce
      // this one-shot batch so several consecutive invoices are checked
      // together instead of running a permanent five-minute task.
      if (
        colfactClient &&
        colfactReconcileDueAt > 0 &&
        Date.now() >= colfactReconcileDueAt
      ) {
        const stats = await reconcilePendingColfactJobs({
          supabase,
          client: colfactClient,
          limit: colfactReconcileLimit,
        })
        console.log(`ColFact post-lote: ${JSON.stringify(stats)}`)
        colfactAttemptsRemaining -= 1
        if ((stats.pending > 0 || stats.failed > 0) && colfactAttemptsRemaining > 0) {
          colfactReconcileDueAt = Date.now() + colfactPostBatchDelaySeconds * 1_000
        } else {
          colfactReconcileDueAt = 0
        }
      }

      if (runOnce) {
        if (!withinAllowedHours(process.env.WIMAX_ALLOWED_HOURS)) {
          console.log('Fuera de la ventana horaria configurada')
        } else {
          const outcome = await processNext(
            ['urgente', 'cierre', 'supervisada'],
            minIdleSeconds
          )
          if (!outcome.processed) console.log(`Sin reclamar: ${outcome.reason}`)
        }
      } else {
        const closeWindow = endOfDayEnabled
          ? dailyWindow({
              start: endOfDayTime,
              windowMinutes: endOfDayWindowMinutes,
            })
          : { active: false, businessDate: null }

        if (closeWindow.active) {
          if (closeBusinessDate !== closeWindow.businessDate) {
            closeBusinessDate = closeWindow.businessDate
            closeQuietStartedAt = 0
            shutdownReadyLoggedDate = null
            console.log(`Inicio de cierre WiMAX ${closeBusinessDate}`)
          }

          const queued = await firstQueuedJob(supabase, ['urgente', 'cierre'])
          if (queued) {
            closeQuietStartedAt = 0
            const outcome = await processNext(
              ['urgente', 'cierre'],
              endOfDayMinIdleSeconds
            )
            if (!outcome.processed) {
              logDeferred(outcome.reason, 'Cierre esperando escritorio')
            } else {
              lastDeferredReason = null
            }
          } else {
            if (!closeQuietStartedAt) {
              closeQuietStartedAt = Date.now()
              console.log(`Cierre sin cola; esperando ${endOfDayQuietSeconds}s por el lote`)
            }
            const quietElapsedSeconds = Math.floor(
              (Date.now() - closeQuietStartedAt) / 1_000
            )
            const jobs = await unresolvedJobs(supabase)
            const decision = shutdownDecision({
              jobs,
              quietElapsedSeconds,
              quietRequiredSeconds: endOfDayQuietSeconds,
              reconciliationScheduled: colfactReconcileDueAt > 0,
            })

            if (decision.allowed) {
              const powerDesktop = await driver.inspect()
              if (Number(powerDesktop.idleSeconds ?? 0) < endOfDayMinIdleSeconds) {
                logDeferred('escritorio_en_uso', 'Cierre no puede apagar')
              } else if (endOfDayShutdown) {
                await scheduleWindowsShutdown(shutdownDelaySeconds)
                console.log(
                  `Cierre seguro; apagado programado en ${shutdownDelaySeconds}s (cancelable con shutdown /a)`
                )
                return
              } else if (shutdownReadyLoggedDate !== closeBusinessDate) {
                console.log('Cierre seguro terminado; apagado automatico deshabilitado')
                shutdownReadyLoggedDate = closeBusinessDate
              }
            } else if (decision.reason === 'trabajos_pendientes') {
              const states = [...new Set(decision.blockers.map((job) => job.estado))]
                .sort()
                .join(',')
              logDeferred(`bloqueos=${states}`, 'Cierre no puede apagar')
            }
          }
        } else {
          closeBusinessDate = null
          closeQuietStartedAt = 0
          const urgent = withinAllowedHours(process.env.WIMAX_ALLOWED_HOURS)
            ? await firstQueuedJob(supabase, ['urgente'])
            : null

          if (urgent && Date.now() >= urgentSnoozedUntil) {
            const desktop = await driver.inspect()
            if (desktop.interactiveDesktop === false) {
              urgentSnoozedUntil = Date.now() + urgentReminderSeconds * 1_000
              logDeferred('sesion_bloqueada', 'Urgente pospuesta')
            } else {
              const prompt = await driver.promptUrgent(urgentPromptTimeoutSeconds)
              if (prompt.decision === 'cierre') {
                await rpc(supabase, 'robot_wimax_posponer_al_cierre', {
                  p_job_id: urgent.id,
                })
                console.log('Factura urgente movida al cierre por el usuario del PC')
                urgentSnoozedUntil = 0
              } else if (prompt.decision === 'ahora') {
                const outcome = await processNext(['urgente'], 0)
                if (!outcome.processed) {
                  urgentSnoozedUntil = Date.now() + urgentReminderSeconds * 1_000
                  logDeferred(outcome.reason, 'Urgente no pudo iniciar')
                } else {
                  urgentSnoozedUntil = 0
                  lastDeferredReason = null
                }
              } else {
                urgentSnoozedUntil = Date.now() + urgentReminderSeconds * 1_000
                logDeferred(prompt.decision, 'Urgente recordara despues')
              }
            }
          }
        }
      }
    } catch (error) {
      console.error(`ERROR: ${safeError(error)}`)
      if (runOnce) process.exitCode = 1
    }
    if (!runOnce) await sleep(pollSeconds * 1_000)
  } while (!runOnce)
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main()
}

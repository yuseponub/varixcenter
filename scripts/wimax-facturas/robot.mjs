/**
 * Supervised WiMAX invoicing robot.
 *
 * Safety invariants:
 * - C:\wimax is only opened through dbffile in read mode.
 * - A job is claimed only while the interactive desktop is idle.
 * - Cloud + tmdir/trafac dedup runs before typing and again before emission.
 * - The irreversible accounting acceptance requires web approval.
 * - payment_invoicing completes only after trafac FE + CUFE are both observed.
 */

import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'node:fs'
import { readdir, rmdir, stat, unlink } from 'node:fs/promises'
import { hostname } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createColfactClientFromEnv,
  waitForColfactInvoice,
} from './lib/colfact-client.mjs'
import { preflightDedup } from './lib/dedup.mjs'
import { readCufeBuffer, readDirectory, readInvoices } from './lib/dbf-reader.mjs'
import { GuiDriver, WimaxWorkflow } from './lib/gui.mjs'
import {
  addDays,
  amountEqual,
  dateOnly,
  digitsOnly,
  splitPatientName,
} from './lib/normalize.mjs'

const AGENT_VERSION = 'wimax-facturas/2.1.0'
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

function loadProfile(file) {
  if (!existsSync(file)) throw new Error('CONFIG: no existe WIMAX_UI_PROFILE')
  const profile = JSON.parse(readFileSync(file, 'utf8'))
  if (profile.version !== 1 || profile.calibrated !== true) {
    throw new Error('CONFIG: el perfil UI no esta calibrado y aprobado')
  }
  if (!Number.isInteger(profile.sessionId) || profile.sessionId < 1) {
    throw new Error('CONFIG: sessionId interactivo invalido')
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

async function cloudInvoicesForJob(supabase, job) {
  const cedula = digitsOnly(job.paciente?.cedula)
  const paymentDate = String(job.paciente?.payment_created_at ?? '').slice(0, 10)
  const start = addDays(paymentDate, -2)
  const end = [addDays(paymentDate, 45), dateOnly(new Date())].sort()[0]
  const { data, error } = await supabase
    .from('wimax_facturas')
    .select('numero,emision,cedula,nombre,total')
    .eq('cedula', cedula)
    .gte('emision', start)
    .lte('emision', end)
  if (error) throw new Error(`CLOUD_DEDUP: ${error.message}`)
  return data ?? []
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

async function desktopReady(driver, profile, minIdleSeconds) {
  const desktop = await driver.inspect()
  if (Number(desktop.sessionId) !== profile.sessionId) {
    return { ready: false, reason: 'sesion_interactiva_incorrecta' }
  }
  const windows = wimaxWindows(desktop, profile)
  if (windows.length === 0) return { ready: false, reason: 'wimax_no_abierto' }
  if (windows.some((window) => Number(window.SessionId) !== profile.sessionId)) {
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
    const cloudInvoices = await cloudInvoicesForJob(supabase, job)
    const preflight = await preflightDedup({ job, cloudInvoices, wimaxDir })
    await rpc(supabase, 'robot_wimax_registrar_preflight', {
      p_job_id: job.id,
      p_lease_token: job.lease_token,
      p_resultado: preflight.status,
      p_cliente_codigo: preflight.customerCode,
      p_evidence: preflight.evidence,
    })
    if (preflight.status !== 'limpio') {
      console.log(`Trabajo ${job.id.slice(0, 8)} bloqueado por deduplicacion`)
      return
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
    const secondPreflight = await preflightDedup({
      job,
      cloudInvoices: await cloudInvoicesForJob(supabase, job),
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
  const approvalTimeoutMinutes = integerEnv('WIMAX_APPROVAL_TIMEOUT_MINUTES', 120, 5, 480)
  const verificationTimeoutSeconds = integerEnv('WIMAX_VERIFY_TIMEOUT_SECONDS', 120, 30, 600)
  const cufeGraceSeconds = integerEnv('WIMAX_CUFE_GRACE_SECONDS', 15, 1, 60)
  const colfactLookupTimeoutSeconds = integerEnv(
    'COLFACT_LOOKUP_TIMEOUT_SECONDS', 90, 5, 600
  )
  const colfactLookupPollSeconds = integerEnv(
    'COLFACT_LOOKUP_POLL_SECONDS', 3, 1, 60
  )
  const screenshotRetentionHours = integerEnv('WIMAX_SCREENSHOT_RETENTION_HOURS', 24, 1, 168)
  const agentId = (process.env.WIMAX_AGENT_ID || `${hostname()}-session1`)
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .slice(0, 80)
  const runOnce = process.argv.includes('--once')

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const colfactClient = process.env.COLFACT_RECONCILE_ENABLED === 'true'
    ? createColfactClientFromEnv(process.env)
    : null
  const driver = new GuiDriver({ scriptPath: path.join(ROOT, 'gui-driver.ps1') })
  console.log(`${AGENT_VERSION}; agent=${agentId}; supervised=true`)

  await cleanupLocalEvidence(stateDir, screenshotRetentionHours)

  do {
    try {
      if (!withinAllowedHours(process.env.WIMAX_ALLOWED_HOURS)) {
        if (runOnce) console.log('Fuera de la ventana horaria configurada')
      } else {
        const desktop = await desktopReady(driver, profile, minIdleSeconds)
        if (!desktop.ready) {
          if (runOnce) console.log(`Sin reclamar: ${desktop.reason}`)
        } else {
          const claimed = await rpc(supabase, 'robot_wimax_reclamar', {
            p_agent_id: agentId,
          })
          const job = claimed?.job
          if (job) {
            await processJob({
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
            await cleanupLocalEvidence(stateDir, screenshotRetentionHours)
          } else if (runOnce) {
            console.log('No hay trabajos WiMAX listos')
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

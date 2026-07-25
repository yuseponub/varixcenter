import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

function collect(stream) {
  return new Promise((resolve, reject) => {
    let value = ''
    stream.setEncoding('utf8')
    stream.on('data', (chunk) => {
      value += chunk
    })
    stream.on('end', () => resolve(value))
    stream.on('error', reject)
  })
}

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function validRange(range) {
  return (
    range &&
    Number.isInteger(range.min) &&
    Number.isInteger(range.max) &&
    range.min >= 0 &&
    range.max >= range.min
  )
}

function startupEnvironment(companyPassword, includeCompanyPassword) {
  const environment = { ...process.env }
  for (const name of [
    'SUPABASE_SERVICE_KEY',
    'COLFACT_USERNAME',
    'COLFACT_PASSWORD',
    'COLFACT_EMISOR_NIT',
    'WIMAX_COMPANY_PASSWORD',
  ]) {
    delete environment[name]
  }
  if (includeCompanyPassword) {
    environment.WIMAX_COMPANY_PASSWORD = companyPassword
  }
  return environment
}

/**
 * Validates the second, deliberately separate profile used before WiMAX is
 * authenticated. Keeping it separate prevents credentials or startup clicks
 * from leaking into invoice evidence.
 */
export function validateStartupProfile(profile, invoiceProfile) {
  if (profile?.version !== 1 || profile.calibrated !== true) {
    throw new Error('CONFIG: el perfil de arranque WiMAX no esta calibrado')
  }
  if (
    profile.sessionId !== 'current' &&
    (!Number.isInteger(profile.sessionId) || profile.sessionId < 1)
  ) {
    throw new Error('CONFIG: sessionId de arranque debe ser positivo o current')
  }
  if (profile.sessionId !== invoiceProfile.sessionId) {
    throw new Error('CONFIG: los perfiles WiMAX no usan la misma sesion')
  }
  if (
    !positiveInteger(profile.display?.width) ||
    !positiveInteger(profile.display?.height) ||
    profile.display.width !== invoiceProfile.display?.width ||
    profile.display.height !== invoiceProfile.display?.height
  ) {
    throw new Error('CONFIG: los perfiles WiMAX no usan la misma resolucion')
  }

  const executable = profile.executable
  if (
    !nonEmpty(executable?.path) ||
    !/^[A-Za-z]:\\/.test(executable.path) ||
    path.win32.basename(executable.path).toLowerCase() !== 'wimax.exe' ||
    !nonEmpty(executable.workingDirectory) ||
    !/^[A-Za-z]:\\/.test(executable.workingDirectory) ||
    !/^[a-f0-9]{64}$/i.test(executable.sha256 ?? '') ||
    !positiveInteger(executable.length)
  ) {
    throw new Error('CONFIG: ejecutable WiMAX de arranque invalido')
  }
  const expectedExecutable = path.win32.join(executable.workingDirectory, 'WIMAX.EXE')
  if (expectedExecutable.toLowerCase() !== executable.path.toLowerCase()) {
    throw new Error('CONFIG: WIMAX.EXE debe estar dentro del directorio configurado')
  }

  if (
    profile.window?.process !== invoiceProfile.window?.process ||
    !nonEmpty(profile.window?.titlePattern) ||
    !nonEmpty(profile.window?.classPattern) ||
    !positiveInteger(profile.window?.width) ||
    !positiveInteger(profile.window?.height)
  ) {
    throw new Error('CONFIG: ventana principal WiMAX de arranque invalida')
  }
  if (
    !nonEmpty(profile.company?.exactName) ||
    !nonEmpty(profile.prefix?.exactName) ||
    !/^[A-Za-z0-9]{1,8}$/.test(profile.prefix?.keyboardCode ?? '') ||
    !nonEmpty(profile.prefix?.promptTextPattern) ||
    !nonEmpty(profile.dialogs?.companySelectorTitle) ||
    !nonEmpty(profile.dialogs?.loginTitlePattern) ||
    !nonEmpty(profile.dialogs?.prefixSelectorTitlePattern) ||
    !nonEmpty(profile.dialogs?.dailyReportTitlePattern) ||
    !nonEmpty(profile.dialogs?.auditTitlePattern) ||
    !nonEmpty(profile.dialogs?.reorganizationTitle) ||
    !nonEmpty(profile.dialogs?.acceptButton) ||
    !nonEmpty(profile.dialogs?.declineButton) ||
    !nonEmpty(profile.dialogs?.recommendedButton)
  ) {
    throw new Error('CONFIG: empresa o dialogos de arranque WiMAX invalidos')
  }

  const link = profile.companyLink
  if (
    !Number.isInteger(link?.x) ||
    !Number.isInteger(link?.y) ||
    link.x < 0 ||
    link.y < 0 ||
    link.x >= profile.window.width ||
    link.y >= profile.window.height
  ) {
    throw new Error('CONFIG: punto de seleccion de empresa invalido')
  }

  const indicator = profile.readyIndicator
  const region = indicator?.region
  if (
    !Number.isInteger(region?.x) ||
    !Number.isInteger(region?.y) ||
    !positiveInteger(region?.width) ||
    !positiveInteger(region?.height) ||
    region.x < 0 ||
    region.y < 0 ||
    region.x + region.width > profile.window.width ||
    region.y + region.height > profile.window.height ||
    !Number.isInteger(indicator?.blue?.minimum) ||
    !Number.isInteger(indicator?.blue?.maximumRed) ||
    !(indicator?.blue?.overRed > 1) ||
    !(indicator?.blue?.overGreen > 1)
  ) {
    throw new Error('CONFIG: detector visual WiMAX invalido')
  }
  for (const key of ['count', 'minX', 'maxX', 'minY', 'maxY']) {
    if (!validRange(indicator.expected?.[key])) {
      throw new Error(`CONFIG: rango ${key} del detector WiMAX invalido`)
    }
  }
  if (
    !Number.isInteger(profile.maxReorganizationPrompts) ||
    profile.maxReorganizationPrompts < 0 ||
    profile.maxReorganizationPrompts > 5
  ) {
    throw new Error('CONFIG: limite de avisos de reorganizacion invalido')
  }
  return profile
}

export function loadStartupProfile(file, invoiceProfile) {
  if (!existsSync(file)) throw new Error('CONFIG: no existe WIMAX_STARTUP_PROFILE')
  const profile = JSON.parse(readFileSync(file, 'utf8'))
  return validateStartupProfile(profile, invoiceProfile)
}

export class WimaxStartupDriver {
  constructor({ scriptPath, profile, companyPassword, timeoutSeconds = 120 }) {
    this.scriptPath = scriptPath
    this.profile = profile
    this.companyPassword = companyPassword
    this.timeoutSeconds = timeoutSeconds
  }

  async run(action, payload = {}) {
    const child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-STA',
        '-WindowStyle',
        'Hidden',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        this.scriptPath,
        '-Action',
        action,
      ],
      {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: startupEnvironment(this.companyPassword, action === 'Ensure'),
      }
    )
    const stdoutPromise = collect(child.stdout)
    const stderrPromise = collect(child.stderr)
    child.stdin.end(JSON.stringify({
      profile: this.profile,
      timeoutSeconds: this.timeoutSeconds,
      ...payload,
    }))

    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      child.kill()
    }, (this.timeoutSeconds + 15) * 1_000)
    const exitCode = await new Promise((resolve, reject) => {
      child.on('error', reject)
      child.on('close', resolve)
    }).finally(() => clearTimeout(timeout))
    const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise])
    if (timedOut) throw new Error(`WIMAX_STARTUP_TIMEOUT: ${action} excedio el limite`)
    if (exitCode !== 0) {
      const safeError = stderr.trim().split(/\r?\n/)[0] || `startup action ${action} failed`
      throw new Error(`WIMAX_STARTUP_DRIVER: ${safeError}`)
    }
    const line = stdout.trim().split(/\r?\n/).filter(Boolean).at(-1)
    if (!line) throw new Error(`WIMAX_STARTUP_DRIVER: ${action} sin respuesta`)
    try {
      return JSON.parse(line)
    } catch {
      throw new Error(`WIMAX_STARTUP_DRIVER: respuesta invalida para ${action}`)
    }
  }

  inspect() {
    return this.run('Inspect')
  }

  ensure(minimumIdleSeconds) {
    return this.run('Ensure', { minimumIdleSeconds })
  }
}

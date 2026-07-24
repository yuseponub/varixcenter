import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
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

export class GuiDriver {
  constructor({ scriptPath }) {
    this.scriptPath = scriptPath
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
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }
    )
    const stdoutPromise = collect(child.stdout)
    const stderrPromise = collect(child.stderr)
    child.stdin.end(JSON.stringify(payload))
    const exitCode = await new Promise((resolve, reject) => {
      child.on('error', reject)
      child.on('close', resolve)
    })
    const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise])
    if (exitCode !== 0) {
      const safeError = stderr.trim().split(/\r?\n/)[0] || `GUI action ${action} failed`
      throw new Error(`GUI_DRIVER: ${safeError}`)
    }
    const line = stdout.trim().split(/\r?\n/).filter(Boolean).at(-1)
    if (!line) throw new Error(`GUI_DRIVER: ${action} sin respuesta`)
    try {
      return JSON.parse(line)
    } catch {
      throw new Error(`GUI_DRIVER: respuesta invalida para ${action}`)
    }
  }

  inspect() {
    return this.run('Inspect')
  }

  focus(selector) {
    return this.run('Focus', selector)
  }

  sendKeys(selector, keys, delayMs = 350) {
    return this.run('SendKeys', { ...selector, keys, delayMs })
  }

  click(selector, x, y, delayMs = 350) {
    return this.run('Click', { ...selector, x, y, delayMs })
  }

  screenshot(file) {
    return this.run('Screenshot', { path: file })
  }

  promptUrgent(timeoutSeconds = 45) {
    return this.run('PromptUrgent', { timeoutSeconds })
  }
}

export function escapeSendKeysText(value) {
  return String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/([+^%~(){}\[\]])/g, '{$1}')
}

function valueAt(context, dottedPath) {
  return dottedPath.split('.').reduce((value, key) => value?.[key], context)
}

function template(value, context) {
  return String(value).replace(/\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g, (_, key) => {
    const resolved = valueAt(context, key)
    if (resolved === null || resolved === undefined) {
      throw new Error(`UI_PROFILE: falta ${key}`)
    }
    return String(resolved)
  })
}

function selectorMatches(window, selector = {}) {
  if (!window) return false
  if (selector.process && window.ProcessName?.toLowerCase() !== selector.process.toLowerCase()) {
    return false
  }
  if (selector.titlePattern && !new RegExp(selector.titlePattern, 'i').test(window.Title ?? '')) {
    return false
  }
  if (selector.classPattern && !new RegExp(selector.classPattern, 'i').test(window.ClassName ?? '')) {
    return false
  }
  return true
}

export class WimaxWorkflow {
  constructor({ driver, profile, stateDir, jobId }) {
    this.driver = driver
    this.profile = profile
    this.stateDir = stateDir
    this.jobId = jobId
    this.evidence = []
  }

  async waitFor(selector, timeoutMs = 10_000) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const desktop = await this.driver.inspect()
      const match = selector.foreground
        ? selectorMatches(desktop.foreground, selector)
        : desktop.windows?.find((window) => selectorMatches(window, selector))
      if (match) return match
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    throw new Error('UI_EXPECTATION: la ventana esperada no aparecio')
  }

  async capture(label) {
    const directory = path.join(this.stateDir, this.jobId)
    await mkdir(directory, { recursive: true })
    const safeLabel = label.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)
    const file = path.join(directory, `${String(this.evidence.length + 1).padStart(2, '0')}-${safeLabel}.png`)
    await this.driver.screenshot(file)
    const digest = createHash('sha256').update(await readFile(file)).digest('hex')
    this.evidence.push({ step: safeLabel, screenshot_sha256: digest })
    return file
  }

  async run(flowName, context) {
    const steps = this.profile.flows?.[flowName]
    if (!Array.isArray(steps) || steps.length === 0) {
      throw new Error(`UI_PROFILE: flujo ${flowName} no configurado`)
    }

    for (const [index, step] of steps.entries()) {
      const label = step.name || `${flowName}-${index + 1}`
      const target = step.target ?? { foreground: true, process: this.profile.window.process }
      if (step.action === 'focus') {
        await this.driver.focus(step.target ?? this.profile.window)
      } else if (step.action === 'keys') {
        await this.driver.sendKeys(target, template(step.keys, context), step.delayMs)
      } else if (step.action === 'text') {
        await this.driver.sendKeys(
          target,
          escapeSendKeysText(template(step.value, context)),
          step.delayMs
        )
      } else if (step.action === 'click') {
        await this.driver.click(target, step.x, step.y, step.delayMs)
      } else if (step.action === 'wait') {
        const delay = Math.min(Math.max(Number(step.ms) || 0, 0), 10_000)
        await new Promise((resolve) => setTimeout(resolve, delay))
      } else if (step.action === 'assert') {
        await this.waitFor(step.expect, step.timeoutMs)
      } else if (step.action === 'screenshot') {
        await this.capture(label)
      } else {
        throw new Error(`UI_PROFILE: accion desconocida ${step.action}`)
      }

      if (step.expect) await this.waitFor(step.expect, step.timeoutMs)
      if (step.capture === true) await this.capture(label)
      this.evidence.push({ step: label, ok: true })
    }
  }
}

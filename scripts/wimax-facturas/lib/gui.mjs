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

  setInlineFields(selector, control, values, delayMs = 200, commitDelayMs = 1_200) {
    return this.run('SetInlineFields', {
      ...selector,
      control,
      values: values.map((value) => String(value)),
      delayMs,
      commitDelayMs,
    })
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
  if (selector.textPattern && !new RegExp(selector.textPattern, 'i').test(window.ChildText ?? '')) {
    return false
  }
  return true
}

function desktopMatch(desktop, selector) {
  if (selector.foreground) {
    return selectorMatches(desktop.foreground, selector) ? desktop.foreground : null
  }
  const matches = (desktop.windows ?? []).filter((window) => selectorMatches(window, selector))
  if (matches.length > 1) {
    throw new Error('UI_EXPECTATION: varias ventanas coinciden con el selector')
  }
  return matches[0] ?? null
}

function explicitOptionalTarget(target) {
  return (
    target &&
    typeof target === 'object' &&
    ['process', 'titlePattern', 'classPattern', 'textPattern'].some((key) => target[key])
  )
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
      const match = desktopMatch(desktop, selector)
      if (match) return match
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    throw new Error('UI_EXPECTATION: la ventana esperada no aparecio')
  }

  async waitForOptional(selector, timeoutMs = 0) {
    const boundedTimeout = Math.min(Math.max(Number(timeoutMs) || 0, 0), 10_000)
    const deadline = Date.now() + boundedTimeout
    do {
      const match = desktopMatch(await this.driver.inspect(), selector)
      if (match) return match
      if (Date.now() >= deadline) return null
      await new Promise((resolve) => setTimeout(resolve, 250))
    } while (true)
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
      let executed = true
      if (step.action === 'focus') {
        await this.driver.focus(step.target ?? this.profile.window)
      } else if (step.action === 'keys') {
        await this.driver.sendKeys(target, template(step.keys, context), step.delayMs)
      } else if (step.action === 'keysIf') {
        if (!explicitOptionalTarget(step.target)) {
          throw new Error(`UI_PROFILE: ${label} requiere target explicito`)
        }
        if (await this.waitForOptional(step.target, step.ifTimeoutMs)) {
          await this.driver.sendKeys(step.target, template(step.keys, context), step.delayMs)
        } else {
          executed = false
        }
      } else if (step.action === 'text') {
        const value = escapeSendKeysText(template(step.value, context))
        if (value) {
          await this.driver.sendKeys(target, value, step.delayMs)
        } else {
          executed = false
        }
      } else if (step.action === 'click') {
        await this.driver.click(target, step.x, step.y, step.delayMs)
        if (step.retryIfSameMs !== undefined) {
          if (!explicitOptionalTarget(step.target)) {
            throw new Error(`UI_PROFILE: ${label} requiere target explicito para reintentar`)
          }
          const retryDelay = Math.min(Math.max(Number(step.retryIfSameMs) || 0, 250), 5_000)
          await new Promise((resolve) => setTimeout(resolve, retryDelay))
          if (await this.waitForOptional(step.target, 0)) {
            await this.driver.click(target, step.x, step.y, step.delayMs)
          }
        }
      } else if (step.action === 'clickIf') {
        if (!explicitOptionalTarget(step.target)) {
          throw new Error(`UI_PROFILE: ${label} requiere target explicito`)
        }
        if (await this.waitForOptional(step.target, step.ifTimeoutMs)) {
          await this.driver.click(step.target, step.x, step.y, step.delayMs)
          if (step.retryIfSameMs !== undefined) {
            const retryDelay = Math.min(
              Math.max(Number(step.retryIfSameMs) || 0, 250),
              5_000
            )
            await new Promise((resolve) => setTimeout(resolve, retryDelay))
            if (await this.waitForOptional(step.target, 0)) {
              await this.driver.click(step.target, step.x, step.y, step.delayMs)
            }
          }
        } else {
          executed = false
        }
      } else if (step.action === 'setInlineFields') {
        if (
          !step.control ||
          step.control.expectedCount !== 3 ||
          !Array.isArray(step.values) ||
          step.values.length !== 3
        ) {
          throw new Error(`UI_PROFILE: ${label} requiere exactamente tres Edit`)
        }
        await this.driver.setInlineFields(
          target,
          step.control,
          step.values.map((value) => template(value, context)),
          step.delayMs,
          step.commitDelayMs
        )
      } else if (step.action === 'wait') {
        const delay = Math.min(Math.max(Number(step.ms) || 0, 0), 10_000)
        await new Promise((resolve) => setTimeout(resolve, delay))
      } else if (step.action === 'assert') {
        if (!step.expect) throw new Error(`UI_PROFILE: ${label} requiere expect`)
      } else if (step.action === 'screenshot') {
        await this.capture(label)
      } else {
        throw new Error(`UI_PROFILE: accion desconocida ${step.action}`)
      }

      if (executed && step.expect) {
        await this.waitFor(step.expect, step.expectTimeoutMs ?? step.timeoutMs)
      }
      if (executed && step.capture === true) await this.capture(label)
      this.evidence.push({ step: label, ok: true, ...(executed ? {} : { skipped: true }) })
    }
  }
}

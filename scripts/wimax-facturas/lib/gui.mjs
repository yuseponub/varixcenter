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

  pressButton(selector, x, y, delayMs = 350) {
    return this.run('PressButton', { ...selector, x, y, delayMs })
  }

  invokeButton(selector, x, y, delayMs = 350) {
    return this.run('InvokeButton', { ...selector, x, y, delayMs })
  }

  tabUntilChange(selector, maxTabs = 30, tabDelayMs = 150, delayMs = 350) {
    return this.run('TabUntilChange', {
      ...selector,
      maxTabs,
      tabDelayMs,
      delayMs,
    })
  }

  moveEdit(selector, control, keys = '{TAB}', delayMs = 350, timeoutMs = 5_000) {
    return this.run('MoveEdit', {
      ...selector,
      control,
      keys,
      delayMs,
      timeoutMs,
    })
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
  if (selector.handle && Number(window.Handle) !== Number(selector.handle)) return false
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
    ['handle', 'process', 'titlePattern', 'classPattern', 'textPattern'].some((key) => target[key])
  )
}

function annotateStepError(error, flowName, label) {
  const message = error instanceof Error ? error.message : String(error)
  const prefixed = message.match(/^([A-Z_]{3,40}):\s*(.*)$/s)
  const annotated = prefixed
    ? `${prefixed[1]}: ${flowName}/${label}: ${prefixed[2]}`
    : `UI_STEP: ${flowName}/${label}: ${message}`
  return new Error(annotated, error instanceof Error ? { cause: error } : undefined)
}

export class WimaxWorkflow {
  constructor({ driver, profile, stateDir, jobId }) {
    this.driver = driver
    this.profile = profile
    this.stateDir = stateDir
    this.jobId = jobId
    this.evidence = []
    this.decisions = new Map()
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

  async waitForAny(branches, timeoutMs = 10_000) {
    if (!Array.isArray(branches) || branches.length < 2 || branches.length > 10) {
      throw new Error('UI_PROFILE: waitAny requiere entre dos y diez ramas')
    }
    const names = new Set()
    for (const branch of branches) {
      if (
        !branch ||
        typeof branch.name !== 'string' ||
        !/^[A-Za-z0-9._-]{1,80}$/.test(branch.name) ||
        names.has(branch.name) ||
        !explicitOptionalTarget(branch.target)
      ) {
        throw new Error('UI_PROFILE: waitAny requiere ramas unicas con target explicito')
      }
      names.add(branch.name)
    }

    const boundedTimeout = Math.min(
      Math.max(Number(timeoutMs) || 10_000, 250),
      360_000,
    )
    const deadline = Date.now() + boundedTimeout
    while (Date.now() < deadline) {
      const desktop = await this.driver.inspect()
      const matches = branches
        .map((branch) => ({
          name: branch.name,
          window: desktopMatch(desktop, branch.target),
        }))
        .filter((branch) => branch.window)
      if (matches.length > 1) {
        throw new Error('UI_EXPECTATION: varias ramas waitAny coinciden a la vez')
      }
      if (matches.length === 1) return matches[0]
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    throw new Error('UI_EXPECTATION: ninguna rama waitAny aparecio antes del limite')
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

  async run(flowName, context, { startAt = null } = {}) {
    const configuredSteps = this.profile.flows?.[flowName]
    if (!Array.isArray(configuredSteps) || configuredSteps.length === 0) {
      throw new Error(`UI_PROFILE: flujo ${flowName} no configurado`)
    }
    let steps = configuredSteps
    if (startAt !== null) {
      if (typeof startAt !== 'string' || !/^[A-Za-z0-9._-]{1,80}$/.test(startAt)) {
        throw new Error(`UI_PROFILE: inicio invalido para ${flowName}`)
      }
      const startIndex = configuredSteps.findIndex((step) => step.name === startAt)
      if (startIndex < 0) {
        throw new Error(`UI_PROFILE: ${flowName} no contiene el paso ${startAt}`)
      }
      steps = configuredSteps.slice(startIndex)
    }

    for (const [index, step] of steps.entries()) {
      const label = step.name || `${flowName}-${index + 1}`
      try {
      if (step.when !== undefined) {
        const decision = step.when?.decision
        const expected = step.when?.is
        const allowed = Array.isArray(expected) ? expected : [expected]
        if (
          typeof decision !== 'string' ||
          !/^[A-Za-z0-9._-]{1,80}$/.test(decision) ||
          allowed.length === 0 ||
          allowed.some((value) => typeof value !== 'string')
        ) {
          throw new Error(`UI_PROFILE: ${label} tiene una condicion when invalida`)
        }
        if (!this.decisions.has(decision)) {
          throw new Error(`UI_PROFILE: ${label} depende de una decision no resuelta`)
        }
        if (!allowed.includes(this.decisions.get(decision))) {
          this.evidence.push({ step: label, ok: true, skipped: true })
          continue
        }
      }
      const target = step.target ?? { foreground: true, process: this.profile.window.process }
      let executed = true
      let outcome = {}
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
      } else if (step.action === 'pressButton') {
        await this.driver.pressButton(target, step.x, step.y, step.delayMs)
      } else if (step.action === 'pressButtonIf') {
        if (!explicitOptionalTarget(step.target)) {
          throw new Error(`UI_PROFILE: ${label} requiere target explicito`)
        }
        if (await this.waitForOptional(step.target, step.ifTimeoutMs)) {
          await this.driver.pressButton(step.target, step.x, step.y, step.delayMs)
        } else {
          executed = false
        }
      } else if (step.action === 'invokeButton') {
        await this.driver.invokeButton(target, step.x, step.y, step.delayMs)
      } else if (step.action === 'invokeButtonIf') {
        if (!explicitOptionalTarget(step.target)) {
          throw new Error(`UI_PROFILE: ${label} requiere target explicito`)
        }
        if (await this.waitForOptional(step.target, step.ifTimeoutMs)) {
          await this.driver.invokeButton(step.target, step.x, step.y, step.delayMs)
        } else {
          executed = false
        }
      } else if (step.action === 'tabUntilChange') {
        const maxTabs = Number(step.maxTabs)
        if (!Number.isInteger(maxTabs) || maxTabs < 1 || maxTabs > 60) {
          throw new Error(`UI_PROFILE: ${label} requiere maxTabs entre 1 y 60`)
        }
        await this.driver.tabUntilChange(
          target,
          maxTabs,
          step.tabDelayMs,
          step.delayMs,
        )
      } else if (step.action === 'waitTextAbsent') {
        if (!explicitOptionalTarget(step.target) || !step.textPattern) {
          throw new Error(`UI_PROFILE: ${label} requiere target explicito y textPattern`)
        }
        const timeoutMs = Math.min(Math.max(Number(step.timeoutMs) || 30_000, 250), 60_000)
        const stableMs = Math.min(Math.max(Number(step.stableMs) || 0, 0), 10_000)
        const pattern = new RegExp(template(step.textPattern, context), 'i')
        const deadline = Date.now() + timeoutMs
        let absentSince = null
        do {
          const window = desktopMatch(await this.driver.inspect(), step.target)
          const absent = window && !pattern.test(String(window.ChildText ?? ''))
          if (absent) {
            absentSince ??= Date.now()
            if (Date.now() - absentSince >= stableMs) break
          } else {
            absentSince = null
          }
          if (Date.now() >= deadline) {
            throw new Error(`UI_EXPECTATION: ${label} no termino antes del limite`)
          }
          await new Promise((resolve) => setTimeout(resolve, 250))
        } while (true)
      } else if (step.action === 'assertControlAbsent') {
        if (
          !step.control ||
          step.control.relativeLeft === undefined ||
          step.control.relativeTop === undefined
        ) {
          throw new Error(`UI_PROFILE: ${label} requiere control con posicion relativa`)
        }
        const tolerance = Math.min(Math.max(Number(step.control.tolerance) || 5, 0), 20)
        const classPattern = new RegExp(step.control.classPattern ?? '^Edit$', 'i')
        const timeoutMs = Math.min(Math.max(Number(step.timeoutMs) || 5_000, 250), 10_000)
        const deadline = Date.now() + timeoutMs
        do {
          const inspected = await this.driver.run('InspectControls', target)
          const matches = (inspected.controls ?? []).filter((control) =>
            control.Enabled &&
            classPattern.test(control.ClassName ?? '') &&
            Math.abs(
              (Number(control.Left) - Number(inspected.window.Left)) -
              Number(step.control.relativeLeft)
            ) <= tolerance &&
            Math.abs(
              (Number(control.Top) - Number(inspected.window.Top)) -
              Number(step.control.relativeTop)
            ) <= tolerance
          )
          if (matches.length === 0) break
          if (Date.now() >= deadline) {
            throw new Error(`UI_EXPECTATION: ${label} todavia encontro el control`)
          }
          await new Promise((resolve) => setTimeout(resolve, 250))
        } while (true)
      } else if (step.action === 'assertText') {
        if (step.value === undefined) {
          throw new Error(`UI_PROFILE: ${label} requiere value`)
        }
        const expected = template(step.value, context)
        if (step.normalize && step.normalize !== 'digits') {
          throw new Error(`UI_PROFILE: ${label} usa normalizacion no soportada`)
        }
        const timeoutMs = Math.min(Math.max(Number(step.timeoutMs) || 10_000, 250), 10_000)
        const deadline = Date.now() + timeoutMs
        let matched = false
        do {
          const window = desktopMatch(await this.driver.inspect(), target)
          if (window) {
            const childText = String(window.ChildText ?? '')
            if (step.normalize === 'digits') {
              const expectedDigits = expected.replace(/\D/g, '')
              matched = Boolean(expectedDigits) && childText.split(/\r?\n/).some(
                (line) => line.replace(/\D/g, '') === expectedDigits
              )
            } else {
              matched = childText.includes(expected)
            }
          }
          if (matched) break
          if (Date.now() >= deadline) {
            throw new Error(`UI_EXPECTATION: ${label} no confirmo el texto esperado`)
          }
          await new Promise((resolve) => setTimeout(resolve, 250))
        } while (true)
      } else if (step.action === 'assertEditValue') {
        if (!step.control || step.value === undefined) {
          throw new Error(`UI_PROFILE: ${label} requiere control y value`)
        }
        await this.driver.run('AssertEditValue', {
          ...target,
          control: step.control,
          value: template(step.value, context),
          normalize: step.normalize,
          timeoutMs: step.timeoutMs,
        })
      } else if (step.action === 'moveEdit') {
        if (!step.control?.from || !step.control?.to || step.keys !== '{TAB}') {
          throw new Error(`UI_PROFILE: ${label} requiere from, to y una tecla TAB`)
        }
        await this.driver.moveEdit(
          target,
          step.control,
          step.keys,
          step.delayMs,
          step.timeoutMs,
        )
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
      } else if (step.action === 'waitAny') {
        if (
          typeof step.rememberAs !== 'string' ||
          !/^[A-Za-z0-9._-]{1,80}$/.test(step.rememberAs) ||
          this.decisions.has(step.rememberAs)
        ) {
          throw new Error(`UI_PROFILE: ${label} requiere rememberAs unico`)
        }
        const result = await this.waitForAny(step.branches, step.timeoutMs)
        this.decisions.set(step.rememberAs, result.name)
        outcome = { branch: result.name }
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
      this.evidence.push({
        step: label,
        ok: true,
        ...(executed ? outcome : { skipped: true }),
      })
      } catch (error) {
        throw annotateStepError(error, flowName, label)
      }
    }
  }
}

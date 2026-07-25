import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { WimaxWorkflow } from '../lib/gui.mjs'

const mainWindow = {
  ProcessName: 'WX',
  Title: 'Wimax Software',
  ClassName: 'XbpDialog',
  ChildText: '',
}

const promptWindow = {
  ProcessName: 'WX',
  Title: 'Facturacion',
  ClassName: '#32770',
  ChildText: 'Desea trabajar con otra factura?',
}

class FakeDriver {
  constructor(inspections = []) {
    this.inspections = [...inspections]
    this.calls = []
  }

  async inspect() {
    this.calls.push(['inspect'])
    return this.inspections.shift() ?? { foreground: mainWindow, windows: [mainWindow] }
  }

  async sendKeys(target, keys, delayMs) {
    this.calls.push(['keys', target, keys, delayMs])
  }

  async click(target, x, y, delayMs) {
    this.calls.push(['click', target, x, y, delayMs])
  }

  async setInlineFields(target, control, values, delayMs, commitDelayMs) {
    this.calls.push(['inline', target, control, values, delayMs, commitDelayMs])
  }
}

function workflow(driver, steps) {
  return new WimaxWorkflow({
    driver,
    profile: { window: { process: 'WX' }, flows: { test: steps } },
    stateDir: 'unused',
    jobId: 'unused',
  })
}

test('keysIf y clickIf no envian entrada cuando la ventana opcional no existe', async () => {
  const desktop = { foreground: mainWindow, windows: [mainWindow] }
  const driver = new FakeDriver([desktop, desktop])
  const subject = workflow(driver, [
    {
      name: 'prompt-opcional',
      action: 'keysIf',
      target: { process: 'WX', titlePattern: '^Facturacion$', classPattern: '^#32770$' },
      keys: '{ENTER}',
    },
    {
      name: 'click-opcional',
      action: 'clickIf',
      target: { process: 'WX', titlePattern: '^Auditoria General$' },
      x: 10,
      y: 20,
    },
  ])

  await subject.run('test', {})

  assert.deepEqual(driver.calls.map(([action]) => action), ['inspect', 'inspect'])
  assert.deepEqual(subject.evidence, [
    { step: 'prompt-opcional', ok: true, skipped: true },
    { step: 'click-opcional', ok: true, skipped: true },
  ])
})

test('keysIf exige tambien el texto hijo calibrado antes de actuar', async () => {
  const desktop = { foreground: promptWindow, windows: [promptWindow] }
  const driver = new FakeDriver([desktop])
  const target = {
    foreground: true,
    process: 'WX',
    titlePattern: '^Facturacion$',
    classPattern: '^#32770$',
    textPattern: '^Desea trabajar con otra factura\\?$',
  }
  const subject = workflow(driver, [
    { name: 'otra-factura', action: 'keysIf', target, keys: '{TAB}{ENTER}' },
  ])

  await subject.run('test', {})

  assert.deepEqual(driver.calls, [
    ['inspect'],
    ['keys', target, '{TAB}{ENTER}', undefined],
  ])
  assert.deepEqual(subject.evidence, [{ step: 'otra-factura', ok: true }])
})

test('clickIf reintenta una vez solo si sigue la misma ventana exacta', async () => {
  const desktop = { foreground: promptWindow, windows: [promptWindow] }
  const target = {
    process: 'WX',
    titlePattern: '^Facturacion$',
    classPattern: '^#32770$',
    textPattern: '^Desea trabajar con otra factura\\?$',
  }
  const driver = new FakeDriver([desktop, desktop])
  const subject = workflow(driver, [
    {
      name: 'no-otra-factura',
      action: 'clickIf',
      target,
      x: 210,
      y: 123,
      retryIfSameMs: 250,
    },
  ])

  await subject.run('test', {})

  assert.deepEqual(driver.calls, [
    ['inspect'],
    ['click', target, 210, 123, undefined],
    ['inspect'],
    ['click', target, 210, 123, undefined],
  ])
})

test('setInlineFields planta cantidad, precio y descuento en una sola accion', async () => {
  const driver = new FakeDriver()
  const target = {
    foreground: true,
    process: 'WX',
    titlePattern: '^\\s*$',
    classPattern: '^XbpDialog$',
  }
  const control = {
    classPattern: '^Edit$',
    expectedCount: 3,
    orderBy: 'left',
  }
  const subject = workflow(driver, [
    {
      name: 'linea',
      action: 'setInlineFields',
      target,
      control,
      values: ['{{item.quantity}}', '{{item.unitPrice}}', '0'],
      delayMs: 200,
      commitDelayMs: 1200,
    },
  ])

  await subject.run('test', { item: { quantity: 2, unitPrice: 175000 } })

  assert.deepEqual(driver.calls, [
    ['inline', target, control, ['2', '175000', '0'], 200, 1200],
  ])
})

test('los pasos opcionales rechazan un target implicito inseguro', async () => {
  const subject = workflow(new FakeDriver(), [
    { name: 'escape-ciego', action: 'keysIf', keys: '{ESC}' },
  ])

  await assert.rejects(() => subject.run('test', {}), /requiere target explicito/)
})

test('text omite valores opcionales vacios sin invocar SendKeys', async () => {
  const driver = new FakeDriver()
  const subject = workflow(driver, [
    { name: 'segundo-nombre', action: 'text', value: '{{customer.segundoNombre}}' },
  ])

  await subject.run('test', { customer: { segundoNombre: '' } })

  assert.deepEqual(driver.calls, [])
  assert.deepEqual(subject.evidence, [
    { step: 'segundo-nombre', ok: true, skipped: true },
  ])
})

test('el driver nativo edita tres controles de forma atomica y confirma la linea', async () => {
  const source = await readFile(new URL('../gui-driver.ps1', import.meta.url), 'utf8')

  assert.match(source, /'SetInlineFields'/)
  assert.match(source, /EnumChildWindows/)
  assert.match(source, /Sort-Object Left, Top, ControlId/)
  assert.match(source, /Se esperaban \$expectedCount controles Edit/)
  assert.match(source, /SetCursorPos\(\$x, \$y\)/)
  assert.match(source, /SendKeys\]::SendWait\('\^a'\)/)
  assert.match(source, /Test-InlineNumericValue/)
  assert.match(source, /NativeGui\]::TextValue/)
  assert.match(source, /no confirmo el valor esperado/)
  assert.match(source, /SendKeys\]::SendWait\('\{ENTER\}'\)/)
})

test('el perfil de CONTABILIDAD conserva el flujo frio y las barreras calibradas', async () => {
  const profile = JSON.parse(
    await readFile(new URL('../robot-profile.contabilidad.example.json', import.meta.url), 'utf8')
  )
  const requiredFlows = [
    'openInvoice',
    'openCustomerDirectory',
    'createCustomer',
    'prepareInvoice',
    'addItem',
    'finishBeforeApproval',
    'emit',
    'abort',
  ]

  assert.equal(profile.calibrated, true)
  assert.deepEqual(Object.keys(profile.flows).sort(), requiredFlows.sort())
  assert.equal(profile.flows.openInvoice[1].keys, '%m{DOWN}{RIGHT}{ENTER}')
  assert.equal(profile.flows.openInvoice[1].expectTimeoutMs, 30_000)
  assert.match(' Facturacion -Ventas - VARIX CENTER S.A.S 2026', new RegExp(
    profile.flows.openInvoice[1].expect.titlePattern,
    'i'
  ))

  const lineStep = profile.flows.addItem.find((step) => step.action === 'setInlineFields')
  assert.equal(lineStep.control.expectedCount, 3)
  assert.deepEqual(lineStep.values, ['{{item.quantity}}', '{{item.unitPrice}}', '0'])

  const irreversible = profile.flows.emit[0]
  assert.equal(irreversible.name, 'aceptar-asiento-irreversible')
  assert.equal(irreversible.action, 'click')

  const abortInputs = profile.flows.abort.filter((step) =>
    ['keysIf', 'clickIf'].includes(step.action)
  )
  assert.ok(abortInputs.every((step) => step.target.process === 'WX'))
  assert.ok(abortInputs.every((step) => step.target.foreground !== true))
  const promptClicks = profile.flows.abort.filter((step) => step.action === 'clickIf')
  assert.ok(promptClicks.every((step) => step.retryIfSameMs === 1500))
})

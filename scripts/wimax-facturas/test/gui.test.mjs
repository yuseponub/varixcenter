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

  async pressButton(target, x, y, delayMs) {
    this.calls.push(['press-button', target, x, y, delayMs])
  }

  async invokeButton(target, x, y, delayMs) {
    this.calls.push(['invoke-button', target, x, y, delayMs])
  }

  async tabUntilChange(target, maxTabs, tabDelayMs, delayMs) {
    this.calls.push(['tab-until-change', target, maxTabs, tabDelayMs, delayMs])
  }

  async run(action, payload) {
    this.calls.push(['run', action, payload])
    if (action === 'InspectControls') {
      return { window: { Left: 560, Top: 265 }, controls: [] }
    }
  }

  async setInlineFields(target, control, values, delayMs, commitDelayMs) {
    this.calls.push(['inline', target, control, values, delayMs, commitDelayMs])
  }

  async selectComboExact(target, control, value, delayMs, timeoutMs) {
    this.calls.push(['select-combo-exact', target, control, value, delayMs, timeoutMs])
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

test('pressButton y su variante opcional se ejecutan de forma atomica', async () => {
  const desktop = { foreground: promptWindow, windows: [promptWindow] }
  const target = {
    process: 'WX',
    titlePattern: '^Facturacion$',
    classPattern: '^#32770$',
    textPattern: '^Desea trabajar con otra factura\\?$',
  }
  const driver = new FakeDriver([desktop])
  const subject = workflow(driver, [
    { name: 'boton', action: 'pressButton', target, x: 210, y: 123, delayMs: 700 },
    { name: 'boton-opcional', action: 'pressButtonIf', target, x: 210, y: 123 },
  ])

  await subject.run('test', {})

  assert.deepEqual(driver.calls, [
    ['press-button', target, 210, 123, 700],
    ['inspect'],
    ['press-button', target, 210, 123, undefined],
  ])
})

test('invokeButton y su variante opcional activan el control nativo calibrado', async () => {
  const desktop = { foreground: promptWindow, windows: [promptWindow] }
  const target = {
    process: 'WX',
    titlePattern: '^Facturacion$',
    classPattern: '^#32770$',
    textPattern: '^Desea trabajar con otra factura\\?$',
  }
  const driver = new FakeDriver([desktop])
  const subject = workflow(driver, [
    { name: 'boton', action: 'invokeButton', target, x: 210, y: 123, delayMs: 700 },
    { name: 'boton-opcional', action: 'invokeButtonIf', target, x: 210, y: 123 },
  ])

  await subject.run('test', {})

  assert.deepEqual(driver.calls, [
    ['invoke-button', target, 210, 123, 700],
    ['inspect'],
    ['invoke-button', target, 210, 123, undefined],
  ])
})

test('selectComboExact exige y envia el valor exacto al control nativo', async () => {
  const driver = new FakeDriver()
  const target = { process: 'WX', titlePattern: '^El Directorio Principal$' }
  const control = { classPattern: '^ComboBox$', relativeLeft: 447, relativeTop: 350 }
  const subject = workflow(driver, [{
    name: 'departamento',
    action: 'selectComboExact',
    target,
    control,
    value: '{{customer.department}}',
    delayMs: 800,
    timeoutMs: 5000,
  }])

  await subject.run('test', { customer: { department: 'Santander' } })

  assert.deepEqual(driver.calls, [
    ['select-combo-exact', target, control, 'Santander', 800, 5000],
  ])
})

test('tabUntilChange y assertControlAbsent conservan limites y selector estructural', async () => {
  const driver = new FakeDriver()
  const target = {
    foreground: true,
    process: 'WX',
    titlePattern: '^Facturacion$',
    classPattern: '^XbpDialog$',
  }
  const subject = workflow(driver, [
    {
      name: 'cliente-cargado',
      action: 'assertControlAbsent',
      target,
      control: {
        classPattern: '^Edit$',
        relativeLeft: 330,
        relativeTop: 50,
        tolerance: 6,
      },
      timeoutMs: 5000,
    },
    {
      name: 'avanzar-hasta-detalle',
      action: 'tabUntilChange',
      target,
      maxTabs: 30,
      tabDelayMs: 150,
      delayMs: 700,
    },
  ])

  await subject.run('test', {})

  assert.deepEqual(driver.calls, [
    ['run', 'InspectControls', {
      ...target,
    }],
    ['tab-until-change', target, 30, 150, 700],
  ])
})

test('waitTextAbsent espera a que el estado de carga desaparezca', async () => {
  const loadingMain = { ...mainWindow, ChildText: 'Abriendo archivos ...' }
  const readyMain = { ...mainWindow, ChildText: 'Seleccione su opcion' }
  const driver = new FakeDriver([
    { foreground: loadingMain, windows: [loadingMain] },
    { foreground: readyMain, windows: [readyMain] },
  ])
  const target = {
    process: 'WX',
    titlePattern: '^Wimax Software$',
    classPattern: '^XbpDialog$',
  }
  const subject = workflow(driver, [
    {
      name: 'archivos-listos',
      action: 'waitTextAbsent',
      target,
      textPattern: 'Abriendo archivos',
      timeoutMs: 2000,
      stableMs: 0,
    },
  ])

  await subject.run('test', {})

  assert.deepEqual(driver.calls, [['inspect'], ['inspect']])
})

test('waitAny recuerda una sola rama y ejecuta unicamente sus pasos', async () => {
  const printPrompt = {
    ProcessName: 'WX',
    Title: 'Facturacion',
    ClassName: '#32770',
    ChildText: 'Desea imprimir la factura?',
  }
  const driver = new FakeDriver([
    { foreground: printPrompt, windows: [printPrompt] },
  ])
  const subject = workflow(driver, [
    {
      name: 'salida-asiento',
      action: 'waitAny',
      rememberAs: 'salida-asiento',
      branches: [
        {
          name: 'impresion',
          target: {
            process: 'WX',
            titlePattern: '^Facturacion$',
            textPattern: 'imprimir la factura',
          },
        },
        {
          name: 'opciones',
          target: {
            process: 'WX',
            titlePattern: '^\\s*$',
            textPattern: 'Rendondea IVA',
          },
        },
      ],
    },
    {
      name: 'aceptar-impresion',
      action: 'keys',
      when: { decision: 'salida-asiento', is: 'impresion' },
      target: { process: 'WX', titlePattern: '^Facturacion$' },
      keys: '{ENTER}',
    },
    {
      name: 'aceptar-opciones',
      action: 'keys',
      when: { decision: 'salida-asiento', is: 'opciones' },
      target: { process: 'WX', titlePattern: '^\\s*$' },
      keys: '{ENTER}',
    },
  ])

  await subject.run('test', {})

  assert.deepEqual(driver.calls, [
    ['inspect'],
    ['keys', { process: 'WX', titlePattern: '^Facturacion$' }, '{ENTER}', undefined],
  ])
  assert.deepEqual(subject.evidence, [
    { step: 'salida-asiento', ok: true, branch: 'impresion' },
    { step: 'aceptar-impresion', ok: true },
    { step: 'aceptar-opciones', ok: true, skipped: true },
  ])
})

test('waitAny rechaza coincidencias ambiguas antes de enviar entrada', async () => {
  const desktop = { foreground: promptWindow, windows: [promptWindow] }
  const subject = workflow(new FakeDriver([desktop]), [
    {
      name: 'resultado',
      action: 'waitAny',
      rememberAs: 'resultado',
      branches: [
        { name: 'uno', target: { process: 'WX', titlePattern: '^Facturacion$' } },
        { name: 'dos', target: { process: 'WX', textPattern: 'otra factura' } },
      ],
    },
  ])

  await assert.rejects(
    () => subject.run('test', {}),
    /varias ramas waitAny coinciden/,
  )
})

test('when falla cerrado si la decision requerida no existe', async () => {
  const subject = workflow(new FakeDriver(), [
    {
      name: 'paso-condicional',
      action: 'keys',
      when: { decision: 'no-resuelta', is: 'si' },
      keys: '{ENTER}',
    },
  ])

  await assert.rejects(
    () => subject.run('test', {}),
    /decision no resuelta/,
  )
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

test('startAt omite solo el prefijo calibrado y exige un paso existente', async () => {
  const driver = new FakeDriver()
  const subject = workflow(driver, [
    { name: 'recargar-tipo-y-cliente', action: 'keys', keys: 'FE' },
    { name: 'metodo-campo', action: 'keys', keys: '1' },
  ])

  await subject.run('test', {}, { startAt: 'metodo-campo' })

  assert.deepEqual(driver.calls, [
    ['keys', { foreground: true, process: 'WX' }, '1', undefined],
  ])
  await assert.rejects(
    () => subject.run('test', {}, { startAt: 'paso-inexistente' }),
    /no contiene el paso paso-inexistente/,
  )
})

test('los errores conservan su codigo e identifican flujo y paso', async () => {
  const subject = workflow(new FakeDriver(), [
    { name: 'paso-calibrado', action: 'desconocida' },
  ])

  await assert.rejects(
    () => subject.run('test', {}),
    /UI_PROFILE: test\/paso-calibrado: accion desconocida desconocida/,
  )
})

test('el driver nativo edita tres controles de forma atomica y confirma la linea', async () => {
  const source = await readFile(new URL('../gui-driver.ps1', import.meta.url), 'utf8')

  assert.match(source, /\[Console\]::InputEncoding = \$utf8/)
  assert.match(source, /\[Console\]::OutputEncoding = \$utf8/)
  assert.ok(
    source.indexOf('[Console]::InputEncoding = $utf8') < source.indexOf('function Read-Payload'),
    'stdin debe fijarse a UTF-8 antes de leer el JSON de Node',
  )
  assert.match(source, /'MoveEdit'/)
  assert.match(source, /Wait-MatchingEdit/)
  assert.match(source, /MoveEdit solo admite una tecla TAB/)
  assert.match(source, /'SetInlineFields'/)
  assert.match(source, /'PressButton'/)
  assert.match(source, /afterClick\.Handle -eq \$window\.Handle/)
  assert.match(source, /'InvokeButton'/)
  assert.match(source, /'TabButton'/)
  assert.match(source, /'TabUntilChange'/)
  assert.match(source, /'AssertEditValue'/)
  assert.match(source, /FocusedHandle/)
  assert.match(source, /TabButton no alcanzo el Button calibrado/)
  assert.match(source, /SendKeys\]::SendWait\('\s'\)/)
  assert.match(source, /UIAutomationClient/)
  assert.match(source, /AutomationElement\]::FromHandle/)
  assert.match(source, /InvokePattern\]::Pattern/)
  assert.match(source, /AccessibleObjectFromWindow/)
  assert.match(source, /accDoDefaultAction\(0\)/)
  assert.match(source, /ParentHandle = GetParent/)
  assert.match(source, /unico Button en la coordenada calibrada/)
  assert.match(source, /\$Payload\.handle/)
  assert.match(source, /EnumChildWindows/)
  assert.match(source, /focusedHandle = \[Varix\.Wimax\.NativeGui\]::FocusedHandle/)
  assert.match(source, /Sort-Object Left, Top, ControlId/)
  assert.match(source, /Se esperaban \$expectedCount controles Edit/)
  assert.match(source, /SetCursorPos\(\$x, \$y\)/)
  assert.match(source, /SendKeys\]::SendWait\('\^a'\)/)
  assert.match(source, /Test-InlineNumericValue/)
  assert.match(source, /\[regex\]::Replace\(\$Actual\.Trim\(\), '\\s\+', ''\)/)
  assert.match(source, /\$normalizedActual -match '\[,\.\]\$'/)
  assert.match(source, /\$normalizedActual \+= '0'/)
  assert.match(source, /TryParse\(\$normalizedActual/)
  assert.match(source, /Test-ExpectedInlineStockWarning/)
  assert.match(source, /Cantidad mayor que la existencia actual/)
  assert.match(source, /\$index -ne 1/)
  assert.match(source, /La advertencia esperada de existencias no se cerro/)
  assert.match(source, /WiMAX no avanzo al editor calculado de Valor Total/)
  assert.match(source, /\$nextRowWindow\.Handle -ne \$window\.Handle/)
  assert.match(source, /WiMAX no confirmo el renglon ni abrio la siguiente Referencia/)
  assert.match(source, /committed = \$true/)
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
    'validateCreatedCustomer',
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
  const loadingBarrier = profile.flows.openInvoice.find(
    (step) => step.name === 'esperar-carga-archivos-facturacion'
  )
  assert.equal(loadingBarrier.action, 'waitTextAbsent')
  assert.equal(loadingBarrier.textPattern, 'Abriendo archivos')
  assert.equal(loadingBarrier.timeoutMs, 60_000)
  assert.equal(loadingBarrier.stableMs, 3_000)

  for (const flowName of ['openCustomerDirectory', 'prepareInvoice']) {
    const accountStep = profile.flows[flowName].find(
      (step) => step.name === 'cuenta-cliente-campo'
    )
    assert.equal(accountStep.action, 'moveEdit')
    assert.equal(accountStep.keys, '{TAB}')
    assert.equal(accountStep.control.from.relativeLeft, 220)
    assert.equal(accountStep.control.to.relativeLeft, 330)
  }
  const customerSave = profile.flows.createCustomer.find(
    (step) => step.name === 'guardar-cliente'
  )
  assert.equal(customerSave.action, 'invokeButton')
  assert.equal(customerSave.target.titlePattern, '^El Directorio Principal$')
  const customerSaveBranch = profile.flows.createCustomer.find(
    (step) => step.name === 'clasificar-salida-guardar-cliente'
  )
  assert.equal(customerSaveBranch.action, 'waitAny')
  assert.deepEqual(
    customerSaveBranch.branches.map((branch) => branch.name),
    ['pregunta-otra-factura', 'facturacion-directa']
  )
  assert.deepEqual(
    profile.flows.createCustomer.find((step) => step.name === 'otra-factura-si').when,
    { decision: 'salida-guardar-cliente', is: 'pregunta-otra-factura' }
  )
  const departmentSelection = profile.flows.createCustomer.find(
    (step) => step.name === 'departamento-seleccionar-exacto'
  )
  const citySelection = profile.flows.createCustomer.find(
    (step) => step.name === 'ciudad-seleccionar-exacta'
  )
  assert.equal(departmentSelection.action, 'selectComboExact')
  assert.equal(departmentSelection.value, '{{customer.department}}')
  assert.deepEqual(
    [departmentSelection.control.relativeLeft, departmentSelection.control.relativeTop],
    [447, 350]
  )
  assert.equal(citySelection.action, 'selectComboExact')
  assert.equal(citySelection.value, '{{customer.city}}')
  assert.deepEqual(
    [citySelection.control.relativeLeft, citySelection.control.relativeTop],
    [607, 350]
  )
  const addressInput = profile.flows.createCustomer.find(
    (step) => step.name === 'direccion-paciente'
  )
  const addressAssertion = profile.flows.createCustomer.find(
    (step) => step.name === 'confirmar-direccion'
  )
  assert.equal(addressInput.value, '{{customer.address}}')
  assert.equal(addressAssertion.action, 'assertEditValue')
  assert.deepEqual(
    [addressAssertion.control.relativeLeft, addressAssertion.control.relativeTop],
    [12, 350]
  )
  assert.deepEqual(
    profile.flows.createCustomer
      .filter((step) => step.name.startsWith('confirmar-'))
      .map((step) => step.name),
    [
      'confirmar-cedula-directorio',
      'confirmar-primer-nombre-directorio',
      'confirmar-segundo-nombre-directorio',
      'confirmar-primer-apellido-directorio',
      'confirmar-segundo-apellido-directorio',
      'confirmar-direccion',
      'confirmar-codigo-postal',
    ]
  )
  for (const name of [
    'confirmar-cedula-directorio',
    'confirmar-primer-nombre-directorio',
    'confirmar-segundo-nombre-directorio',
    'confirmar-primer-apellido-directorio',
    'confirmar-segundo-apellido-directorio',
  ]) {
    assert.equal(
      profile.flows.createCustomer.find((step) => step.name === name).action,
      'assertEditValue'
    )
  }
  assert.deepEqual(
    profile.flows.validateCreatedCustomer.map((step) => step.name),
    ['confirmar-cliente-creado-cargado']
  )
  assert.equal(profile.flows.validateCreatedCustomer[0].action, 'assertControlAbsent')
  assert.equal(
    profile.flows.prepareInvoice.find((step) => step.name === 'cargar-cliente').keys,
    '{ENTER}'
  )
  assert.equal(
    profile.flows.prepareInvoice.find((step) => step.name === 'aceptar-encabezado').action,
    'tabUntilChange'
  )
  assert.equal(
    profile.flows.prepareInvoice.find((step) => step.name === 'aceptar-encabezado').maxTabs,
    30
  )
  assert.equal(
    profile.flows.prepareInvoice.find((step) => step.name === 'confirmar-cliente-cargado').action,
    'assertControlAbsent'
  )
  assert.equal(
    profile.flows.prepareInvoice.some((step) => step.name === 'confirmar-cuenta-encabezado'),
    false
  )
  assert.equal(
    profile.flows.prepareInvoice.some((step) => step.name === 'confirmar-cedula-encabezado'),
    false
  )

  const lineStep = profile.flows.addItem.find((step) => step.action === 'setInlineFields')
  assert.equal(lineStep.control.expectedCount, 3)
  assert.deepEqual(lineStep.values, ['{{item.quantity}}', '{{item.unitPrice}}', '0'])

  const irreversible = profile.flows.emit[0]
  assert.equal(irreversible.name, 'aceptar-asiento-irreversible')
  assert.equal(irreversible.action, 'invokeButton')
  const accountingBranch = profile.flows.emit.find(
    (step) => step.name === 'clasificar-salida-asiento'
  )
  assert.equal(accountingBranch.action, 'waitAny')
  assert.deepEqual(
    accountingBranch.branches.map((branch) => branch.name),
    ['impresion', 'opciones-colfact']
  )
  const providerBranch = profile.flows.emit.find(
    (step) => step.name === 'clasificar-respuesta-colfact'
  )
  assert.equal(providerBranch.action, 'waitAny')
  assert.equal(providerBranch.timeoutMs, 330_000)
  assert.match(
    providerBranch.branches.find((branch) => branch.name === 'error-6500').target.textPattern,
    /FV_COLFACT/
  )
  const postOptions = profile.flows.emit.find(
    (step) => step.name === 'aceptar-opciones-colfact-posteriores'
  )
  assert.equal(postOptions.action, 'invokeButton')
  assert.deepEqual([postOptions.x, postOptions.y], [323, 184])
  assert.equal(
    profile.flows.emit.find((step) => step.name === 'formato-gere1').keys,
    '{HOME}{DOWN}{ENTER}'
  )

  const assertReachableEmitPath = (selectedBranches) => {
    const decisions = new Map()
    for (const step of profile.flows.emit) {
      if (step.when) {
        assert.ok(
          decisions.has(step.when.decision),
          `${step.name} depende de ${step.when.decision} antes de resolverla`
        )
        const expected = Array.isArray(step.when.is) ? step.when.is : [step.when.is]
        if (!expected.includes(decisions.get(step.when.decision))) continue
      }
      if (step.action !== 'waitAny') continue
      const selected = selectedBranches[step.rememberAs]
      assert.ok(selected, `falta seleccionar ${step.rememberAs}`)
      assert.ok(
        step.branches.some((branch) => branch.name === selected),
        `${selected} no existe en ${step.rememberAs}`
      )
      decisions.set(step.rememberAs, selected)
    }
  }
  assertReachableEmitPath({
    'salida-asiento': 'impresion',
    'respuesta-colfact': 'exito',
  })
  assertReachableEmitPath({
    'salida-asiento': 'opciones-colfact',
    'respuesta-colfact': 'error-6500',
  })
  assertReachableEmitPath({
    'salida-asiento': 'impresion',
    'respuesta-colfact': 'opciones-colfact',
    'respuesta-colfact-despues-opciones': 'exito',
  })
  assertReachableEmitPath({
    'salida-asiento': 'impresion',
    'respuesta-colfact': 'opciones-colfact',
    'respuesta-colfact-despues-opciones': 'error-6500',
  })

  const abortInputs = profile.flows.abort.filter((step) =>
    ['keysIf', 'clickIf', 'pressButtonIf', 'invokeButtonIf'].includes(step.action)
  )
  assert.ok(abortInputs.every((step) => step.target.process === 'WX'))
  assert.ok(abortInputs.every((step) => step.target.foreground !== true))
  const loadingWarning = profile.flows.abort.find(
    (step) => step.name === 'aceptar-aviso-rango-dian-si-existe'
  )
  assert.equal(loadingWarning.action, 'keysIf')
  assert.match(loadingWarning.target.textPattern, /rango de autorizaci/)
  const promptSteps = profile.flows.abort.filter((step) =>
    step.name.startsWith('otra-factura-no-abort')
  )
  assert.ok(promptSteps.every((step) => step.action === 'keysIf'))
  assert.ok(promptSteps.every((step) => step.keys === '{TAB}{ENTER}'))
  assert.ok(profile.flows.abort.some(
    (step) => step.name === 'aceptar-error-consecutivo-si-existe'
  ))
  const warehouseError = profile.flows.abort.find(
    (step) => step.name === 'aceptar-error-bodega-si-existe'
  )
  assert.equal(warehouseError.action, 'keysIf')
  assert.match('Bodega FE no existe', new RegExp(warehouseError.target.textPattern))
  const exitDocumentSteps = profile.flows.abort.filter((step) =>
    step.name.startsWith('salir-documento-aceptar-')
  )
  assert.equal(exitDocumentSteps.length, 3)
  assert.ok(exitDocumentSteps.every((step) => step.action === 'keysIf'))
  assert.ok(exitDocumentSteps.every((step) => step.keys === '{ENTER}'))
})

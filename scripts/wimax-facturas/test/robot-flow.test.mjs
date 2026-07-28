import assert from 'node:assert/strict'
import test from 'node:test'
import {
  contextFor,
  prepareJobUi,
  verifyCreatedCustomerPersisted,
} from '../robot.mjs'

function sampleJob() {
  return {
    monto: 190000,
    paciente: {
      cedula: '99.007.701',
      celular: '300 000 7701',
      nombre: 'MARIA JOSE ',
      apellido: 'PRUEBA ROBOT',
      direccion: '  Carrera 27 # 45-10  ',
      payment_numero: 'TEST-077-ADDRESS',
    },
  }
}

test('contextFor carries the immutable Varix payment identity into WiMAX', () => {
  const context = contextFor(sampleJob(), '99MAR')
  assert.deepEqual(context.customer, {
    code: '99MAR',
    cedula: '99007701',
    celular: '3000007701',
    address: 'Carrera 27 # 45-10',
    primerNombre: 'MARIA',
    segundoNombre: 'JOSE',
    primerApellido: 'PRUEBA',
    segundoApellido: 'ROBOT',
    department: 'Santander',
    city: 'Bucaramanga',
    postalCode: '680011',
    regimen: 'P',
    legalPerson: 'N',
    declarant: 'N',
    status: 'A',
  })
  assert.equal(context.invoice.paymentReference, 'TEST-077-ADDRESS')
  assert.equal(context.invoice.paymentDetail, 'TEST-077-ADDRESS MARIA JOSE PRUEBA ROBOT')
  assert.equal(context.invoice.paymentType, 'DP')
  assert.equal(context.invoice.bankAccount, '1.1.10.05.01.03')
})

test('contextFor deja vacia una direccion que no existe', () => {
  const job = sampleJob()
  job.paciente.direccion = null
  assert.equal(contextFor(job, '99MAR').customer.address, '')
})

test('prepareJobUi creates a missing customer inside an already open invoice', async () => {
  const calls = []
  let persistenceChecks = 0
  const workflow = {
    async run(flow, context, options) {
      calls.push({
        flow,
        item: context.item?.reference ?? null,
        startAt: options?.startAt ?? null,
      })
    },
  }
  await prepareJobUi({
    workflow,
    context: contextFor(sampleJob(), '99MAR'),
    customerExists: false,
    items: [
      { referencia: 'SES', descripcion: 'SESION', cantidad: 2, precio_unitario: 95000 },
    ],
    verifyCreatedCustomer: async () => { persistenceChecks += 1 },
  })
  assert.equal(persistenceChecks, 1)
  assert.deepEqual(calls, [
    { flow: 'openInvoice', item: null, startAt: null },
    { flow: 'openCustomerDirectory', item: null, startAt: null },
    { flow: 'createCustomer', item: null, startAt: null },
    { flow: 'validateCreatedCustomer', item: null, startAt: null },
    { flow: 'prepareInvoice', item: null, startAt: 'metodo-campo' },
    { flow: 'addItem', item: 'SES', startAt: null },
    { flow: 'finishBeforeApproval', item: null, startAt: null },
  ])
})

test('verifyCreatedCustomerPersisted exige una unica cuenta y cedula exactas', async () => {
  const context = contextFor(sampleJob(), '99MAR')
  const stored = {
    code: '99MAR',
    cedula: '99007701',
    nombre: 'MARIA JOSE PRUEBA ROBOT',
    primerApellido: 'PRUEBA',
    segundoApellido: 'ROBOT',
    primerNombre: 'MARIA',
    segundoNombre: 'JOSE',
    direccion: 'Carrera 27 # 45-10',
    departamento: 'Santander',
    codigoPostal: '680011',
  }
  const readDirectoryImpl = async () => ({
    byCode: new Map([['99MAR', stored]]),
    byCedula: new Map([['99007701', [stored]]]),
  })
  assert.equal(
    await verifyCreatedCustomerPersisted({
      context,
      wimaxDir: 'unused',
      readDirectoryImpl,
      sleepImpl: async () => {},
    }),
    stored
  )

  await assert.rejects(
    verifyCreatedCustomerPersisted({
      context,
      wimaxDir: 'unused',
      readDirectoryImpl: async () => ({ byCode: new Map(), byCedula: new Map() }),
      sleepImpl: async () => {},
      attempts: 2,
    }),
    /CUSTOMER_PERSISTENCE/
  )
})

test('prepareJobUi skips Directory for an existing customer', async () => {
  const calls = []
  const workflow = { async run(flow) { calls.push(flow) } }
  await prepareJobUi({
    workflow,
    context: contextFor(sampleJob(), '99MAR'),
    customerExists: true,
    items: [],
  })
  assert.deepEqual(calls, ['openInvoice', 'prepareInvoice', 'finishBeforeApproval'])
})

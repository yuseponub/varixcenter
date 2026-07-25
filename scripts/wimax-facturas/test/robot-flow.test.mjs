import assert from 'node:assert/strict'
import test from 'node:test'
import { contextFor, prepareJobUi } from '../robot.mjs'

function sampleJob() {
  return {
    monto: 190000,
    paciente: {
      cedula: '63.451.563',
      celular: '320 915 1572',
      nombre: 'FLOR NIDIA ',
      apellido: 'JAIMES CARILLO',
      payment_numero: 'FAC-001126',
    },
  }
}

test('contextFor carries the immutable Varix payment identity into WiMAX', () => {
  const context = contextFor(sampleJob(), '63FLO')
  assert.deepEqual(context.customer, {
    code: '63FLO',
    cedula: '63451563',
    celular: '3209151572',
    primerNombre: 'FLOR',
    segundoNombre: 'NIDIA',
    primerApellido: 'JAIMES',
    segundoApellido: 'CARILLO',
    department: 'Santander',
    city: 'Bucaramanga',
    postalCode: '680011',
    regimen: 'P',
    legalPerson: 'N',
    declarant: 'N',
    status: 'A',
  })
  assert.equal(context.invoice.paymentReference, 'FAC-001126')
  assert.equal(context.invoice.paymentDetail, 'FAC-001126 FLOR NIDIA JAIMES CARILLO')
  assert.equal(context.invoice.paymentType, 'DP')
  assert.equal(context.invoice.bankAccount, '1.1.10.05.01.03')
})

test('prepareJobUi creates a missing customer inside an already open invoice', async () => {
  const calls = []
  const workflow = {
    async run(flow, context) {
      calls.push({ flow, item: context.item?.reference ?? null })
    },
  }
  await prepareJobUi({
    workflow,
    context: contextFor(sampleJob(), '63FLO'),
    customerExists: false,
    items: [
      { referencia: 'SES', descripcion: 'SESION', cantidad: 2, precio_unitario: 95000 },
    ],
  })
  assert.deepEqual(calls, [
    { flow: 'openInvoice', item: null },
    { flow: 'openCustomerDirectory', item: null },
    { flow: 'createCustomer', item: null },
    { flow: 'prepareInvoice', item: null },
    { flow: 'addItem', item: 'SES' },
    { flow: 'finishBeforeApproval', item: null },
  ])
})

test('prepareJobUi skips Directory for an existing customer', async () => {
  const calls = []
  const workflow = { async run(flow) { calls.push(flow) } }
  await prepareJobUi({
    workflow,
    context: contextFor(sampleJob(), '63FLO'),
    customerExists: true,
    items: [],
  })
  assert.deepEqual(calls, ['openInvoice', 'prepareInvoice', 'finishBeforeApproval'])
})

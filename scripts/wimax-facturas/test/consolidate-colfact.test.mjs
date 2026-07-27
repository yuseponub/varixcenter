import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyPayments } from '../consolidate-colfact.mjs'

function payment(id, total = 200_000) {
  return {
    id,
    total,
    created_at: '2026-07-20T15:00:00.000Z',
    patients: { cedula: '99007301' },
    payment_invoicing: { monto_a_facturar: null },
  }
}

function method(paymentId, metodo, monto) {
  return { payment_id: paymentId, metodo, monto }
}

function invoice(numero = 'FE99007301', total = 100_000) {
  return {
    numero,
    emision: '2026-07-20',
    cedula: '99007301',
    total,
  }
}

test('reconoce una unica factura por la porcion electronica de un pago mixto', () => {
  const rows = classifyPayments({
    payments: [payment('payment-a')],
    methods: [method('payment-a', 'tarjeta', 100_000)],
    invoices: [invoice()],
    usedNumbers: new Set(),
  })

  assert.equal(rows.length, 1)
  assert.equal(rows[0].electronicTotal, 100_000)
  assert.equal(rows[0].classification, 'unica')
  assert.equal(rows[0].exact[0].numero, 'FE99007301')
})

test('marca como ambigua una factura reclamada por dos pagos compatibles', () => {
  const rows = classifyPayments({
    payments: [payment('payment-a', 100_000), payment('payment-b', 100_000)],
    methods: [
      method('payment-a', 'tarjeta', 100_000),
      method('payment-b', 'transferencia', 100_000),
    ],
    invoices: [invoice()],
    usedNumbers: new Set(),
  })

  assert.deepEqual(rows.map((row) => row.classification), ['ambigua', 'ambigua'])
})

test('no reutiliza una factura que ya esta vinculada a otro pago', () => {
  const rows = classifyPayments({
    payments: [payment('payment-a', 100_000)],
    methods: [method('payment-a', 'tarjeta', 100_000)],
    invoices: [invoice()],
    usedNumbers: new Set(['FE99007301']),
  })

  assert.equal(rows[0].classification, 'sin_factura')
  assert.deepEqual(rows[0].exact, [])
  assert.deepEqual(rows[0].sameCedula, [])
})

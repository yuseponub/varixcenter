import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildPaymentValueCorrection,
  computeDraftSubtotal,
  draftFromPayment,
  parseMoneyInput,
  suggestedTotal,
} from '../src/lib/payments/payment-value-correction.ts'

// Pago de ejemplo: una consulta registrada con un cero de menos
// (debia ser 150.000 y quedo 15.000), pagada en efectivo.
const PAGO = {
  subtotal: 15000,
  descuento: 0,
  total: 15000,
  items: [{ id: 'item-consulta', service_name: 'Consulta', quantity: 1, unit_price: 15000 }],
  methods: [{ id: 'met-1', metodo: 'efectivo', monto: 15000, comprobante_path: null }],
}

// Pago con dos servicios y dos metodos, para el reparto de montos.
const PAGO_MIXTO = {
  subtotal: 250000,
  descuento: 0,
  total: 250000,
  items: [
    { id: 'item-a', service_name: 'Consulta', quantity: 1, unit_price: 150000 },
    { id: 'item-b', service_name: 'Escleroterapia', quantity: 2, unit_price: 50000 },
  ],
  methods: [
    { id: 'met-ef', metodo: 'efectivo', monto: 100000, comprobante_path: null },
    { id: 'met-tj', metodo: 'tarjeta', monto: 150000, comprobante_path: 'x.jpg' },
  ],
}

test('parseMoneyInput entiende pesos con y sin separadores', () => {
  assert.equal(parseMoneyInput('150000'), 150000)
  assert.equal(parseMoneyInput('150.000'), 150000)
  assert.equal(parseMoneyInput('1.250.000,75'), 1250000.75)
  assert.equal(parseMoneyInput(''), null)
  assert.equal(parseMoneyInput('abc'), null)
  assert.equal(parseMoneyInput('-5'), null)
})

test('el borrador inicial reproduce los valores registrados', () => {
  assert.deepEqual(draftFromPayment(PAGO), {
    itemPrices: { 'item-consulta': '15000' },
    itemQuantities: { 'item-consulta': '1' },
    total: '15000',
    methodAmounts: { 'met-1': '15000' },
  })
})

test('el subtotal del borrador se recalcula y el total sugerido descuenta', () => {
  const draft = draftFromPayment(PAGO_MIXTO)
  draft.itemPrices['item-b'] = '60000'
  assert.equal(computeDraftSubtotal(PAGO_MIXTO, draft), 150000 + 2 * 60000)
  draft.itemQuantities['item-b'] = 'x'
  assert.equal(computeDraftSubtotal(PAGO_MIXTO, draft), null)
  assert.equal(suggestedTotal(270000, 20000), 250000)
  assert.equal(suggestedTotal(10000, 20000), 0)
})

test('sin cambios no hay nada que corregir', () => {
  const result = buildPaymentValueCorrection(PAGO, draftFromPayment(PAGO))
  assert.equal(result.ok, false)
  assert.match(result.ok ? '' : result.error, /No hay ningun valor distinto/)
})

test('corregir el precio con un solo metodo ajusta el metodo al total nuevo', () => {
  const draft = draftFromPayment(PAGO)
  draft.itemPrices['item-consulta'] = '150.000'
  draft.total = '150000'
  const result = buildPaymentValueCorrection(PAGO, draft)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.subtotal, 150000)
  assert.deepEqual(result.payload, {
    items: [{ item_id: 'item-consulta', unit_price: 150000, quantity: 1 }],
    total: 150000,
    methods: [{ metodo: 'efectivo', monto: 150000, comprobante_path: null }],
  })
})

test('con varios metodos la suma debe cuadrar con el total', () => {
  const draft = draftFromPayment(PAGO_MIXTO)
  draft.itemPrices['item-b'] = '60000'
  draft.total = '270000'
  // Reparto viejo: 100.000 + 150.000 = 250.000, ya no cuadra
  const noCuadra = buildPaymentValueCorrection(PAGO_MIXTO, draft)
  assert.equal(noCuadra.ok, false)
  assert.match(noCuadra.ok ? '' : noCuadra.error, /suma de los metodos/)

  draft.methodAmounts['met-ef'] = '120000'
  const cuadra = buildPaymentValueCorrection(PAGO_MIXTO, draft)
  assert.equal(cuadra.ok, true)
  if (!cuadra.ok) return
  assert.deepEqual(cuadra.payload.methods, [
    { metodo: 'efectivo', monto: 120000, comprobante_path: null },
    { metodo: 'tarjeta', monto: 150000, comprobante_path: 'x.jpg' },
  ])
  assert.deepEqual(cuadra.payload.items, [
    { item_id: 'item-a', unit_price: 150000, quantity: 1 },
    { item_id: 'item-b', unit_price: 60000, quantity: 2 },
  ])
})

test('mover monto entre metodos sin tocar precios tambien es una correccion', () => {
  const draft = draftFromPayment(PAGO_MIXTO)
  draft.methodAmounts['met-ef'] = '50000'
  draft.methodAmounts['met-tj'] = '200000'
  const result = buildPaymentValueCorrection(PAGO_MIXTO, draft)
  assert.equal(result.ok, true)
})

test('valores invalidos se rechazan con un mensaje claro', () => {
  const precioMalo = draftFromPayment(PAGO)
  precioMalo.itemPrices['item-consulta'] = 'diez'
  const r1 = buildPaymentValueCorrection(PAGO, precioMalo)
  assert.equal(r1.ok, false)
  assert.match(r1.ok ? '' : r1.error, /Consulta/)

  const cantidadCero = draftFromPayment(PAGO)
  cantidadCero.itemQuantities['item-consulta'] = '0'
  const r2 = buildPaymentValueCorrection(PAGO, cantidadCero)
  assert.equal(r2.ok, false)
  assert.match(r2.ok ? '' : r2.error, /al menos 1/)

  const totalCero = draftFromPayment(PAGO)
  totalCero.total = '0'
  const r3 = buildPaymentValueCorrection(PAGO, totalCero)
  assert.equal(r3.ok, false)
  assert.match(r3.ok ? '' : r3.error, /mayor a 0/)
})

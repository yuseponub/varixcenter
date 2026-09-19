import assert from 'node:assert/strict'
import test from 'node:test'

import { classifyReconciliation } from '../src/lib/reconciliation/classify.ts'

const cita = (over) => ({
  id: 'c1', patient_id: 'p1', patient_nombre: 'A', patient_apellido: 'B', patient_cedula: null,
  hora: '08:00', estado: 'completada', doctor_nombre: 'Dr', motivo_consulta: null, servicios: '',
  ...over,
})
const pago = (over) => ({
  id: 'f1', patient_id: 'p1', appointment_id: null, patient_nombre: 'A', patient_apellido: 'B',
  numero_factura: 'FAC-1', total: 100, estado: 'activo', hora: '08:30', servicios: 'Consulta x1',
  ...over,
})
const base = (over) => ({
  fecha: '2026-09-19', appointments: [], payments: [], attendances: [],
  medias_ventas_count: 0, medias_ventas_total: 0, ...over,
})

test('asistió con pago del mismo paciente queda ok (enlace por paciente)', () => {
  const r = classifyReconciliation(base({ appointments: [cita()], payments: [pago()] }))
  assert.equal(r.rows[0].category, 'ok')
  assert.equal(r.rows[0].payment_linked, false)
  assert.equal(r.totals.discrepancias, 0)
})

test('asistió sin pago es discrepancia', () => {
  const r = classifyReconciliation(base({ appointments: [cita()] }))
  assert.equal(r.rows[0].category, 'asistio_sin_pago')
  assert.equal(r.totals.discrepancias, 1)
})

test('marca del médico cuenta como asistencia aunque la agenda siga programada', () => {
  const r = classifyReconciliation(base({
    appointments: [cita({ estado: 'programada' })],
    attendances: [{ patient_id: 'p1', hora: '08:10', marked_by_nombre: 'Dr' }],
  }))
  assert.equal(r.rows[0].category, 'asistio_sin_pago')
})

test('programada con pago: la agenda no registró la asistencia', () => {
  const r = classifyReconciliation(base({ appointments: [cita({ estado: 'confirmada' })], payments: [pago()] }))
  assert.equal(r.rows[0].category, 'pago_sin_marcar_agenda')
})

test('cancelada con pago es discrepancia; cancelada sin pago no', () => {
  const con = classifyReconciliation(base({ appointments: [cita({ estado: 'cancelada' })], payments: [pago()] }))
  assert.equal(con.rows[0].category, 'no_asistio_con_pago')
  const sin = classifyReconciliation(base({ appointments: [cita({ estado: 'no_asistio' })] }))
  assert.equal(sin.rows[0].category, 'ok_no_asistio')
  assert.equal(sin.totals.discrepancias, 0)
})

test('pago de paciente sin cita y pagos dobles se listan aparte', () => {
  const r = classifyReconciliation(base({
    appointments: [cita()],
    payments: [pago(), pago({ id: 'f2', numero_factura: 'FAC-2' }), pago({ id: 'f3', patient_id: 'p9', numero_factura: 'FAC-3' })],
  }))
  assert.equal(r.pagos_sin_cita.map((p) => p.id).join(), 'f3')
  assert.equal(r.pagos_dobles.length, 1)
  assert.equal(r.pagos_dobles[0].payments.length, 2)
  assert.equal(r.totals.discrepancias, 2)
})

test('dos citas del mismo paciente consumen pagos distintos y el enlace por cita tiene prioridad', () => {
  const r = classifyReconciliation(base({
    appointments: [cita({ id: 'c1', hora: '08:00' }), cita({ id: 'c2', hora: '10:00' })],
    payments: [pago({ id: 'f1', appointment_id: 'c2' }), pago({ id: 'f2', numero_factura: 'FAC-2' })],
  }))
  const c1 = r.rows.find((x) => x.appointment.id === 'c1')
  const c2 = r.rows.find((x) => x.appointment.id === 'c2')
  assert.equal(c2.payment.id, 'f1')
  assert.equal(c2.payment_linked, true)
  assert.equal(c1.payment.id, 'f2')
  assert.equal(r.totals.pagos_enlazados_a_cita, 1)
})

test('pagos anulados no cuentan como pago ni como doble', () => {
  const r = classifyReconciliation(base({
    appointments: [cita()],
    payments: [pago({ estado: 'anulado' }), pago({ id: 'f2', numero_factura: 'FAC-2' })],
  }))
  assert.equal(r.rows[0].category, 'ok')
  assert.equal(r.pagos_dobles.length, 0)
  assert.equal(r.pagos_anulados.length, 1)
})

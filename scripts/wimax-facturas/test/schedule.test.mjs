import test from 'node:test'
import assert from 'node:assert/strict'
import {
  dailyWindow,
  parseClock,
  shutdownBlockers,
  shutdownDecision,
} from '../lib/schedule.mjs'

test('calcula la ventana de cierre en hora de Bogota incluso despues de medianoche', () => {
  assert.deepEqual(
    dailyWindow({ now: new Date('2026-07-25T02:30:00Z'), start: '21:00', windowMinutes: 360 }),
    { active: true, elapsedMinutes: 30, businessDate: '2026-07-24' }
  )
  assert.deepEqual(
    dailyWindow({ now: new Date('2026-07-25T07:30:00Z'), start: '21:00', windowMinutes: 360 }),
    { active: true, elapsedMinutes: 330, businessDate: '2026-07-24' }
  )
  assert.equal(
    dailyWindow({ now: new Date('2026-07-25T08:00:00Z'), start: '21:00', windowMinutes: 360 }).active,
    false
  )
})

test('rechaza horarios de cierre ambiguos', () => {
  assert.equal(parseClock('09:05'), 545)
  assert.throws(() => parseClock('9:05'), /HH:MM/)
  assert.throws(() => parseClock('25:00'), /HH:MM/)
})

test('solo completada y cancelada son estados seguros para apagar', () => {
  const blockers = shutdownBlockers([
    { id: 'a', estado: 'completada' },
    { id: 'b', estado: 'cancelada' },
    { id: 'c', estado: 'emitida_sin_cufe' },
    { id: 'd', estado: 'error' },
  ])
  assert.deepEqual(blockers.map((job) => job.id), ['c', 'd'])
})

test('el apagado exige lote quieto, conciliacion terminada y cero bloqueos', () => {
  assert.equal(shutdownDecision({
    jobs: [], quietElapsedSeconds: 119, quietRequiredSeconds: 120,
    reconciliationScheduled: false,
  }).reason, 'esperando_lote')
  assert.equal(shutdownDecision({
    jobs: [], quietElapsedSeconds: 120, quietRequiredSeconds: 120,
    reconciliationScheduled: true,
  }).reason, 'conciliacion_pendiente')
  assert.equal(shutdownDecision({
    jobs: [{ estado: 'requiere_revision' }], quietElapsedSeconds: 120,
    quietRequiredSeconds: 120, reconciliationScheduled: false,
  }).reason, 'trabajos_pendientes')
  assert.equal(shutdownDecision({
    jobs: [{ estado: 'completada' }], quietElapsedSeconds: 120,
    quietRequiredSeconds: 120, reconciliationScheduled: false,
  }).allowed, true)
})

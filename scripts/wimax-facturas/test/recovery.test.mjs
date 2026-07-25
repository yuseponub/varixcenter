import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertObservedInvoice,
  parseObservedLinks,
} from '../recover-observed-emissions.mjs'

const JOB_ID = 'c5224560-85d2-4415-9f50-893e0ce8da92'

test('parseObservedLinks requires explicit unique JOB=FE pairs', () => {
  assert.deepEqual(parseObservedLinks([`${JOB_ID}=fe7867`]), [
    { jobId: JOB_ID, numero: 'FE7867' },
  ])
  assert.throws(() => parseObservedLinks([]), /RECOVERY_INPUT/)
  assert.throws(() => parseObservedLinks([`${JOB_ID}=FC7867`]), /RECOVERY_INPUT/)
  assert.throws(
    () => parseObservedLinks([`${JOB_ID}=FE7867`, `${JOB_ID}=FE7868`]),
    /trabajo repetido/,
  )
})

test('assertObservedInvoice accepts only one exact DBF identity', () => {
  const job = { monto: 100000, paciente: { cedula: '1.098.741.379' } }
  const invoice = {
    numero: 'FE7867',
    emision: '2026-07-24',
    cedula: '1098741379',
    nombre: 'Paula Andrea Quintana Laiton',
    total: 100000,
  }
  assert.equal(
    assertObservedInvoice({ job, numero: 'FE7867', invoices: [invoice] }),
    invoice,
  )
  assert.throws(
    () => assertObservedInvoice({ job, numero: 'FE7867', invoices: [] }),
    /no aparece exactamente una vez/,
  )
  assert.throws(
    () => assertObservedInvoice({
      job,
      numero: 'FE7867',
      invoices: [{ ...invoice, total: 99999 }],
    }),
    /total/,
  )
  assert.throws(
    () => assertObservedInvoice({
      job,
      numero: 'FE7867',
      invoices: [{ ...invoice, cedula: '63451563' }],
    }),
    /cedula/,
  )
})

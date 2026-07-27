import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DBFFile } from 'dbffile'
import { preflightDedup } from '../lib/dedup.mjs'
import {
  readCufeBuffer,
  readDirectory,
  readInvoices,
  WIMAX_DBF_ENCODING,
} from '../lib/dbf-reader.mjs'
import { dateOnly } from '../lib/normalize.mjs'

function localCalendarNoon(reference = new Date()) {
  return new Date(
    reference.getFullYear(),
    reference.getMonth(),
    reference.getDate(),
    12,
  )
}

async function fixture({ invoice = null, customers = null } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'varix-robot-dedup-'))
  // DBF dates do not carry a timezone. Keep both the local and UTC calendar
  // components on the same day so this fixture remains deterministic when
  // the test host is between local midnight and UTC midnight.
  const now = localCalendarNoon()
  const center = path.join(root, `CENTER${String(now.getFullYear()).slice(-2)}`)
  const { mkdir } = await import('node:fs/promises')
  await mkdir(center, { recursive: true })

  const directory = await DBFFile.create(
    path.join(center, 'tmdir.dbf'),
    [
      { name: 'CLAVE', type: 'C', size: 5 },
      { name: 'DIREC4', type: 'C', size: 20 },
      { name: 'NOMBRE', type: 'C', size: 60 },
    ],
    { encoding: 'cp850' },
  )
  await directory.appendRecords(
    customers ?? [{ CLAVE: '99ROB', DIREC4: '99.006.801', NOMBRE: 'Robot Prueba' }]
  )

  const month = String(now.getMonth() + 1).padStart(2, '0')
  const invoices = await DBFFile.create(path.join(center, `trafac${month}.dbf`), [
    { name: 'TIPO', type: 'C', size: 2 },
    { name: 'NUMERO', type: 'C', size: 20 },
    { name: 'EMISION', type: 'D', size: 8 },
    { name: 'CLIENTE', type: 'C', size: 5 },
    { name: 'TOTAL_FAC', type: 'N', size: 12, decimalPlaces: 2 },
  ])
  if (invoice) {
    await invoices.appendRecords([
      {
        TIPO: 'FE',
        NUMERO: invoice.numero,
        EMISION: invoice.emision ?? now,
        CLIENTE: invoice.cliente ?? '99ROB',
        TOTAL_FAC: invoice.total,
      },
    ])
  }

  return {
    root,
    center,
    job: {
      id: 'job-test',
      monto: 100000,
      paciente: {
        cedula: '99006801',
        nombre: 'Robot',
        apellido: 'Prueba',
        payment_created_at: `${dateOnly(now)}T15:00:00Z`,
      },
    },
  }
}

test('preflight limpio encuentra el cliente pero ninguna FE', async () => {
  const data = await fixture()
  try {
    const result = await preflightDedup({
      job: data.job,
      cloudInvoices: [],
      wimaxDir: data.center,
    })
    assert.equal(result.status, 'limpio')
    assert.equal(result.customerCode, '99ROB')
    assert.equal(result.evidence.customer_exists, true)
    assert.deepEqual(result.evidence.recent_invoices, [])
  } finally {
    await rm(data.root, { recursive: true })
  }
})

test('lee la eñe del directorio WiMAX usando su codificacion CP850', async () => {
  assert.equal(WIMAX_DBF_ENCODING, 'cp850')
  const data = await fixture({
    customers: [{ CLAVE: '99QUI', DIREC4: '99.006.801', NOMBRE: 'Quiñonez Peña' }],
  })
  try {
    const directory = await readDirectory(data.center)
    assert.equal(directory.byCode.get('99QUI').nombre, 'Quiñonez Peña')
  } finally {
    await rm(data.root, { recursive: true })
  }
})

test('cualquier FE reciente de la cedula bloquea incluso con otro monto', async () => {
  const data = await fixture({ invoice: { numero: 'FE9991', total: 350000 } })
  try {
    const result = await preflightDedup({
      job: data.job,
      cloudInvoices: [],
      wimaxDir: data.center,
    })
    assert.equal(result.status, 'duplicado')
    assert.equal(result.evidence.recent_invoices[0].numero, 'FE9991')
    assert.equal(result.evidence.exact_amount_candidates, 0)
  } finally {
    await rm(data.root, { recursive: true })
  }
})

test('ignora una FE anterior al rango aunque este en el mismo trafac mensual', async () => {
  const now = new Date()
  const oldDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 2))
  const data = await fixture({
    invoice: { numero: 'FE9990', total: 100000, emision: oldDate },
  })
  try {
    const year = now.getUTCFullYear()
    const month = String(now.getUTCMonth() + 1).padStart(2, '0')
    const directory = await readDirectory(data.center)
    const result = await readInvoices(
      data.center,
      `${year}-${month}-20`,
      `${year}-${month}-25`,
      directory,
    )
    assert.deepEqual(result.invoices, [])
  } finally {
    await rm(data.root, { recursive: true })
  }
})

test('una colision usa un codigo alterno determinista y libre', async () => {
  const data = await fixture({
    customers: [{ CLAVE: '99ROB', DIREC4: '99999999', NOMBRE: 'Otra Persona' }],
  })
  try {
    const result = await preflightDedup({
      job: data.job,
      cloudInvoices: [],
      wimaxDir: data.center,
    })
    assert.equal(result.status, 'limpio')
    assert.equal(result.customerCode, '99ROP')
    assert.equal(result.evidence.customer_code_fallback, true)
  } finally {
    await rm(data.root, { recursive: true })
  }
})

test('bloquea si todos los codigos deterministas estan ocupados', async () => {
  const data = await fixture({
    customers: [
      { CLAVE: '99ROB', DIREC4: '99999991', NOMBRE: 'Otra Uno' },
      { CLAVE: '99ROP', DIREC4: '99999992', NOMBRE: 'Otra Dos' },
      { CLAVE: '99RPR', DIREC4: '99999993', NOMBRE: 'Otra Tres' },
      { CLAVE: '01ROB', DIREC4: '99999994', NOMBRE: 'Otra Cuatro' },
    ],
  })
  try {
    const result = await preflightDedup({
      job: data.job,
      cloudInvoices: [],
      wimaxDir: data.center,
    })
    assert.equal(result.status, 'ambiguo')
    assert.equal(result.evidence.reason, 'colision_todos_codigos_cliente')
  } finally {
    await rm(data.root, { recursive: true })
  }
})

test('wimax_facturas tambien bloquea aunque trafac aun no lo refleje', async () => {
  const data = await fixture()
  try {
    const result = await preflightDedup({
      job: data.job,
      cloudInvoices: [
        {
          numero: 'FE9992',
          emision: dateOnly(new Date()),
          cedula: '99006801',
          total: 100000,
        },
      ],
      wimaxDir: data.center,
    })
    assert.equal(result.status, 'duplicado')
    assert.equal(result.evidence.exact_amount_candidates, 1)
  } finally {
    await rm(data.root, { recursive: true })
  }
})

test('ignora una FE ya consumida por otro pago enlazado', async () => {
  const data = await fixture({ invoice: { numero: 'FE9994', total: 100000 } })
  try {
    const result = await preflightDedup({
      job: data.job,
      cloudInvoices: [
        {
          numero: 'FE9994',
          emision: dateOnly(new Date()),
          cedula: '99006801',
          total: 100000,
        },
      ],
      consumedInvoiceNumbers: ['FE9994'],
      wimaxDir: data.center,
    })
    assert.equal(result.status, 'limpio')
    assert.deepEqual(result.evidence.recent_invoices, [])
    assert.deepEqual(result.evidence.consumed_prior_invoices, ['FE9994'])
  } finally {
    await rm(data.root, { recursive: true })
  }
})

test('lee y normaliza FE + CUFE desde el buffer temporal', async () => {
  const data = await fixture()
  try {
    const buffer = await DBFFile.create(path.join(data.center, 'tmfecufe.dbf'), [
      { name: 'TIPO', type: 'C', size: 2 },
      { name: 'NUMERO', type: 'C', size: 20 },
      { name: 'CUFE', type: 'C', size: 128 },
    ])
    await buffer.appendRecords([
      { TIPO: 'FE', NUMERO: '9993', CUFE: 'A'.repeat(96) },
    ])

    assert.deepEqual(await readCufeBuffer(data.center), [
      { numero: 'FE9993', cufe: 'a'.repeat(96) },
    ])
  } finally {
    await rm(data.root, { recursive: true })
  }
})

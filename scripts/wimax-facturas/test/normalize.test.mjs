import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildCustomerCode,
  normalizeInvoiceNumber,
  normalizeName,
  splitPatientName,
} from '../lib/normalize.mjs'
import { escapeSendKeysText } from '../lib/gui.mjs'
import { cleanWimaxDesktop } from '../robot.mjs'

test('genera cuenta WiMAX con cedula y primer nombre normalizados', () => {
  assert.equal(buildCustomerCode('99.006.801', 'Robot Prueba'), '99ROB')
  assert.equal(buildCustomerCode('88.006.802', 'Ensayo'), '88ENS')
  assert.equal(buildCustomerCode('12', 'Al'), null)
})

test('normaliza nombres e identificadores FE', () => {
  assert.equal(normalizeName('  Pérez, María-José '), 'PEREZ MARIA JOSE')
  assert.equal(normalizeInvoiceNumber('FE', '7862'), 'FE7862')
  assert.equal(normalizeInvoiceNumber('FE', ' FE7862 '), 'FE7862')
})

test('separa los cuatro campos de nombre de tmdir', () => {
  assert.deepEqual(
    splitPatientName({ nombre: 'María Fernanda', apellido: 'Pérez Alfonso' }),
    {
      primerNombre: 'María',
      segundoNombre: 'Fernanda',
      primerApellido: 'Pérez',
      segundoApellido: 'Alfonso',
    }
  )
})

test('escapa metacaracteres de SendKeys sin ejecutar atajos', () => {
  assert.equal(escapeSendKeysText('A+B^(1)'), 'A{+}B{^}{(}1{)}')
})

test('solo considera limpia una unica ventana principal de WiMAX', () => {
  const profile = {
    window: {
      process: 'WX',
      titlePattern: 'Wimax Software',
      classPattern: 'XbpDialog',
    },
  }
  const main = {
    ProcessName: 'WX',
    Title: 'Wimax Software - Clasica',
    ClassName: 'XbpDialog',
  }

  assert.equal(cleanWimaxDesktop({ windows: [main] }, profile), true)
  assert.equal(
    cleanWimaxDesktop(
      {
        windows: [
          main,
          { ProcessName: 'WX', Title: 'FORMA DE PAGO', ClassName: 'XbpDialog' },
        ],
      },
      profile
    ),
    false
  )
})

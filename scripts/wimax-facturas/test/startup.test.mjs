import test from 'node:test'
import assert from 'node:assert/strict'
import { validateStartupProfile } from '../lib/startup.mjs'

const invoiceProfile = {
  sessionId: 1,
  display: { width: 1920, height: 1080 },
  window: { process: 'WX' },
}

function validProfile() {
  return {
    version: 1,
    calibrated: true,
    sessionId: 1,
    display: { width: 1920, height: 1080 },
    executable: {
      path: 'C:\\wimax\\WIMAX.EXE',
      workingDirectory: 'C:\\wimax',
      length: 2202284,
      sha256: 'a'.repeat(64),
    },
    window: {
      process: 'WX',
      titlePattern: 'Wimax Software',
      classPattern: '^XbpDialog$',
      width: 1920,
      height: 1055,
    },
    company: { exactName: 'VARIX CENTER S.A.S 2026' },
    prefix: {
      exactName: 'FE FACTURACION ELECTRONICA',
      keyboardCode: 'fe',
      promptTextPattern: '^Seleccione Prefijo a utilizar( \\d+)?$',
    },
    companyLink: { x: 950, y: 58 },
    dialogs: {
      companySelectorTitle: 'Seleccionar Empresa',
      loginTitlePattern: '^Acceso empresa$',
      prefixSelectorTitlePattern: '^\\s*Facturaci.n\\s*$',
      dailyReportTitlePattern: '^\\s*Estado actual\\s*$',
      auditTitlePattern: '^\\s*Auditoria General\\s*$',
      reorganizationTitle: 'Grupo Wimax',
      acceptButton: 'Aceptar',
      declineButton: 'No',
      recommendedButton: 'Si (Recomendado)',
    },
    readyIndicator: {
      region: { x: 600, y: 35, width: 710, height: 45 },
      blue: { minimum: 150, maximumRed: 169, overRed: 1.5, overGreen: 1.35 },
      expected: {
        count: { min: 650, max: 1150 },
        minX: { min: 220, max: 240 },
        maxX: { min: 465, max: 485 },
        minY: { min: 12, max: 20 },
        maxY: { min: 25, max: 34 },
      },
    },
    maxReorganizationPrompts: 2,
  }
}

test('acepta un perfil de arranque calibrado y separado de credenciales', () => {
  const profile = validProfile()
  assert.equal(validateStartupProfile(profile, invoiceProfile), profile)
  assert.equal(JSON.stringify(profile).includes('password'), false)
})

test('rechaza un ejecutable cambiado o fuera del directorio calibrado', () => {
  const badHash = validProfile()
  badHash.executable.sha256 = 'no-es-un-hash'
  assert.throws(
    () => validateStartupProfile(badHash, invoiceProfile),
    /ejecutable WiMAX de arranque invalido/
  )

  const badPath = validProfile()
  badPath.executable.path = 'C:\\otro\\WIMAX.EXE'
  assert.throws(
    () => validateStartupProfile(badPath, invoiceProfile),
    /debe estar dentro del directorio/
  )
})

test('rechaza perfiles de arranque en otra sesion o resolucion', () => {
  const otherSession = validProfile()
  otherSession.sessionId = 2
  assert.throws(
    () => validateStartupProfile(otherSession, invoiceProfile),
    /no usan la misma sesion/
  )

  const otherDisplay = validProfile()
  otherDisplay.display.width = 1366
  assert.throws(
    () => validateStartupProfile(otherDisplay, invoiceProfile),
    /no usan la misma resolucion/
  )
})

test('rechaza clicks y firmas visuales fuera de la ventana', () => {
  const badClick = validProfile()
  badClick.companyLink.x = 1920
  assert.throws(
    () => validateStartupProfile(badClick, invoiceProfile),
    /punto de seleccion/
  )

  const badRegion = validProfile()
  badRegion.readyIndicator.region.width = 1400
  assert.throws(
    () => validateStartupProfile(badRegion, invoiceProfile),
    /detector visual/
  )
})

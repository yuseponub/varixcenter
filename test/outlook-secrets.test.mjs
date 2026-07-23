import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import test from 'node:test'

import {
  decryptOutlookRefreshToken,
  encryptOutlookRefreshToken,
  parseOutlookEncryptionKey,
} from '../src/lib/outlook/secrets.ts'

test('cifra y descifra un refresh token sin guardarlo en texto plano', () => {
  const key = randomBytes(32).toString('base64')
  const token = 'refresh-token-confidencial-de-prueba'
  const encrypted = encryptOutlookRefreshToken(token, key)

  assert.match(encrypted, /^v1\./)
  assert.equal(encrypted.includes(token), false)
  assert.equal(decryptOutlookRefreshToken(encrypted, key), token)
})

test('usa un nonce aleatorio para no repetir el mismo cifrado', () => {
  const key = randomBytes(32).toString('base64')
  const first = encryptOutlookRefreshToken('mismo-token', key)
  const second = encryptOutlookRefreshToken('mismo-token', key)

  assert.notEqual(first, second)
})

test('rechaza una clave incorrecta o un token alterado', () => {
  const key = randomBytes(32).toString('base64')
  const otherKey = randomBytes(32).toString('base64')
  const encrypted = encryptOutlookRefreshToken('token', key)
  const tamperedParts = encrypted.split('.')
  tamperedParts[2] = `${tamperedParts[2][0] === 'A' ? 'B' : 'A'}${tamperedParts[2].slice(1)}`

  assert.throws(() => decryptOutlookRefreshToken(encrypted, otherKey))
  assert.throws(() => decryptOutlookRefreshToken(tamperedParts.join('.'), key))
  assert.throws(() => parseOutlookEncryptionKey('demasiado-corta'))
})

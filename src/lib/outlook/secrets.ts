import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ENCRYPTION_VERSION = 'v1'
const TOKEN_AAD = Buffer.from('varix-outlook-refresh-token:v1', 'utf8')

export function parseOutlookEncryptionKey(serializedKey: string): Buffer {
  const key = Buffer.from(serializedKey.trim(), 'base64')
  if (key.length !== 32) {
    throw new Error('OUTLOOK_TOKEN_ENCRYPTION_KEY debe ser una clave base64 de 32 bytes')
  }
  return key
}

export function encryptOutlookRefreshToken(token: string, serializedKey: string): string {
  if (!token) throw new Error('Microsoft no devolvio un refresh token')

  const key = parseOutlookEncryptionKey(serializedKey)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(TOKEN_AAD)

  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return [
    ENCRYPTION_VERSION,
    iv.toString('base64url'),
    authTag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.')
}

export function decryptOutlookRefreshToken(payload: string, serializedKey: string): string {
  const [version, ivValue, authTagValue, ciphertextValue, ...extra] = payload.split('.')
  if (
    version !== ENCRYPTION_VERSION ||
    !ivValue ||
    !authTagValue ||
    !ciphertextValue ||
    extra.length > 0
  ) {
    throw new Error('El refresh token Outlook cifrado tiene un formato invalido')
  }

  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      parseOutlookEncryptionKey(serializedKey),
      Buffer.from(ivValue, 'base64url')
    )
    decipher.setAAD(TOKEN_AAD)
    decipher.setAuthTag(Buffer.from(authTagValue, 'base64url'))

    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextValue, 'base64url')),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    throw new Error('No se pudo descifrar la autorizacion Outlook')
  }
}

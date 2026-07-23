import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { parseOutlookEncryptionKey } from './secrets'

export const OUTLOOK_OAUTH_COOKIE = '__Host-varix-outlook-oauth'
const STATE_VERSION = 'v1'
const STATE_LIFETIME_MS = 10 * 60 * 1000

interface OAuthStatePayload {
  state: string
  codeVerifier: string
  expiresAt: number
}

function sign(value: string, serializedKey: string): Buffer {
  return createHmac('sha256', parseOutlookEncryptionKey(serializedKey))
    .update('varix-outlook-oauth-state:v1')
    .update(value)
    .digest()
}

export function createOutlookOAuthState(serializedKey: string, now = Date.now()) {
  const state = randomBytes(32).toString('base64url')
  const codeVerifier = randomBytes(48).toString('base64url')
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url')
  const payload: OAuthStatePayload = {
    state,
    codeVerifier,
    expiresAt: now + STATE_LIFETIME_MS,
  }
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const signedValue = `${STATE_VERSION}.${encodedPayload}`
  const signature = sign(signedValue, serializedKey).toString('base64url')

  return {
    state,
    codeChallenge,
    cookieValue: `${signedValue}.${signature}`,
  }
}

export function readOutlookOAuthState(
  cookieValue: string,
  serializedKey: string,
  now = Date.now()
): OAuthStatePayload {
  const [version, encodedPayload, encodedSignature, ...extra] = cookieValue.split('.')
  if (version !== STATE_VERSION || !encodedPayload || !encodedSignature || extra.length > 0) {
    throw new Error('Estado OAuth Outlook invalido')
  }

  const signedValue = `${version}.${encodedPayload}`
  const actualSignature = Buffer.from(encodedSignature, 'base64url')
  const expectedSignature = sign(signedValue, serializedKey)
  if (
    actualSignature.length !== expectedSignature.length ||
    !timingSafeEqual(actualSignature, expectedSignature)
  ) {
    throw new Error('Firma OAuth Outlook invalida')
  }

  let payload: OAuthStatePayload
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as OAuthStatePayload
  } catch {
    throw new Error('Estado OAuth Outlook ilegible')
  }

  if (
    typeof payload.state !== 'string' ||
    payload.state.length < 32 ||
    typeof payload.codeVerifier !== 'string' ||
    payload.codeVerifier.length < 43 ||
    typeof payload.expiresAt !== 'number' ||
    payload.expiresAt < now
  ) {
    throw new Error('Estado OAuth Outlook vencido o incompleto')
  }

  return payload
}

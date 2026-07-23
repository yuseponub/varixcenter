import type { OutlookConfig } from './config'

const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0'
export const OUTLOOK_DELEGATED_SCOPES = [
  'openid',
  'profile',
  'offline_access',
  'User.Read',
  'Calendars.ReadWrite',
] as const

export interface MicrosoftTokenResponse {
  token_type: string
  scope?: string
  expires_in: number
  access_token: string
  refresh_token?: string
}

export interface MicrosoftProfile {
  id: string
  mail?: string | null
  userPrincipalName?: string | null
}

export class MicrosoftOAuthError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message)
    this.name = 'MicrosoftOAuthError'
  }
}

function oauthEndpoint(config: OutlookConfig, endpoint: 'authorize' | 'token'): string {
  return `https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/${endpoint}`
}

export function buildMicrosoftAuthorizationUrl(
  config: OutlookConfig,
  state: string,
  codeChallenge: string
): string {
  if (config.authMode !== 'delegated') {
    throw new Error('La autorizacion interactiva requiere OUTLOOK_AUTH_MODE=delegated')
  }

  const url = new URL(oauthEndpoint(config, 'authorize'))
  url.search = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    redirect_uri: config.oauthRedirectUrl,
    response_mode: 'query',
    scope: OUTLOOK_DELEGATED_SCOPES.join(' '),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
    login_hint: config.mailbox,
  }).toString()
  return url.toString()
}

async function requestToken(
  config: OutlookConfig,
  values: Record<string, string>
): Promise<MicrosoftTokenResponse> {
  const response = await fetch(oauthEndpoint(config, 'token'), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: OUTLOOK_DELEGATED_SCOPES.join(' '),
      ...values,
    }),
    cache: 'no-store',
  })

  if (!response.ok) {
    let code: string | undefined
    let detail = 'Microsoft rechazo la autorizacion'
    try {
      const payload = (await response.json()) as {
        error?: string
        error_description?: string
      }
      code = payload.error
      if (payload.error_description) {
        detail = payload.error_description.replace(/[\r\n\t]+/g, ' ').slice(0, 400)
      }
    } catch {
      // Microsoft normally returns JSON, but a status-only error is safer than
      // reflecting an unknown response body into logs or the browser.
    }
    throw new MicrosoftOAuthError(detail, response.status, code)
  }

  const token = (await response.json()) as MicrosoftTokenResponse
  if (!token.access_token || !Number.isFinite(token.expires_in)) {
    throw new MicrosoftOAuthError('Microsoft devolvio una respuesta OAuth incompleta', 502)
  }
  return token
}

export function redeemMicrosoftAuthorizationCode(
  config: OutlookConfig,
  code: string,
  codeVerifier: string
): Promise<MicrosoftTokenResponse> {
  return requestToken(config, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.oauthRedirectUrl,
    code_verifier: codeVerifier,
  })
}

export function refreshMicrosoftAccessToken(
  config: OutlookConfig,
  refreshToken: string
): Promise<MicrosoftTokenResponse> {
  return requestToken(config, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })
}

export async function getMicrosoftProfile(accessToken: string): Promise<MicrosoftProfile> {
  const response = await fetch(`${GRAPH_ROOT}/me?$select=id,mail,userPrincipalName`, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })
  if (!response.ok) {
    throw new MicrosoftOAuthError('No se pudo verificar la cuenta Microsoft autorizada', response.status)
  }

  const profile = (await response.json()) as MicrosoftProfile
  if (!profile.id) throw new MicrosoftOAuthError('El perfil Microsoft no tiene identificador', 502)
  return profile
}

export function profileMatchesMailbox(profile: MicrosoftProfile, mailbox: string): boolean {
  const expected = mailbox.trim().toLowerCase()
  return [profile.mail, profile.userPrincipalName]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.trim().toLowerCase() === expected)
}

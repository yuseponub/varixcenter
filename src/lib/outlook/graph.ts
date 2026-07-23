import type { OutlookConfig } from './config'
import { createAdminClient } from '@/lib/supabase/admin'
import { refreshMicrosoftAccessToken } from './oauth'
import { decryptOutlookRefreshToken, encryptOutlookRefreshToken } from './secrets'

const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0'

interface TokenResponse {
  access_token: string
  expires_in: number
}

interface TokenCache {
  key: string
  accessToken: string
  expiresAt: number
}

let tokenCache: TokenCache | null = null

export interface GraphDateTimeTimeZone {
  dateTime: string
  timeZone: string
}

export interface GraphEvent {
  '@removed'?: { reason?: string }
  '@odata.etag'?: string
  id: string
  subject?: string | null
  start?: GraphDateTimeTimeZone
  end?: GraphDateTimeTimeZone
  iCalUId?: string | null
  changeKey?: string | null
  isAllDay?: boolean
  isCancelled?: boolean
  showAs?: string | null
  location?: { displayName?: string | null } | null
  webLink?: string | null
  type?: string | null
  seriesMasterId?: string | null
  categories?: string[]
  lastModifiedDateTime?: string | null
}

export interface GraphCollection<T> {
  value: T[]
  '@odata.nextLink'?: string
  '@odata.deltaLink'?: string
}

export interface GraphSubscription {
  id: string
  resource: string
  expirationDateTime: string
}

export class GraphRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message)
    this.name = 'GraphRequestError'
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function tokenCacheKey(config: OutlookConfig): string {
  return [config.authMode, config.tenantId, config.clientId, config.mailbox].join(':')
}

async function getApplicationAccessToken(config: OutlookConfig): Promise<TokenCache> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  })

  const response = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      cache: 'no-store',
    }
  )

  if (!response.ok) {
    const detail = await response.text()
    throw new GraphRequestError(`No se pudo autenticar Microsoft Graph: ${detail.slice(0, 500)}`, response.status)
  }

  const token = (await response.json()) as TokenResponse
  return {
    key: tokenCacheKey(config),
    accessToken: token.access_token,
    expiresAt: Date.now() + token.expires_in * 1000,
  }
}

async function getDelegatedAccessToken(config: OutlookConfig): Promise<TokenCache> {
  if (!config.tokenEncryptionKey) {
    throw new GraphRequestError('Falta OUTLOOK_TOKEN_ENCRYPTION_KEY', 503)
  }

  const admin = createAdminClient()
  // Added by migration 066; kept inside the integration-only untyped boundary.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any
  const { data: connection, error } = await db
    .from('outlook_connections')
    .select('id, refresh_token_ciphertext')
    .eq('mailbox', config.mailbox)
    .eq('calendar_id', config.calendarId)
    .maybeSingle()

  if (error) {
    throw new GraphRequestError(`No se pudo leer la autorizacion Outlook: ${error.message}`, 503)
  }
  if (!connection?.refresh_token_ciphertext) {
    throw new GraphRequestError(
      `La cuenta ${config.mailbox} aun no ha sido autorizada desde Varix`,
      401,
      'OutlookAuthorizationRequired'
    )
  }

  const refreshToken = decryptOutlookRefreshToken(
    connection.refresh_token_ciphertext,
    config.tokenEncryptionKey
  )
  const token = await refreshMicrosoftAccessToken(config, refreshToken)

  if (token.refresh_token) {
    const encryptedRefreshToken = encryptOutlookRefreshToken(
      token.refresh_token,
      config.tokenEncryptionKey
    )
    const { error: updateError } = await db
      .from('outlook_connections')
      .update({
        refresh_token_ciphertext: encryptedRefreshToken,
        token_scopes: token.scope ?? null,
        last_error: null,
      })
      .eq('id', connection.id)
    if (updateError) {
      throw new GraphRequestError(
        `No se pudo guardar la renovacion Outlook: ${updateError.message}`,
        503
      )
    }
  }

  return {
    key: tokenCacheKey(config),
    accessToken: token.access_token,
    expiresAt: Date.now() + token.expires_in * 1000,
  }
}

async function getAccessToken(config: OutlookConfig, forceRefresh = false): Promise<string> {
  const key = tokenCacheKey(config)
  if (
    !forceRefresh &&
    tokenCache?.key === key &&
    tokenCache.expiresAt > Date.now() + 60_000
  ) {
    return tokenCache.accessToken
  }

  tokenCache = config.authMode === 'delegated'
    ? await getDelegatedAccessToken(config)
    : await getApplicationAccessToken(config)
  return tokenCache.accessToken
}

function resolveGraphUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith('/')) return `${GRAPH_ROOT}${pathOrUrl}`
  if (pathOrUrl.startsWith(`${GRAPH_ROOT}/`)) return pathOrUrl
  throw new Error('Microsoft Graph devolvio una URL de paginacion no permitida')
}

export async function graphRequest<T>(
  config: OutlookConfig,
  pathOrUrl: string,
  init: RequestInit & { outlookHeaders?: boolean } = {}
): Promise<T> {
  const url = resolveGraphUrl(pathOrUrl)
  const { outlookHeaders = true, ...requestInit } = init
  let forceRefresh = false

  for (let attempt = 0; attempt < 4; attempt++) {
    const accessToken = await getAccessToken(config, forceRefresh)
    forceRefresh = false

    const headers = new Headers(requestInit.headers)
    headers.set('authorization', `Bearer ${accessToken}`)
    if (requestInit.body && !headers.has('content-type')) headers.set('content-type', 'application/json')
    if (outlookHeaders) {
      headers.set('prefer', 'outlook.timezone="UTC", IdType="ImmutableId"')
    }

    const response = await fetch(url, {
      ...requestInit,
      headers,
      cache: 'no-store',
    })

    if (response.status === 401 && attempt === 0) {
      tokenCache = null
      forceRefresh = true
      continue
    }

    if ((response.status === 429 || response.status >= 500) && attempt < 3) {
      const retryAfterSeconds = Number.parseInt(response.headers.get('retry-after') ?? '', 10)
      const retryMs = Number.isFinite(retryAfterSeconds)
        ? Math.min(retryAfterSeconds * 1000, 10_000)
        : 500 * 2 ** attempt
      await sleep(retryMs)
      continue
    }

    if (!response.ok) {
      let message = `Microsoft Graph respondio ${response.status}`
      let code: string | undefined
      try {
        const payload = (await response.json()) as { error?: { code?: string; message?: string } }
        code = payload.error?.code
        if (payload.error?.message) message = payload.error.message
      } catch {
        // Keep the status-only error; response bodies are not always JSON.
      }
      throw new GraphRequestError(message, response.status, code)
    }

    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }

  throw new GraphRequestError('Microsoft Graph agoto los reintentos', 503)
}

function encodedUser(config: OutlookConfig) {
  return encodeURIComponent(config.mailbox)
}

export function calendarDeltaPath(config: OutlookConfig, start: string, end: string): string {
  const range = `startDateTime=${encodeURIComponent(start)}&endDateTime=${encodeURIComponent(end)}`
  const owner = config.authMode === 'delegated' ? '/me' : `/users/${encodedUser(config)}`
  return `${owner}/calendarView/delta?${range}`
}

export function calendarCreateEventPath(config: OutlookConfig): string {
  const owner = config.authMode === 'delegated' ? '/me' : `/users/${encodedUser(config)}`
  return `${owner}/calendar/events`
}

export function userEventPath(config: OutlookConfig, eventId: string): string {
  const owner = config.authMode === 'delegated' ? '/me' : `/users/${encodedUser(config)}`
  return `${owner}/events/${encodeURIComponent(eventId)}`
}

export function mailboxEventsResource(config: OutlookConfig): string {
  if (config.authMode === 'delegated') return 'me/events'
  const user = encodeURIComponent(config.mailbox)
  // Graph change notifications support the mailbox-wide events resource.
  // A notification from another calendar is harmless: delta reconciliation
  // below still reads only the calendar configured for Varix.
  return `users/${user}/events`
}

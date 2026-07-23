import type { OutlookConfig } from './config'

const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0'

interface TokenResponse {
  access_token: string
  expires_in: number
}

interface TokenCache {
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

async function getAccessToken(config: OutlookConfig, forceRefresh = false): Promise<string> {
  if (!forceRefresh && tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.accessToken
  }

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
  tokenCache = {
    accessToken: token.access_token,
    expiresAt: Date.now() + token.expires_in * 1000,
  }
  return token.access_token
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
  return `/users/${encodedUser(config)}/calendarView/delta?${range}`
}

export function calendarCreateEventPath(config: OutlookConfig): string {
  return `/users/${encodedUser(config)}/calendar/events`
}

export function userEventPath(config: OutlookConfig, eventId: string): string {
  return `/users/${encodedUser(config)}/events/${encodeURIComponent(eventId)}`
}

export function mailboxEventsResource(config: OutlookConfig): string {
  const user = encodeURIComponent(config.mailbox)
  // Graph change notifications support the mailbox-wide events resource.
  // A notification from another calendar is harmless: delta reconciliation
  // below still reads only the calendar configured for Varix.
  return `users/${user}/events`
}

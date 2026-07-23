export type OutlookAuthMode = 'application' | 'delegated'

export interface OutlookConfig {
  authMode: OutlookAuthMode
  tenantId: string
  clientId: string
  clientSecret: string
  tokenEncryptionKey: string | null
  mailbox: string
  calendarId: string
  webhookClientState: string
  webhookUrl: string
  oauthRedirectUrl: string
  pastDays: number
  futureDays: number
}

const BASE_REQUIRED_KEYS = [
  'MICROSOFT_CLIENT_ID',
  'MICROSOFT_CLIENT_SECRET',
  'OUTLOOK_MAILBOX',
  'OUTLOOK_WEBHOOK_CLIENT_STATE',
] as const

export function getOutlookAuthMode(): OutlookAuthMode {
  return process.env.OUTLOOK_AUTH_MODE === 'delegated' ? 'delegated' : 'application'
}

export function isOutlookSyncEnabled(): boolean {
  return process.env.ENABLE_OUTLOOK_SYNC === 'true'
}

function hasValidEncryptionKey(value: string | undefined): boolean {
  if (!value?.trim()) return false
  try {
    return Buffer.from(value.trim(), 'base64').length === 32
  } catch {
    return false
  }
}

export function isOutlookConfigured(): boolean {
  if (!BASE_REQUIRED_KEYS.every((key) => Boolean(process.env[key]?.trim()))) return false

  const authMode = getOutlookAuthMode()
  if (authMode === 'application' && !process.env.MICROSOFT_TENANT_ID?.trim()) return false
  if (authMode === 'delegated' && !hasValidEncryptionKey(process.env.OUTLOOK_TOKEN_ENCRYPTION_KEY)) {
    return false
  }

  const clientStateLength = process.env.OUTLOOK_WEBHOOK_CLIENT_STATE!.trim().length
  const calendarId = process.env.OUTLOOK_CALENDAR_ID?.trim() || 'calendar'
  return clientStateLength >= 16 && clientStateLength <= 128 && calendarId === 'calendar'
}

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(value ?? '', 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

function inferAppUrl(): string {
  const explicitAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (explicitAppUrl) return explicitAppUrl.replace(/\/$/, '')

  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  if (vercelHost) {
    return `https://${vercelHost.replace(/^https?:\/\//, '').replace(/\/$/, '')}`
  }

  return ''
}

function validateHttpsUrl(value: string, label: string): string {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(`${label} no es una URL valida`)
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new Error(`${label} debe usar HTTPS y no incluir credenciales`)
  }
  return parsed.toString()
}

export function getOutlookConfig(options?: { requireWebhook?: boolean }): OutlookConfig {
  const authMode = getOutlookAuthMode()
  const missing = BASE_REQUIRED_KEYS.filter((key) => !process.env[key]?.trim()) as string[]
  if (authMode === 'application' && !process.env.MICROSOFT_TENANT_ID?.trim()) {
    missing.push('MICROSOFT_TENANT_ID')
  }
  if (authMode === 'delegated' && !process.env.OUTLOOK_TOKEN_ENCRYPTION_KEY?.trim()) {
    missing.push('OUTLOOK_TOKEN_ENCRYPTION_KEY')
  }
  if (missing.length > 0) {
    throw new Error(`Configuracion Outlook incompleta: ${missing.join(', ')}`)
  }

  const tokenEncryptionKey = process.env.OUTLOOK_TOKEN_ENCRYPTION_KEY?.trim() || null
  if (authMode === 'delegated' && !hasValidEncryptionKey(tokenEncryptionKey ?? undefined)) {
    throw new Error('OUTLOOK_TOKEN_ENCRYPTION_KEY debe ser una clave base64 de 32 bytes')
  }

  const webhookClientState = process.env.OUTLOOK_WEBHOOK_CLIENT_STATE?.trim() ?? ''
  const calendarId = process.env.OUTLOOK_CALENDAR_ID?.trim() || 'calendar'
  const appUrl = inferAppUrl()
  const webhookUrl = process.env.OUTLOOK_WEBHOOK_URL?.trim()
    ? process.env.OUTLOOK_WEBHOOK_URL.trim()
    : appUrl
      ? `${appUrl}/api/integrations/outlook/webhook`
      : ''
  const oauthRedirectUrl = process.env.OUTLOOK_OAUTH_REDIRECT_URI?.trim()
    ? process.env.OUTLOOK_OAUTH_REDIRECT_URI.trim()
    : appUrl
      ? `${appUrl}/api/integrations/outlook/callback`
      : ''

  if (calendarId !== 'calendar') {
    throw new Error(
      'La sincronizacion estable de Microsoft Graph v1.0 requiere OUTLOOK_CALENDAR_ID=calendar'
    )
  }

  if (
    webhookClientState.length < 16 ||
    webhookClientState.length > 128
  ) {
    throw new Error('OUTLOOK_WEBHOOK_CLIENT_STATE debe tener entre 16 y 128 caracteres')
  }
  if (options?.requireWebhook && !webhookUrl) {
    throw new Error('Falta OUTLOOK_WEBHOOK_URL o NEXT_PUBLIC_APP_URL')
  }
  if (options?.requireWebhook) validateHttpsUrl(webhookUrl, 'La URL del webhook Outlook')
  if (authMode === 'delegated') {
    if (!oauthRedirectUrl) throw new Error('Falta OUTLOOK_OAUTH_REDIRECT_URI o NEXT_PUBLIC_APP_URL')
    validateHttpsUrl(oauthRedirectUrl, 'La URL de retorno OAuth Outlook')
  }

  return {
    authMode,
    tenantId:
      process.env.MICROSOFT_TENANT_ID?.trim() || (authMode === 'delegated' ? 'consumers' : ''),
    clientId: process.env.MICROSOFT_CLIENT_ID!.trim(),
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET!.trim(),
    tokenEncryptionKey,
    mailbox: process.env.OUTLOOK_MAILBOX!.trim().toLowerCase(),
    calendarId,
    webhookClientState,
    webhookUrl,
    oauthRedirectUrl,
    pastDays: boundedInteger(process.env.OUTLOOK_SYNC_PAST_DAYS, 30, 0, 365),
    futureDays: boundedInteger(process.env.OUTLOOK_SYNC_FUTURE_DAYS, 400, 30, 730),
  }
}

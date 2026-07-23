export interface OutlookConfig {
  tenantId: string
  clientId: string
  clientSecret: string
  mailbox: string
  calendarId: string
  webhookClientState: string
  webhookUrl: string
  pastDays: number
  futureDays: number
}

const REQUIRED_KEYS = [
  'MICROSOFT_TENANT_ID',
  'MICROSOFT_CLIENT_ID',
  'MICROSOFT_CLIENT_SECRET',
  'OUTLOOK_MAILBOX',
  'OUTLOOK_WEBHOOK_CLIENT_STATE',
] as const

export function isOutlookSyncEnabled(): boolean {
  return process.env.ENABLE_OUTLOOK_SYNC === 'true'
}

export function isOutlookConfigured(): boolean {
  if (!REQUIRED_KEYS.every((key) => Boolean(process.env[key]?.trim()))) return false
  const clientStateLength = process.env.OUTLOOK_WEBHOOK_CLIENT_STATE!.trim().length
  const calendarId = process.env.OUTLOOK_CALENDAR_ID?.trim() || 'calendar'
  return clientStateLength >= 16 && clientStateLength <= 128 && calendarId === 'calendar'
}

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(value ?? '', 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

function inferWebhookUrl(): string {
  if (process.env.OUTLOOK_WEBHOOK_URL?.trim()) {
    return process.env.OUTLOOK_WEBHOOK_URL.trim()
  }

  const explicitAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (explicitAppUrl) {
    return `${explicitAppUrl.replace(/\/$/, '')}/api/integrations/outlook/webhook`
  }

  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  if (vercelHost) {
    return `https://${vercelHost.replace(/^https?:\/\//, '').replace(/\/$/, '')}/api/integrations/outlook/webhook`
  }

  return ''
}

export function getOutlookConfig(options?: { requireWebhook?: boolean }): OutlookConfig {
  const missing = REQUIRED_KEYS.filter((key) => !process.env[key]?.trim())
  if (missing.length > 0) {
    throw new Error(`Configuracion Outlook incompleta: ${missing.join(', ')}`)
  }

  const webhookClientState = process.env.OUTLOOK_WEBHOOK_CLIENT_STATE?.trim() ?? ''
  const webhookUrl = inferWebhookUrl()
  const calendarId = process.env.OUTLOOK_CALENDAR_ID?.trim() || 'calendar'

  if (calendarId !== 'calendar') {
    throw new Error(
      'La sincronizacion estable de Microsoft Graph v1.0 requiere OUTLOOK_CALENDAR_ID=calendar'
    )
  }

  if (options?.requireWebhook && !webhookClientState) {
    throw new Error('Falta OUTLOOK_WEBHOOK_CLIENT_STATE')
  }
  if (
    options?.requireWebhook &&
    (webhookClientState.length < 16 || webhookClientState.length > 128)
  ) {
    throw new Error('OUTLOOK_WEBHOOK_CLIENT_STATE debe tener entre 16 y 128 caracteres')
  }
  if (options?.requireWebhook && !webhookUrl) {
    throw new Error('Falta OUTLOOK_WEBHOOK_URL o NEXT_PUBLIC_APP_URL')
  }
  if (options?.requireWebhook) {
    let parsedWebhook: URL
    try {
      parsedWebhook = new URL(webhookUrl)
    } catch {
      throw new Error('La URL del webhook Outlook no es valida')
    }
    if (parsedWebhook.protocol !== 'https:' || parsedWebhook.username || parsedWebhook.password) {
      throw new Error('La URL del webhook Outlook debe ser HTTPS y no incluir credenciales')
    }
  }

  return {
    tenantId: process.env.MICROSOFT_TENANT_ID!.trim(),
    clientId: process.env.MICROSOFT_CLIENT_ID!.trim(),
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET!.trim(),
    mailbox: process.env.OUTLOOK_MAILBOX!.trim().toLowerCase(),
    calendarId,
    webhookClientState,
    webhookUrl,
    pastDays: boundedInteger(process.env.OUTLOOK_SYNC_PAST_DAYS, 30, 0, 365),
    futureDays: boundedInteger(process.env.OUTLOOK_SYNC_FUTURE_DAYS, 400, 30, 730),
  }
}

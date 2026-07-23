import { timingSafeEqual } from 'node:crypto'
import { after, type NextRequest } from 'next/server'
import { isOutlookConfigured, isOutlookSyncEnabled } from '@/lib/outlook/config'
import { syncOutlookCalendar } from '@/lib/outlook/sync'
import { ensureOutlookSubscription } from '@/lib/outlook/subscription'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

interface ChangeNotification {
  clientState?: string
  lifecycleEvent?: 'missed' | 'subscriptionRemoved' | 'reauthorizationRequired'
}

interface NotificationPayload {
  value?: ChangeNotification[]
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

/**
 * Microsoft first validates notificationUrl by POSTing a validationToken.
 * It must be echoed as plain text before any auth or database work.
 */
export async function POST(request: NextRequest) {
  const validationToken = request.nextUrl.searchParams.get('validationToken')
  if (validationToken) {
    return new Response(validationToken, {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  }

  const expectedState = process.env.OUTLOOK_WEBHOOK_CLIENT_STATE?.trim()
  if (!expectedState) {
    console.error('[Outlook webhook] OUTLOOK_WEBHOOK_CLIENT_STATE no configurado')
    return Response.json({ error: 'Outlook webhook not configured' }, { status: 503 })
  }

  let payload: NotificationPayload
  try {
    payload = (await request.json()) as NotificationPayload
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const notifications = payload.value ?? []
  if (
    notifications.length === 0 ||
    notifications.some((notification) =>
      !notification.clientState || !safeEqual(notification.clientState, expectedState)
    )
  ) {
    return Response.json({ error: 'Invalid clientState' }, { status: 401 })
  }

  const hasLifecycleEvent = notifications.some((notification) => Boolean(notification.lifecycleEvent))
  const lifecycleEvents = new Set(
    notifications.flatMap((notification) =>
      notification.lifecycleEvent ? [notification.lifecycleEvent] : []
    )
  )

  if (!isOutlookSyncEnabled() || !isOutlookConfigured()) {
    return new Response(null, { status: 202 })
  }

  // Acknowledge immediately; Next keeps the function alive to reconcile safely.
  after(async () => {
    try {
      if (lifecycleEvents.has('subscriptionRemoved')) {
        await ensureOutlookSubscription({ forceRecreate: true })
      } else if (lifecycleEvents.has('reauthorizationRequired')) {
        // Renewing also reauthorizes in one request and avoids inconsistent
        // subscription state from two rapid Microsoft Graph operations.
        await ensureOutlookSubscription({ forceRenew: true })
      } else if (hasLifecycleEvent) {
        await ensureOutlookSubscription()
      }

      await syncOutlookCalendar(hasLifecycleEvent ? 'webhook-lifecycle' : 'webhook')
    } catch (error) {
      console.error('[Outlook webhook] Sincronizacion en segundo plano fallida:', error)
    }
  })

  return new Response(null, { status: 202 })
}

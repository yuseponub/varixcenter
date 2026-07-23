import type { NextRequest } from 'next/server'
import { isOutlookConfigured, isOutlookSyncEnabled } from '@/lib/outlook/config'
import { syncOutlookCalendar } from '@/lib/outlook/sync'
import { ensureOutlookSubscription } from '@/lib/outlook/subscription'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  return Boolean(cronSecret) && request.headers.get('authorization') === `Bearer ${cronSecret}`
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return new Response('Unauthorized', { status: 401 })

  if (!isOutlookSyncEnabled()) {
    return Response.json({ skipped: true, reason: 'ENABLE_OUTLOOK_SYNC disabled' })
  }
  if (!isOutlookConfigured()) {
    return Response.json(
      { success: false, error: 'Outlook environment variables are incomplete' },
      { status: 503 }
    )
  }

  try {
    const subscription = await ensureOutlookSubscription()
    const sync = await syncOutlookCalendar('cron')
    return Response.json({ success: sync.ok, sync, subscription })
  } catch (error) {
    console.error('[Outlook cron] Error:', error)
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown Outlook sync error',
      },
      { status: 500 }
    )
  }
}

import { createClient } from '@/lib/supabase/server'
import { isOutlookConfigured, isOutlookSyncEnabled } from '@/lib/outlook/config'
import type { OutlookSyncStatus } from '@/types/outlook'

export async function getOutlookSyncStatus(): Promise<OutlookSyncStatus> {
  const configured = isOutlookConfigured()
  const enabled = isOutlookSyncEnabled()

  if (!configured || !enabled) {
    return {
      configured,
      enabled,
      mailbox: null,
      last_synced_at: null,
      last_sync_ok: null,
      last_error: null,
      subscription_expires_at: null,
    }
  }

  const supabase = await createClient()
  // View is introduced by migration 065 and intentionally excludes delta tokens.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('outlook_sync_status')
    .select('mailbox, enabled, last_synced_at, last_sync_ok, last_error, subscription_expires_at')
    .eq('enabled', true)
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    return {
      configured: true,
      enabled,
      mailbox: null,
      last_synced_at: null,
      last_sync_ok: false,
      last_error: error?.message ?? 'Conexion Outlook aun no inicializada',
      subscription_expires_at: null,
    }
  }

  return { configured: true, ...data } as OutlookSyncStatus
}

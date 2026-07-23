import { createClient } from '@/lib/supabase/server'
import {
  getOutlookAuthMode,
  isOutlookConfigured,
  isOutlookSyncEnabled,
} from '@/lib/outlook/config'
import type { OutlookSyncStatus } from '@/types/outlook'

export async function getOutlookSyncStatus(): Promise<OutlookSyncStatus> {
  const configured = isOutlookConfigured()
  const enabled = isOutlookSyncEnabled()
  const authMode = getOutlookAuthMode()
  const supabase = await createClient()
  const { data: role } = await supabase.rpc('get_user_role')
  const canManage = role === 'admin'

  if (!configured || !enabled) {
    return {
      configured,
      enabled,
      auth_mode: authMode,
      authorized: configured && authMode === 'application',
      can_manage: canManage,
      mailbox: null,
      last_synced_at: null,
      last_sync_ok: null,
      last_error: null,
      subscription_expires_at: null,
    }
  }

  // View is introduced by migration 065 and intentionally excludes delta tokens.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('outlook_sync_status')
    .select(
      'mailbox, enabled, last_synced_at, last_sync_ok, last_error, subscription_expires_at, auth_mode, authorized'
    )
    .eq('enabled', true)
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    return {
      configured: true,
      enabled,
      auth_mode: authMode,
      authorized: authMode === 'application',
      can_manage: canManage,
      mailbox: null,
      last_synced_at: null,
      last_sync_ok: error ? false : null,
      last_error:
        error?.message ??
        (authMode === 'delegated' ? null : 'Conexion Outlook aun no inicializada'),
      subscription_expires_at: null,
    }
  }

  return { configured: true, can_manage: canManage, ...data } as OutlookSyncStatus
}

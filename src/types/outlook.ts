export interface OutlookConnection {
  id: string
  mailbox: string
  calendar_id: string
  enabled: boolean
  window_start: string | null
  window_end: string | null
  delta_link: string | null
  subscription_id: string | null
  subscription_expires_at: string | null
  last_synced_at: string | null
  last_sync_ok: boolean | null
  last_error: string | null
  sync_lock_owner: string | null
  sync_lock_until: string | null
  auth_mode: 'application' | 'delegated'
  microsoft_user_id: string | null
  refresh_token_ciphertext: string | null
  token_scopes: string | null
  authorized_at: string | null
}

export type OutlookMatchStatus = 'unmatched' | 'matched' | 'conflict' | 'ignored'

export interface OutlookEventRow {
  id: string
  connection_id: string
  graph_event_id: string
  ical_uid: string | null
  change_key: string | null
  subject: string
  start_at: string
  end_at: string
  original_time_zone: string | null
  is_all_day: boolean
  is_cancelled: boolean
  show_as: string | null
  location: string | null
  web_link: string | null
  event_type: string | null
  series_master_id: string | null
  categories: string[]
  graph_last_modified_at: string | null
  appointment_id: string | null
  match_status: OutlookMatchStatus
  sync_error: string | null
  deleted_at: string | null
  synced_at: string
}

export interface OutlookSyncStats {
  received: number
  upserted: number
  removed: number
  linked: number
  appointments_updated: number
  conflicts: number
  outbox_queued: number
  outbox_processed: number
  outbox_failed: number
  pages: number
}

export interface OutlookSyncResult {
  ok: boolean
  connectionId: string
  fullSync: boolean
  stats: OutlookSyncStats
  syncedAt: string
  skipped?: 'already-running'
}

export interface OutlookSyncStatus {
  configured: boolean
  enabled: boolean
  auth_mode: 'application' | 'delegated'
  authorized: boolean
  can_manage: boolean
  mailbox: string | null
  last_synced_at: string | null
  last_sync_ok: boolean | null
  last_error: string | null
  subscription_expires_at: string | null
}

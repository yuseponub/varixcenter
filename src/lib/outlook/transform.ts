import type { GraphDateTimeTimeZone, GraphEvent } from './graph'
import type { OutlookMatchStatus } from '@/types/outlook'

const BOGOTA_GRAPH_ZONES = new Set([
  'SA Pacific Standard Time',
  'America/Bogota',
])

const UTC_GRAPH_ZONES = new Set(['UTC', 'Etc/UTC', 'Etc/GMT', 'GMT'])

export function normalizeOutlookSubject(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export function graphDateTimeToIso(value: GraphDateTimeTimeZone | undefined): string | null {
  if (!value?.dateTime) return null
  const raw = value.dateTime.trim()
  const hasOffset = /(?:Z|[+-]\d{2}:\d{2})$/i.test(raw)
  let candidate = raw

  if (!hasOffset) {
    if (UTC_GRAPH_ZONES.has(value.timeZone)) candidate = `${raw}Z`
    else if (BOGOTA_GRAPH_ZONES.has(value.timeZone)) candidate = `${raw}-05:00`
    else return null
  }

  const parsed = new Date(candidate)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function graphAllDayDateToIso(value: GraphDateTimeTimeZone | undefined): string | null {
  const date = value?.dateTime?.slice(0, 10)
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const parsed = new Date(`${date}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

export interface OutlookEventUpsert {
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

export function graphEventToUpsert(
  event: GraphEvent,
  options: {
    connectionId: string
    appointmentId?: string | null
    matchStatus?: OutlookMatchStatus
  }
): OutlookEventUpsert | null {
  const startAt = event.isAllDay
    ? graphAllDayDateToIso(event.start)
    : graphDateTimeToIso(event.start)
  const endAt = event.isAllDay
    ? graphAllDayDateToIso(event.end)
    : graphDateTimeToIso(event.end)
  if (!event.id || !startAt || !endAt || new Date(endAt) <= new Date(startAt)) return null

  return {
    connection_id: options.connectionId,
    graph_event_id: event.id,
    ical_uid: event.iCalUId ?? null,
    change_key: event.changeKey ?? event['@odata.etag'] ?? null,
    subject: event.subject?.trim() || '(Sin asunto)',
    start_at: startAt,
    end_at: endAt,
    original_time_zone: event.start?.timeZone ?? null,
    is_all_day: event.isAllDay ?? false,
    is_cancelled: event.isCancelled ?? false,
    show_as: event.showAs ?? null,
    location: event.location?.displayName?.trim() || null,
    web_link: event.webLink ?? null,
    event_type: event.type ?? null,
    series_master_id: event.seriesMasterId ?? null,
    categories: event.categories ?? [],
    graph_last_modified_at: event.lastModifiedDateTime ?? null,
    appointment_id: options.appointmentId ?? null,
    match_status: options.matchStatus ?? (options.appointmentId ? 'matched' : 'unmatched'),
    sync_error: null,
    deleted_at: null,
    synced_at: new Date().toISOString(),
  }
}

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import type { OutlookConfig } from './config'
import type { OutlookConnection } from '@/types/outlook'

export async function getOrCreateOutlookConnection(
  client: SupabaseClient<Database>,
  config: OutlookConfig
): Promise<OutlookConnection> {
  // Tables are added by migration 065; generated project types can lag behind
  // a migration during deployment, so integration-only queries are untyped here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = client as any

  const { data: existing, error: fetchError } = await db
    .from('outlook_connections')
    .select('*')
    .eq('mailbox', config.mailbox)
    .eq('calendar_id', config.calendarId)
    .maybeSingle()

  if (fetchError) throw new Error(`No se pudo consultar la conexion Outlook: ${fetchError.message}`)
  if (existing) {
    if (existing.auth_mode !== config.authMode) {
      const { data: updated, error: updateError } = await db
        .from('outlook_connections')
        .update({ auth_mode: config.authMode })
        .eq('id', existing.id)
        .select('*')
        .single()
      if (updateError) {
        throw new Error(`No se pudo actualizar el modo de autenticacion Outlook: ${updateError.message}`)
      }
      return updated as OutlookConnection
    }
    return existing as OutlookConnection
  }

  const { data, error } = await db
    .from('outlook_connections')
    .insert({
      mailbox: config.mailbox,
      calendar_id: config.calendarId,
      enabled: true,
      auth_mode: config.authMode,
    })
    .select('*')
    .single()

  if (error) {
    // A concurrent webhook/cron can create the same connection first.
    if (error.code === '23505') {
      const { data: raced, error: racedError } = await db
        .from('outlook_connections')
        .select('*')
        .eq('mailbox', config.mailbox)
        .eq('calendar_id', config.calendarId)
        .single()
      if (racedError) throw new Error(`No se pudo recuperar la conexion Outlook: ${racedError.message}`)
      return raced as OutlookConnection
    }
    throw new Error(`No se pudo crear la conexion Outlook: ${error.message}`)
  }

  return data as OutlookConnection
}

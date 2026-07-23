import { createAdminClient } from '@/lib/supabase/admin'
import { getOutlookConfig } from './config'
import { getOrCreateOutlookConnection } from './repository'
import {
  graphRequest,
  GraphRequestError,
  mailboxEventsResource,
  type GraphSubscription,
} from './graph'

export interface SubscriptionResult {
  subscriptionId: string
  expirationDateTime: string
  changed: boolean
}

interface EnsureSubscriptionOptions {
  forceRenew?: boolean
  forceRecreate?: boolean
}

export async function ensureOutlookSubscription(
  options: EnsureSubscriptionOptions = {}
): Promise<SubscriptionResult> {
  const config = getOutlookConfig({ requireWebhook: true })
  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any
  const connection = await getOrCreateOutlookConnection(admin, config)

  if (!connection.enabled) throw new Error('La conexion Outlook esta deshabilitada')

  const renewBefore = Date.now() + 48 * 60 * 60 * 1000
  if (
    !options.forceRenew &&
    !options.forceRecreate &&
    connection.subscription_id &&
    connection.subscription_expires_at &&
    new Date(connection.subscription_expires_at).getTime() > renewBefore
  ) {
    return {
      subscriptionId: connection.subscription_id,
      expirationDateTime: connection.subscription_expires_at,
      changed: false,
    }
  }

  // Outlook subscriptions last under seven days; six days leaves a safe renewal margin.
  const expirationDateTime = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString()
  let subscription: GraphSubscription | null = null

  if (connection.subscription_id && !options.forceRecreate) {
    try {
      subscription = await graphRequest<GraphSubscription>(
        config,
        `/subscriptions/${encodeURIComponent(connection.subscription_id)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ expirationDateTime }),
          outlookHeaders: false,
        }
      )
    } catch (error) {
      if (!(error instanceof GraphRequestError) || error.status !== 404) throw error
    }
  }

  if (!subscription) {
    subscription = await graphRequest<GraphSubscription>(config, '/subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        changeType: 'created,updated,deleted',
        notificationUrl: config.webhookUrl,
        lifecycleNotificationUrl: config.webhookUrl,
        resource: mailboxEventsResource(config),
        expirationDateTime,
        clientState: config.webhookClientState,
      }),
      outlookHeaders: false,
    })
  }

  const { error } = await db
    .from('outlook_connections')
    .update({
      subscription_id: subscription.id,
      subscription_expires_at: subscription.expirationDateTime,
      last_error: null,
    })
    .eq('id', connection.id)

  if (error) throw new Error(`No se pudo guardar la suscripcion Outlook: ${error.message}`)

  return {
    subscriptionId: subscription.id,
    expirationDateTime: subscription.expirationDateTime,
    changed: true,
  }
}

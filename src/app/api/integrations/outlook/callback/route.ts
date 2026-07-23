import { after, type NextRequest, NextResponse } from 'next/server'
import { canManageOutlookIntegration } from '@/lib/outlook/access'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOutlookConfig, isOutlookConfigured } from '@/lib/outlook/config'
import {
  getMicrosoftProfile,
  profileMatchesMailbox,
  redeemMicrosoftAuthorizationCode,
} from '@/lib/outlook/oauth'
import { OUTLOOK_OAUTH_COOKIE, readOutlookOAuthState } from '@/lib/outlook/oauth-state'
import { encryptOutlookRefreshToken } from '@/lib/outlook/secrets'
import { ensureOutlookSubscription } from '@/lib/outlook/subscription'
import { syncOutlookCalendar } from '@/lib/outlook/sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function redirectToCalendar(request: NextRequest, status: string): NextResponse {
  const url = new URL('/citas', request.url)
  url.searchParams.set('outlook', status)
  const response = NextResponse.redirect(url)
  response.cookies.set(OUTLOOK_OAUTH_COOKIE, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return response
}

export async function GET(request: NextRequest) {
  if (!(await canManageOutlookIntegration())) {
    return redirectToCalendar(request, 'forbidden')
  }
  if (!isOutlookConfigured()) {
    return redirectToCalendar(request, 'not-configured')
  }

  const config = getOutlookConfig()
  if (config.authMode !== 'delegated' || !config.tokenEncryptionKey) {
    return redirectToCalendar(request, 'wrong-mode')
  }

  const providerError = request.nextUrl.searchParams.get('error')
  if (providerError) {
    console.warn(`[Outlook OAuth] Microsoft cancelo la autorizacion: ${providerError.slice(0, 100)}`)
    return redirectToCalendar(request, providerError === 'access_denied' ? 'denied' : 'error')
  }

  try {
    const code = request.nextUrl.searchParams.get('code')
    const returnedState = request.nextUrl.searchParams.get('state')
    const stateCookie = request.cookies.get(OUTLOOK_OAUTH_COOKIE)?.value
    if (!code || !returnedState || !stateCookie) {
      throw new Error('Respuesta OAuth Outlook incompleta')
    }

    const oauthState = readOutlookOAuthState(stateCookie, config.tokenEncryptionKey)
    if (oauthState.state !== returnedState) throw new Error('Estado OAuth Outlook no coincide')

    const token = await redeemMicrosoftAuthorizationCode(config, code, oauthState.codeVerifier)
    if (!token.refresh_token) {
      throw new Error('Microsoft no devolvio acceso permanente; vuelva a autorizar la cuenta')
    }

    const profile = await getMicrosoftProfile(token.access_token)
    if (!profileMatchesMailbox(profile, config.mailbox)) {
      throw new Error(`La cuenta autorizada no es ${config.mailbox}`)
    }

    const admin = createAdminClient()
    // Migration 066 owns this narrow, service-role-only OAuth storage boundary.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = admin as any
    const encryptedRefreshToken = encryptOutlookRefreshToken(
      token.refresh_token,
      config.tokenEncryptionKey
    )
    const { data: connection, error } = await db
      .from('outlook_connections')
      .upsert(
        {
          mailbox: config.mailbox,
          calendar_id: config.calendarId,
          enabled: true,
          auth_mode: 'delegated',
          microsoft_user_id: profile.id,
          refresh_token_ciphertext: encryptedRefreshToken,
          token_scopes: token.scope ?? null,
          authorized_at: new Date().toISOString(),
          window_start: null,
          window_end: null,
          delta_link: null,
          subscription_id: null,
          subscription_expires_at: null,
          last_sync_ok: null,
          last_error: null,
        },
        { onConflict: 'mailbox,calendar_id' }
      )
      .select('id')
      .single()

    if (error || !connection) {
      throw new Error(`No se pudo guardar la autorizacion Outlook: ${error?.message ?? 'sin fila'}`)
    }

    after(async () => {
      try {
        await ensureOutlookSubscription({ forceRecreate: true })
        await syncOutlookCalendar('oauth-connected')
      } catch (syncError) {
        const message = String(
          syncError instanceof Error ? syncError.message : syncError
        ).slice(0, 2000)
        console.error('[Outlook OAuth] Primera sincronizacion fallida:', syncError)
        await db
          .from('outlook_connections')
          .update({ last_sync_ok: false, last_error: message })
          .eq('id', connection.id)
      }
    })

    return redirectToCalendar(request, 'connected')
  } catch (error) {
    console.error('[Outlook OAuth] No se pudo completar la autorizacion:', error)
    return redirectToCalendar(request, 'error')
  }
}

import { NextResponse } from 'next/server'
import { canManageOutlookIntegration } from '@/lib/outlook/access'
import { getOutlookConfig, isOutlookConfigured } from '@/lib/outlook/config'
import { buildMicrosoftAuthorizationUrl } from '@/lib/outlook/oauth'
import { createOutlookOAuthState, OUTLOOK_OAUTH_COOKIE } from '@/lib/outlook/oauth-state'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (!(await canManageOutlookIntegration())) {
    return new Response('No autorizado', { status: 403 })
  }
  if (!isOutlookConfigured()) {
    return new Response('La integracion Outlook aun no esta configurada', { status: 503 })
  }

  const config = getOutlookConfig()
  if (config.authMode !== 'delegated' || !config.tokenEncryptionKey) {
    return new Response('Outlook no esta configurado para autorizacion personal', { status: 409 })
  }

  const oauthState = createOutlookOAuthState(config.tokenEncryptionKey)
  const authorizationUrl = buildMicrosoftAuthorizationUrl(
    config,
    oauthState.state,
    oauthState.codeChallenge
  )
  const response = NextResponse.redirect(authorizationUrl)
  response.cookies.set(OUTLOOK_OAUTH_COOKIE, oauthState.cookieValue, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 10 * 60,
  })
  return response
}

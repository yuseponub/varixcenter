import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/types/supabase'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: Use getUser() not getSession() - validates JWT server-side
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isAuthRoute = request.nextUrl.pathname.startsWith('/login')
  // El cron de Vercel no tiene cookie de sesion: el endpoint se protege
  // por si mismo con CRON_SECRET (Bearer). Sin esta excepcion, el
  // middleware redirige la invocacion a /login y los recordatorios
  // nunca se ejecutan.
  const isCronRoute = request.nextUrl.pathname.startsWith('/api/cron/')
  // Microsoft Graph valida y entrega notificaciones sin una cookie Supabase.
  // El handler verifica validationToken/clientState antes de procesarlas.
  const isOutlookWebhook =
    request.nextUrl.pathname === '/api/integrations/outlook/webhook'
  // Estas APIs validan la sesion dentro del route handler para poder responder
  // 401 JSON a clientes sin sesion. Si pasan por el redirect generico, reciben
  // 307 + /login en lugar del contrato HTTP esperado.
  const isApiWithOwnAuth =
    request.nextUrl.pathname === '/api/ocr' ||
    request.nextUrl.pathname === '/api/transcribe'
  const isPublicRoute =
    request.nextUrl.pathname === '/' || isCronRoute || isOutlookWebhook || isApiWithOwnAuth

  // Redirect authenticated users away from login
  if (user && isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  // Redirect unauthenticated users to login (except public routes)
  if (!user && !isAuthRoute && !isPublicRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images in public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

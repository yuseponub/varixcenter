import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/types/supabase'

/**
 * Creates a Supabase client for Next.js middleware.
 * Handles token refresh and cookie synchronization on every request.
 *
 * Returns both the Supabase client and the response object (which may have
 * updated cookies from token refresh).
 *
 * IMPORTANT: Always use getUser() instead of getSession() for security.
 * getSession() reads from cookies without validating the JWT signature.
 * getUser() revalidates with Supabase Auth server.
 *
 * Usage:
 * ```ts
 * // In middleware.ts
 * import { createClient } from '@/lib/supabase/middleware'
 *
 * export async function middleware(request: NextRequest) {
 *   const { supabase, response } = createClient(request)
 *   const { data: { user } } = await supabase.auth.getUser()
 *   // ... authentication logic
 *   return response
 * }
 * ```
 */
export function createClient(request: NextRequest) {
  // Start with a response that forwards the request
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Update cookies on the request (for downstream handlers)
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          // Create a new response with the updated cookies
          supabaseResponse = NextResponse.next({ request })
          // Set cookies on the response (for the browser)
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  return { supabase, response: supabaseResponse }
}

# Phase 1: Security Foundation - Research

**Researched:** 2026-01-23
**Domain:** Supabase Auth, RLS, PostgreSQL Audit Logging, Next.js 15 SSR
**Confidence:** HIGH

## Summary

This phase establishes the security foundation for the VarixClinic system: authentication with email/password, role-based access control via JWT custom claims, Row Level Security (RLS) on all tables, and an immutable audit log that captures who did what, when, and from where.

The standard approach for Next.js 15 + Supabase Auth uses the `@supabase/ssr` package with cookie-based sessions. Roles are stored in `app_metadata` (not `user_metadata`) and injected into the JWT via a Custom Access Token Hook. RLS policies then reference `auth.jwt() -> 'app_metadata' ->> 'role'` for authorization decisions. Audit logging uses PostgreSQL triggers with JSONB snapshots of old/new data, capturing the authenticated user via `auth.uid()` and client IP/user-agent via PostgREST headers.

**Primary recommendation:** Implement defense-in-depth: RLS policies as the primary access control mechanism, Custom Access Token Hook for role injection, triggers for audit capture, and middleware for session refresh. Never rely on application-level checks alone.

## Standard Stack

### Core Authentication

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @supabase/supabase-js | Latest | Supabase client SDK | Official client, handles auth state, realtime, storage |
| @supabase/ssr | Latest | Server-side auth for Next.js | Cookie-based sessions, middleware integration, token refresh |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| jose | 5.x | JWT verification | If you need to manually decode/verify JWTs server-side |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @supabase/ssr | NextAuth + Supabase | NextAuth adds complexity; @supabase/ssr is purpose-built for Supabase |
| app_metadata for roles | Separate user_roles table | app_metadata in JWT avoids extra DB query per request; table offers more flexibility |
| Custom triggers for audit | supa_audit extension | Custom triggers give more control over captured fields (IP, user-agent) |

**Installation:**
```bash
npm install @supabase/supabase-js @supabase/ssr
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── lib/
│   └── supabase/
│       ├── client.ts       # Browser client (createBrowserClient)
│       ├── server.ts       # Server Component client
│       └── middleware.ts   # Middleware client for token refresh
├── middleware.ts           # Next.js middleware (token refresh + route protection)
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── logout/route.ts
│   └── (protected)/
│       └── layout.tsx      # Wraps all authenticated routes
└── types/
    └── supabase.ts         # Generated types from Supabase CLI
```

### Pattern 1: Cookie-Based SSR Authentication

**What:** Use `@supabase/ssr` with cookies instead of localStorage for session storage.

**When to use:** Always in Next.js App Router. Required for Server Components and SSR.

**Why:** Server Components cannot access localStorage. Cookies are sent with every request, enabling server-side auth validation.

**Example:**
```typescript
// src/lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )
}
```

```typescript
// src/lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from Server Component - ignore
          }
        },
      },
    }
  )
}
```

### Pattern 2: Middleware Token Refresh

**What:** Next.js middleware intercepts all requests to refresh expired tokens.

**When to use:** Always. Server Components cannot write cookies, so middleware must handle token refresh.

**Example:**
```typescript
// src/middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: Use getUser() not getSession() for security
  const { data: { user } } = await supabase.auth.getUser()

  // Redirect unauthenticated users to login
  if (!user && !request.nextUrl.pathname.startsWith('/login')) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

### Pattern 3: Custom Access Token Hook for Role Injection

**What:** PostgreSQL function that runs before JWT issuance, adding role to claims.

**When to use:** When you need role-based RLS policies that check JWT claims.

**Example:**
```sql
-- Create user_roles table
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('admin', 'medico', 'enfermera', 'secretaria')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Only admins can manage roles (no self-service)
CREATE POLICY "Admins can manage roles" ON public.user_roles
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = (SELECT auth.uid())
        AND role = 'admin'
    )
);

-- Custom Access Token Hook function
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    claims jsonb;
    user_role text;
BEGIN
    -- Get user's role from user_roles table
    SELECT role INTO user_role
    FROM public.user_roles
    WHERE user_id = (event->>'user_id')::uuid;

    -- Get existing claims
    claims := event->'claims';

    -- Add role to app_metadata in claims
    IF user_role IS NOT NULL THEN
        claims := jsonb_set(
            claims,
            '{app_metadata, role}',
            to_jsonb(user_role)
        );
    ELSE
        claims := jsonb_set(
            claims,
            '{app_metadata, role}',
            '"none"'::jsonb
        );
    END IF;

    -- Return modified event
    RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

-- Grant execute to supabase_auth_admin
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;

-- Revoke from public for security
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM anon;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated;
```

**Configuration (supabase/config.toml for local dev):**
```toml
[auth.hook.custom_access_token]
enabled = true
uri = "pg-functions://postgres/public/custom_access_token_hook"
```

### Pattern 4: RLS Policies with Role Checking

**What:** RLS policies that read role from JWT app_metadata.

**When to use:** For all protected tables. Use helper function for performance.

**Example:**
```sql
-- Helper function (SECURITY DEFINER to avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        (SELECT auth.jwt() -> 'app_metadata' ->> 'role'),
        'none'
    )
$$;

-- Example RLS policy using role
CREATE POLICY "Admin and Secretaria can insert patients"
ON public.patients FOR INSERT
TO authenticated
WITH CHECK (
    get_user_role() IN ('admin', 'secretaria')
);

CREATE POLICY "All authenticated users can read patients"
ON public.patients FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admin and Medico can update patients"
ON public.patients FOR UPDATE
TO authenticated
USING (get_user_role() IN ('admin', 'medico'))
WITH CHECK (get_user_role() IN ('admin', 'medico'));
```

### Pattern 5: Immutable Audit Log with Request Context

**What:** Custom audit trigger that captures old/new data, user, timestamp, IP, and user-agent.

**When to use:** For all tables in the AUDITED zone (patients, appointments, medical records).

**Example:**
```sql
-- Helper functions to access PostgREST headers
CREATE OR REPLACE FUNCTION public.get_request_header(header_name text)
RETURNS text
LANGUAGE sql
STABLE
AS $$
    SELECT current_setting('request.headers', true)::json ->> header_name
$$;

CREATE OR REPLACE FUNCTION public.get_client_ip()
RETURNS inet
LANGUAGE sql
STABLE
AS $$
    SELECT NULLIF(
        SPLIT_PART(COALESCE(get_request_header('x-forwarded-for'), ''), ',', 1),
        ''
    )::inet
$$;

-- Audit log table
CREATE TABLE public.audit_log (
    id BIGSERIAL PRIMARY KEY,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    old_data JSONB,
    new_data JSONB,
    changed_by UUID REFERENCES auth.users(id),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    client_ip INET,
    user_agent TEXT
);

-- Indexes for common queries
CREATE INDEX idx_audit_log_table_record ON public.audit_log(table_name, record_id);
CREATE INDEX idx_audit_log_changed_by ON public.audit_log(changed_by);
CREATE INDEX idx_audit_log_changed_at ON public.audit_log(changed_at);

-- Enable RLS - INSERT only (append-only), admin SELECT only
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Allow inserts from triggers (which run as SECURITY DEFINER)
CREATE POLICY "Allow trigger inserts" ON public.audit_log
FOR INSERT
WITH CHECK (true);

-- Only admins can read audit log
CREATE POLICY "Admins can read audit log" ON public.audit_log
FOR SELECT
TO authenticated
USING (get_user_role() = 'admin');

-- NO UPDATE or DELETE policies = immutable

-- Trigger function
CREATE OR REPLACE FUNCTION public.audit_trigger_func()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    record_pk text;
BEGIN
    -- Get primary key value (assumes 'id' column exists)
    IF TG_OP = 'DELETE' THEN
        record_pk := OLD.id::text;
    ELSE
        record_pk := NEW.id::text;
    END IF;

    INSERT INTO public.audit_log (
        table_name,
        record_id,
        action,
        old_data,
        new_data,
        changed_by,
        client_ip,
        user_agent
    ) VALUES (
        TG_TABLE_NAME,
        record_pk,
        TG_OP,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
        auth.uid(),
        get_client_ip(),
        get_request_header('user-agent')
    );

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

-- Apply trigger to a table
CREATE TRIGGER tr_audit_patients
    AFTER INSERT OR UPDATE OR DELETE ON public.patients
    FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();
```

### Anti-Patterns to Avoid

- **Using user_metadata for roles:** Users can modify their own user_metadata via `supabase.auth.update()`, enabling privilege escalation. Always use app_metadata (server-only) or a separate table with strict RLS.

- **Trusting getSession() on server:** `getSession()` reads from cookies without validating the JWT signature. Always use `getUser()` for server-side auth checks as it revalidates with Supabase Auth.

- **RLS policies without (SELECT auth.uid()):** Wrapping `auth.uid()` in a SELECT allows PostgreSQL to cache the result per statement, improving performance by 94%+ in benchmarks.

- **Forgetting the TO clause in policies:** Omitting `TO authenticated` or `TO anon` causes unnecessary policy evaluation overhead.

- **Using service_role key in client code:** Service role bypasses all RLS. Only use in Server Actions/API routes, never in browser bundles.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT parsing/validation | Manual JWT decode | `auth.jwt()` in RLS, `getUser()` in middleware | Supabase handles signature verification |
| Session refresh | Manual token refresh logic | `@supabase/ssr` middleware | Built-in, handles edge cases |
| Password hashing | bcrypt implementation | Supabase Auth | Proper salting, timing-attack resistant |
| Role permission matrix | If-else chains in code | RLS policies | Database-enforced, cannot be bypassed |
| Request header extraction | Custom API middleware | `current_setting('request.headers')` | PostgREST provides this automatically |

**Key insight:** Supabase provides primitives (RLS, auth hooks, PostgREST headers) that handle security-critical operations. Custom solutions add attack surface and maintenance burden.

## Common Pitfalls

### Pitfall 1: RLS Not Enabled on All Tables

**What goes wrong:** Tables created in Supabase have RLS disabled by default. CVE-2025-48757 affected 170+ applications due to this.

**Why it happens:** RLS is opt-in. Developers enable on "sensitive" tables but forget supporting tables.

**How to avoid:**
1. Add `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` to every table migration
2. Run Supabase Security Advisor before every deployment (checks for 0013: RLS disabled in public)
3. Create a migration checklist enforced in PR reviews

**Warning signs:** Any table query works without authentication during testing.

### Pitfall 2: Custom Access Token Hook Not Triggering

**What goes wrong:** Role not appearing in JWT after configuring hook.

**Why it happens:**
- Hook not configured in dashboard (or config.toml for local)
- Function has wrong permissions (needs `supabase_auth_admin` execute grant)
- Function raises error (check postgres logs)
- User needs to re-login to get new token

**How to avoid:**
1. Test hook with `supabase.auth.signOut()` then `signIn()` to force new token
2. Decode JWT at https://jwt.io to verify claims
3. Check Supabase logs for hook errors

**Warning signs:** `auth.jwt() -> 'app_metadata' ->> 'role'` returns NULL in RLS policies.

### Pitfall 3: Middleware Not Refreshing Tokens

**What goes wrong:** Users get logged out unexpectedly, especially on first request after token expiry.

**Why it happens:**
- Middleware not calling `getUser()` (which triggers refresh)
- Cookie changes not being passed to response
- Matcher pattern excluding routes

**How to avoid:**
1. Follow exact pattern from Supabase docs for middleware
2. Always call `getUser()` in middleware
3. Ensure matcher includes all protected routes

**Warning signs:** Users report being logged out after ~1 hour (default access token expiry).

### Pitfall 4: Audit Log Missing Request Context

**What goes wrong:** `client_ip` and `user_agent` are NULL in audit logs.

**Why it happens:**
- `current_setting('request.headers')` only works when request comes through PostgREST/Supabase API
- Direct database connections (Supabase dashboard, migrations) don't have headers
- Headers might be stripped by proxy/CDN

**How to avoid:**
1. Accept that admin actions via dashboard won't have IP (document this)
2. Use COALESCE to handle NULL gracefully
3. Consider logging "source: api|dashboard|migration" based on header presence

**Warning signs:** All IP/user-agent values are NULL.

### Pitfall 5: Views Bypass RLS

**What goes wrong:** Database views expose data that should be restricted.

**Why it happens:** PostgreSQL views run with creator's permissions by default (SECURITY DEFINER semantics).

**How to avoid:**
```sql
CREATE VIEW daily_summary
WITH (security_invoker = true)  -- PostgreSQL 15+
AS SELECT ...;
```

**Warning signs:** Reports showing data user shouldn't have access to.

## Code Examples

### Complete Sign-In Flow

```typescript
// src/app/(auth)/login/actions.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function signIn(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return { error: error.message }
  }

  redirect('/dashboard')
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
```

### Getting User Role in Server Component

```typescript
// src/app/(protected)/dashboard/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Get role from app_metadata (injected by Custom Access Token Hook)
  const role = user.app_metadata?.role ?? 'none'

  return (
    <div>
      <h1>Dashboard</h1>
      <p>Role: {role}</p>
      {role === 'admin' && <AdminPanel />}
    </div>
  )
}
```

### RLS Policy Permission Matrix

```sql
-- Implement the 4-role permission matrix from requirements
-- Admin: Full access
-- Medico: CRUD patients, medical records
-- Enfermera: Read patients, limited updates
-- Secretaria: CRUD patients (no medical), payments

-- Example for patients table
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All roles can read patients"
ON public.patients FOR SELECT
TO authenticated
USING (get_user_role() != 'none');

CREATE POLICY "Admin, Medico, Secretaria can insert patients"
ON public.patients FOR INSERT
TO authenticated
WITH CHECK (get_user_role() IN ('admin', 'medico', 'secretaria'));

CREATE POLICY "Admin, Medico, Secretaria can update patients"
ON public.patients FOR UPDATE
TO authenticated
USING (get_user_role() IN ('admin', 'medico', 'secretaria'))
WITH CHECK (get_user_role() IN ('admin', 'medico', 'secretaria'));

CREATE POLICY "Only Admin can delete patients"
ON public.patients FOR DELETE
TO authenticated
USING (get_user_role() = 'admin');
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| @supabase/auth-helpers-nextjs | @supabase/ssr | 2024 | Single package for all SSR frameworks |
| localStorage for tokens | Cookie-based sessions | 2024 | Required for Server Components |
| anon key (legacy name) | publishable key | 2025 | Same functionality, clearer naming |
| Separate user_roles table query | Custom Access Token Hook | 2024 | Role in JWT, no extra DB query |

**Deprecated/outdated:**
- `@supabase/auth-helpers-nextjs`: Replaced by `@supabase/ssr`
- `getSession()` for server-side auth: Use `getUser()` instead (validates JWT)
- Storing role in user_metadata: Insecure, use app_metadata via hook

## Open Questions

1. **Session timeout for tablets**
   - What we know: Supabase access tokens expire in 1 hour by default, refresh tokens in 7 days
   - What's unclear: Whether we need shorter session for shared tablets (security vs UX tradeoff)
   - Recommendation: Start with defaults, add re-auth for sensitive actions (void payment) in Phase 4

2. **Audit log storage growth**
   - What we know: JSONB snapshots of every change can grow large
   - What's unclear: Estimated growth rate for this clinic (50-100 patients/day)
   - Recommendation: Add partition by month, consider archival strategy for Phase 5+

3. **Hook execution during high load**
   - What we know: Custom Access Token Hook runs on every sign-in and token refresh
   - What's unclear: Performance impact under load
   - Recommendation: Keep hook query simple (single indexed lookup), monitor in production

## Sources

### Primary (HIGH confidence)

- [Supabase Auth Server-Side Rendering](https://supabase.com/docs/guides/auth/server-side/nextjs) - Complete Next.js App Router setup
- [Custom Access Token Hook](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook) - Role injection into JWT
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) - RLS policy patterns
- [Custom Claims & RBAC](https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac) - Role-based access patterns
- [Performance and Security Advisors](https://supabase.com/docs/guides/database/database-advisors) - RLS verification

### Secondary (MEDIUM confidence)

- [Supabase Blog: Postgres Auditing](https://supabase.com/blog/postgres-audit) - Audit table design patterns
- [PostgREST Header Hacking](https://github.com/burggraf/postgrest-header-hacking) - Accessing IP and headers in triggers
- [JWT Token Management with Supabase](https://github.com/devpayoub/JWT-Token-Management-with-Supabase) - Next.js 15 patterns

### Tertiary (LOW confidence)

- [CVE-2025-48757 Analysis](https://byteiota.com/supabase-security-flaw-170-apps-exposed-by-missing-rls/) - RLS misconfiguration case study

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Official Supabase packages, documented patterns
- Architecture: HIGH - Patterns from official docs and verified examples
- Pitfalls: HIGH - Based on documented CVE and official security advisories
- Audit logging: MEDIUM - Custom implementation, not using supa_audit extension (for more control)

**Research date:** 2026-01-23
**Valid until:** 2026-02-23 (30 days - stable Supabase patterns)

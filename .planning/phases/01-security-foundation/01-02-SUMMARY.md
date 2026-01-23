---
phase: 01-security-foundation
plan: 02
subsystem: database
tags: [supabase, rls, jwt, postgresql, audit, rbac]

# Dependency graph
requires: []
provides:
  - user_roles table with RLS for role management
  - audit_log table with append-only immutability
  - get_user_role() function for RLS policies
  - custom_access_token_hook for JWT role injection
  - audit_trigger_func() for capturing changes on any table
affects: [02-core-clinical, 03-payments, 04-medical-records]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - RLS append-only pattern for immutable audit logs
    - Custom Access Token Hook for JWT role injection
    - SECURITY DEFINER functions with SET search_path

key-files:
  created:
    - supabase/migrations/001_user_roles.sql
    - supabase/migrations/002_audit_infrastructure.sql
    - supabase/migrations/003_custom_access_token_hook.sql
  modified: []

key-decisions:
  - "Use enum type for user_role instead of CHECK constraint for type safety"
  - "Store role in app_metadata (not user_metadata) to prevent privilege escalation"
  - "Wrap auth.uid() in SELECT for PostgreSQL statement caching optimization"
  - "No UPDATE/DELETE policies on audit_log = database-enforced immutability"

patterns-established:
  - "RLS append-only pattern: INSERT policy only, no UPDATE/DELETE"
  - "get_user_role() as single source of truth for role checks in RLS"
  - "audit_trigger_func() for universal audit capture on any table"

# Metrics
duration: 2min
completed: 2026-01-23
---

# Phase 1 Plan 2: RBAC Database Schema Summary

**PostgreSQL RBAC foundation with user_roles table, immutable audit_log, and custom_access_token_hook for JWT role injection**

## Performance

- **Duration:** 2 min
- **Started:** 2026-01-23T19:47:50Z
- **Completed:** 2026-01-23T19:50:02Z
- **Tasks:** 3
- **Files created:** 3

## Accomplishments

- Created user_roles table with 4-role enum (admin, medico, enfermera, secretaria)
- Created audit_log table with append-only RLS pattern (immutable by design)
- Created custom_access_token_hook to inject role into JWT app_metadata
- Established get_user_role() function for consistent role checks in RLS policies
- Created reusable audit_trigger_func() for capturing changes on any table

## Task Commits

Each task was committed atomically:

1. **Task 1: Create user_roles table and get_user_role helper** - `4ac256e` (feat)
2. **Task 2: Create audit log infrastructure** - `bbd1b3b` (feat)
3. **Task 3: Create custom access token hook** - `88507c9` (feat)

## Files Created

- `supabase/migrations/001_user_roles.sql` - User roles table, RLS policies, get_user_role() function
- `supabase/migrations/002_audit_infrastructure.sql` - Audit log table, append-only RLS, trigger function
- `supabase/migrations/003_custom_access_token_hook.sql` - JWT role injection hook

## Decisions Made

1. **Enum type for roles**: Used PostgreSQL ENUM instead of TEXT with CHECK constraint for compile-time type safety
2. **app_metadata for roles**: Critical security decision - user_metadata can be modified by users, app_metadata is server-only
3. **Append-only audit pattern**: No UPDATE/DELETE policies on audit_log - immutability enforced at RLS level
4. **SECURITY DEFINER with SET search_path**: Security best practice for functions accessing multiple schemas

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all migrations created successfully.

## User Setup Required

**External services require manual configuration.** The following must be done in Supabase Dashboard:

1. **Enable Custom Access Token Hook:**
   - Go to: Supabase Dashboard -> Authentication -> Hooks
   - Find: "Customize Access Token (JWT) Claims"
   - Enable: Toggle ON
   - Set Postgres function: `public.custom_access_token_hook`
   - Save changes

2. **Bootstrap first admin user:**
   - After applying migrations, run in SQL editor:
   ```sql
   INSERT INTO public.user_roles (user_id, role)
   VALUES ('uuid-of-first-admin-user', 'admin');
   ```

3. **For local development (supabase/config.toml):**
   ```toml
   [auth.hook.custom_access_token]
   enabled = true
   uri = "pg-functions://postgres/public/custom_access_token_hook"
   ```

**Verification:** After signing in, decode JWT at https://jwt.io and verify `app_metadata.role` is present.

## Next Phase Readiness

**Ready for:**
- Plan 01-03: Supabase client setup with @supabase/ssr
- All future phases can use get_user_role() in RLS policies
- audit_trigger_func() ready to attach to business tables (patients, appointments, payments)

**Blockers:** None

**Note:** Migrations need to be applied to Supabase before proceeding with auth client setup.

---
*Phase: 01-security-foundation*
*Completed: 2026-01-23*

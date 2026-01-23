# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-23)

**Core value:** Pagos inmutables con evidencia obligatoria — hacer el fraude imposible
**Current focus:** Phase 3 - Appointments

## Current Position

Phase: 3 of 9 (Appointments)
Plan: 3 of 7 complete in current phase
Status: In progress
Last activity: 2026-01-23 — Completed 03-02-PLAN.md (TypeScript types and state machine)

Progress: [████████████░░░░░░░░] ~59%

## Performance Metrics

**Velocity:**
- Total plans completed: 14
- Average duration: 5 min
- Total execution time: 64 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-security-foundation | 4 | 27 min | 7 min |
| 02-patients | 7 | 27 min | 4 min |
| 03-appointments | 3 | 10 min | 3 min |

**Recent Trend:**
- Last 5 plans: 02-06 (4 min), 02-07 (3 min), 03-01 (5 min), 03-03 (2 min), 03-02 (3 min)
- Trend: Consistent ~3-5 min for focused implementation tasks

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Security/audit foundation must be Phase 1 per research recommendations (RLS misconfig is #1 Supabase vulnerability)
- [Roadmap]: Payments before Medical Records because anti-fraud is core value
- [Roadmap]: Voice dictation deferred to Phase 7 due to high complexity and independence
- [Roadmap]: Notifications last phase (external integrations, not core to anti-fraud mission)
- [01-01]: Used Database generic type in all Supabase clients for compile-time type safety
- [01-01]: Added isValidRole type guard for runtime role validation
- [01-02]: Use enum type for user_role instead of CHECK constraint for type safety
- [01-02]: Store role in app_metadata (not user_metadata) to prevent privilege escalation
- [01-02]: No UPDATE/DELETE policies on audit_log = database-enforced immutability
- [01-04]: Use tr_audit_{tablename} naming convention for audit triggers
- [01-04]: bootstrap_first_admin() allows first-time setup without SQL access
- [01-03]: Use getUser() not getSession() for secure JWT validation in middleware
- [01-03]: Role read from app_metadata for security (set by access token hook)
- [01-03]: Spanish UI with route groups: (auth) for login, (protected) for dashboard
- [02-01]: Use shadcn/ui with Tailwind CSS v4 for component library
- [02-01]: Form validation pattern: zod schema + react-hook-form + @hookform/resolvers
- [02-02]: cedula omitted from TypeScript Update type for compile-time immutability
- [02-02]: All staff roles can INSERT/UPDATE patients, only admin can DELETE
- [02-02]: Emergency contact fields are required (NOT NULL)
- [02-03]: All validation messages in Spanish for Colombian users
- [02-03]: patientUpdateSchema.omit({ cedula: true }) for Zod-level immutability
- [02-03]: ILIKE with .or() for multi-field patient search
- [02-04]: ActionState type includes errors Record for field-level error display
- [02-04]: Empty strings converted to null before database insert/update
- [02-04]: Server action signature: (prevState, formData) for useActionState compatibility
- [02-05]: 300ms debounce for search balances responsiveness vs server load
- [02-05]: URL params for search enables shareable/bookmarkable searches
- [02-05]: Spanish locale (es-CO) for date formatting in tables
- [02-06]: Edit page shows cedula in header with immutability notice
- [02-06]: Breadcrumb includes patient name link to detail page
- [02-06]: Null database values converted to empty strings for form compatibility
- [02-07]: Timeline supports future event types (payment, appointment, procedure) via type union
- [02-07]: Empty state placeholder mentions future features for user awareness
- [02-07]: Parallel fetching via Promise.all for patient + timeline data
- [03-01]: Used btree_gist extension for EXCLUDE USING gist constraint
- [03-01]: appointment_status enum with 7 states matches workflow requirements
- [03-01]: Exclusion constraint only applies to active appointments (not cancelada/no_asistio)
- [03-01]: RLS policies use EXISTS subquery against user_roles table
- [03-02]: APPOINTMENT_STATES as const array for runtime and compile-time type safety
- [03-02]: State machine allows reversion and cancellation from any state
- [03-02]: STATUS_HEX_COLORS provides FullCalendar-compatible color values
- [03-02]: Zod v4 syntax uses error: instead of errorMap: for enum error messages
- [03-03]: doctors_view uses SECURITY DEFINER to access auth.users without service role
- [03-03]: STATUS_COLORS mapping for FullCalendar event styling by appointment state
- [03-03]: CalendarEvent transformation pattern with extendedProps for metadata

### Pending Todos

- [ ] Enable Custom Access Token Hook in Supabase Dashboard after migrations applied
- [ ] Bootstrap first admin user via `SELECT public.bootstrap_first_admin();`
- [ ] Create test user in Supabase Auth to verify login flow
- [ ] Apply 007_appointments.sql migration to Supabase

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-01-23T23:00:55Z
Stopped at: Completed 03-02-PLAN.md (TypeScript types and state machine)
Resume file: None

---
*Phase 3 (Appointments) in progress. Plans 01-03 complete. Next: 03-04 (Server actions)*

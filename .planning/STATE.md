# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-23)

**Core value:** Pagos inmutables con evidencia obligatoria — hacer el fraude imposible
**Current focus:** Phase 3 - Appointments

## Current Position

Phase: 3 of 9 (Appointments)
Plan: 1 of 7 complete in current phase
Status: In progress
Last activity: 2026-01-23 — Completed 03-01-PLAN.md (FullCalendar + appointments table)

Progress: [██████████░░░░░░░░░░] ~55%

## Performance Metrics

**Velocity:**
- Total plans completed: 12
- Average duration: 5 min
- Total execution time: 59 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-security-foundation | 4 | 27 min | 7 min |
| 02-patients | 7 | 27 min | 4 min |
| 03-appointments | 1 | 5 min | 5 min |

**Recent Trend:**
- Last 5 plans: 02-04 (4 min), 02-05 (4 min), 02-06 (4 min), 02-07 (3 min), 03-01 (5 min)
- Trend: Consistent ~4-5 min for focused implementation tasks

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

### Pending Todos

- [ ] Enable Custom Access Token Hook in Supabase Dashboard after migrations applied
- [ ] Bootstrap first admin user via `SELECT public.bootstrap_first_admin();`
- [ ] Create test user in Supabase Auth to verify login flow
- [ ] Apply 007_appointments.sql migration to Supabase

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-01-23T22:55:35Z
Stopped at: Completed 03-01-PLAN.md (FullCalendar + appointments table)
Resume file: None

---
*Phase 3 (Appointments) in progress. Next: 03-02 (TypeScript types and queries)*

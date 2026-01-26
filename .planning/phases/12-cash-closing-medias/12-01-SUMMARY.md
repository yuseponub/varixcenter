---
phase: 12-cash-closing-medias
plan: 01
subsystem: database
tags: [postgres, supabase, triggers, rls, cash-closing, medias]

# Dependency graph
requires:
  - phase: 15-cash_closings
    provides: cierre_estado ENUM type
  - phase: 11-sales-core
    provides: medias_sales table for lockdown trigger
provides:
  - medias_cierre_counter table with CIM prefix
  - medias_cierres table with zero-tolerance constraint
  - Immutability trigger for closing records
  - Sales lockdown trigger on medias_sales
  - RLS policies for role-based access
affects: [12-02-PLAN, 12-03-PLAN, 12-04-PLAN, 12-05-PLAN, 12-06-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Single-row counter table with gapless numbering
    - FOR UPDATE row locking for race condition prevention
    - Zero-tolerance constraint (differs from clinic threshold)

key-files:
  created:
    - supabase/migrations/024_medias_cierres.sql
  modified: []

key-decisions:
  - "CIM prefix for medias cierre independence from clinic CIE prefix"
  - "Zero tolerance: ANY difference requires justification (no $10k threshold)"
  - "Reuses cierre_estado ENUM from clinic migration 015"

patterns-established:
  - "Pattern: medias_cierre_counter with single-row protection trigger"
  - "Pattern: medias_cierres immutability trigger (blocks DELETE, restricts UPDATE)"
  - "Pattern: Sales lockdown via BEFORE INSERT trigger on medias_sales"

# Metrics
duration: 3min
completed: 2026-01-26
---

# Phase 12 Plan 01: Database Schema Summary

**Medias cash closing schema with CIM-prefixed counter, zero-tolerance constraint, and sales lockdown trigger**

## Performance

- **Duration:** 3 min
- **Started:** 2026-01-26T13:26:17Z
- **Completed:** 2026-01-26T13:29:30Z
- **Tasks:** 3
- **Files modified:** 1

## Accomplishments
- Created medias_cierre_counter table with CIM prefix (independent from clinic CIE)
- Created medias_cierres table with zero-tolerance cash difference constraint
- Implemented immutability trigger blocking DELETE and restricting UPDATE to estado transitions
- Added sales lockdown trigger preventing medias_sales on closed days
- Enabled RLS with role-based policies (secretaria/admin create, admin update)

## Task Commits

All three tasks in single atomic migration commit:

1. **Task 1: Create medias_cierre_counter table and protection trigger** - `c8ea53c` (feat)
2. **Task 2: Create medias_cierres table with zero-tolerance constraint** - `c8ea53c` (feat)
3. **Task 3: Create immutability trigger and sales lockdown trigger with RLS** - `c8ea53c` (feat)

_Note: Single migration file commits all database objects atomically_

## Files Created/Modified
- `supabase/migrations/024_medias_cierres.sql` - Complete medias cash closing schema with counter, table, triggers, and RLS

## Decisions Made
- Used CIM prefix (Cierre Inventario Medias) per CIE-08 requirement for independence from clinic's CIE prefix
- Zero-tolerance constraint: `diferencia = 0 OR justificacion` differs from clinic's `ABS(diferencia) <= 10000` threshold
- Reused cierre_estado ENUM from 015_cash_closings.sql to avoid duplicate type definitions
- Lockdown trigger blocks medias_sales (not payments) per CIE-08 independence requirement

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Database schema complete, ready for types/validations (12-02)
- cierre_estado ENUM reused successfully from clinic migration
- Sales lockdown trigger ready to test once medias_sales has data
- RLS policies ready for secretaria/admin role testing

---
*Phase: 12-cash-closing-medias*
*Completed: 2026-01-26*

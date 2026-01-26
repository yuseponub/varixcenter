---
phase: 14-returns-workflow
plan: 04
subsystem: database, api
tags: [supabase, rpc, cierre, returns, efectivo_neto, server-actions]

# Dependency graph
requires:
  - phase: 14-02
    provides: medias_returns_rpc functions (create, approve, reject)
  - phase: 14-03
    provides: MediasReturn types and Zod validation schemas
  - phase: 12-02
    provides: get_medias_cierre_summary, create_medias_cierre RPC functions
provides:
  - Cierre summary with efectivo_neto (efectivo - devoluciones)
  - Return count included in cierre summary
  - Query functions for returns (getReturns, getReturnById, etc.)
  - Server actions for return lifecycle (createReturn, approveReturn, rejectReturn)
affects: [14-05, 14-returns-workflow]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - efectivo_neto calculation pattern for cierre reconciliation
    - Approval date (aprobado_at) used for cierre attribution, not created_at

key-files:
  created:
    - supabase/migrations/035_medias_cierre_refunds.sql
    - src/lib/queries/medias/returns.ts
    - src/app/(protected)/medias/devoluciones/actions.ts

key-decisions:
  - "Cash refunds tracked by aprobado_at (approval date) for correct cierre attribution"
  - "efectivo_neto = total_efectivo - total_devoluciones_efectivo for reconciliation"
  - "return_count includes all approved returns (not just efectivo)"

patterns-established:
  - "efectivo_neto pattern: subtract cash refunds from efectivo before comparing to conteo"
  - "Server actions follow ventas/actions.ts pattern with Zod validation and Spanish errors"
  - "Query functions use (supabase as any) for untyped medias tables"

# Metrics
duration: 4min
completed: 2026-01-26
---

# Phase 14 Plan 04: Cierre Integration and Data Access Summary

**Updated cierre RPC to subtract cash refunds (efectivo_neto), created query functions for returns, and server actions for return lifecycle operations**

## Performance

- **Duration:** 4 min
- **Started:** 2026-01-26T17:30:00Z
- **Completed:** 2026-01-26T17:34:00Z
- **Tasks:** 3
- **Files created:** 3

## Accomplishments

- get_medias_cierre_summary now returns efectivo_neto (efectivo minus cash refunds)
- create_medias_cierre compares conteo_fisico against efectivo_neto for zero-tolerance check
- Query functions for returns with filtering by estado, sale_id, and date range
- Server actions wrap RPC calls with Zod validation and Spanish error messages

## Task Commits

Each task was committed atomically:

1. **Task 1: Update get_medias_cierre_summary to subtract cash refunds** - `b28b356` (feat)
2. **Task 2: Create query functions for returns** - `7deb144` (feat)
3. **Task 3: Create server actions for returns** - `f38d150` (feat)

## Files Created

- `supabase/migrations/035_medias_cierre_refunds.sql` - Updates cierre RPC functions with cash refund deduction
- `src/lib/queries/medias/returns.ts` - Query functions: getReturns, getReturnById, getReturnsBySale, getPendingReturnsCount, getReturnableQuantity
- `src/app/(protected)/medias/devoluciones/actions.ts` - Server actions: createReturn, approveReturn, rejectReturn

## Decisions Made

1. **aprobado_at for cierre attribution**: Cash refunds affect the cierre of the day they were APPROVED, not the day they were requested. This ensures accurate daily reconciliation.

2. **efectivo_neto calculation**: `efectivo_neto = total_efectivo - total_devoluciones_efectivo`. The cierre now compares conteo_fisico against efectivo_neto, not raw total_efectivo.

3. **return_count includes all methods**: The return_count in cierre summary counts all approved returns (efectivo + cambio_producto), not just cash refunds.

4. **Query functions include getReturnsCountByEstado**: Added bonus function for stats/badges that wasn't in the original plan but follows natural data access pattern.

## Deviations from Plan

### Auto-added Issues

**1. [Rule 2 - Missing Critical] Added getReturnsCountByEstado query**
- **Found during:** Task 2 (Query functions)
- **Issue:** Stats/badges would need return counts by estado, not covered in plan
- **Fix:** Added getReturnsCountByEstado() function returning Record<DevolucionEstado, number>
- **Files modified:** src/lib/queries/medias/returns.ts
- **Verification:** Function exports correctly, types match
- **Committed in:** 7deb144 (Task 2 commit)

---

**Total deviations:** 1 auto-added (1 missing critical)
**Impact on plan:** Minor addition for dashboard/badge functionality. No scope creep.

## Issues Encountered

None - plan executed smoothly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Cierre integration complete - cash refunds properly deducted from efectivo
- Query and action layer ready for UI components
- Ready for 14-05: Returns UI pages (list, form, approval workflow)

---
*Phase: 14-returns-workflow*
*Completed: 2026-01-26*

---
phase: 11-sales-core
plan: 03
subsystem: database
tags: [postgres, rpc, stock-management, atomic-transactions, row-locking]

# Dependency graph
requires:
  - phase: 11-01
    provides: Sales tables (medias_sales, medias_sale_items, medias_sale_methods)
  - phase: 10-01
    provides: Product catalog (medias_products) and stock movement ledger (medias_stock_movements)
provides:
  - Atomic sale creation RPC (create_medias_sale)
  - Race-condition-proof stock decrement
  - Stock movement logging with before/after snapshots
affects: [11-05, 11-06, 11-07, 11-08, 12-returns, 15-medias-cash-closing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "FOR UPDATE row locking for concurrent stock operations"
    - "Two-pass validation (validate all, then execute all)"
    - "JSONB parameters for complex data structures"

key-files:
  created:
    - supabase/migrations/023_create_medias_sale_rpc.sql
  modified: []

key-decisions:
  - "Two-pass validation ensures no partial sales on stock failure"
  - "FOR UPDATE lock acquired twice per product (validate pass + execute pass) within same transaction"
  - "No discounts in medias sales (v_total := v_subtotal directly)"

patterns-established:
  - "Stock decrement with FOR UPDATE: SELECT FOR UPDATE then UPDATE in same transaction"
  - "Movement logging captures stock_normal_antes and stock_normal_despues for audit trail"

# Metrics
duration: 1min
completed: 2026-01-26
---

# Phase 11 Plan 03: Atomic Sale RPC Summary

**Atomic sale creation RPC with FOR UPDATE row locking, stock validation/decrement, and movement logging**

## Performance

- **Duration:** 1 min
- **Started:** 2026-01-26T02:09:54Z
- **Completed:** 2026-01-26T02:11:16Z
- **Tasks:** 1
- **Files created:** 1

## Accomplishments
- Created create_medias_sale() RPC function for atomic sale creation
- Implemented FOR UPDATE row locking to prevent race conditions on concurrent sales
- Stock validation blocks sale if any product has insufficient stock (VTA-12)
- Stock decrement happens atomically with sale creation (VTA-11)
- All stock movements logged with before/after snapshots (INV-06, INV-07)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create atomic sale RPC migration** - `04573ba` (feat)

## Files Created/Modified
- `supabase/migrations/023_create_medias_sale_rpc.sql` - Atomic sale creation RPC with stock management

## Decisions Made
- Two-pass validation pattern: First pass validates all products have sufficient stock (locking rows), second pass executes all operations. This ensures no partial sales.
- No discounts in medias sales: Total equals subtotal directly, simplifying the RPC.
- Payment methods total validation: RPC verifies sum of payment methods matches calculated total before creating sale.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- create_medias_sale RPC ready for frontend integration in plan 11-05
- Stock validation and decrement logic complete for sales flow
- Next plans (11-02, 11-05) can build sale UI using this RPC

---
*Phase: 11-sales-core*
*Completed: 2026-01-26*

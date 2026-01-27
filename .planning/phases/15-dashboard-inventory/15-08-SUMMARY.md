---
phase: 15-dashboard-inventory
plan: 08
subsystem: ui
tags: [react, alerts, stock, inventory, medias]

# Dependency graph
requires:
  - phase: 15-01
    provides: umbral_alerta column and create_inventory_adjustment RPC
  - phase: 15-03
    provides: getLowStockProducts query and dashboard queries
provides:
  - Stock alert indicators in products table
  - Alert banner on products page
  - Visual row highlighting for critical products
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Client-side critical product calculation from fetched data
    - Row-level styling based on business rules

key-files:
  created: []
  modified:
    - src/components/medias/products/products-table.tsx
    - src/app/(protected)/medias/productos/page.tsx
    - src/types/medias/products.ts

key-decisions:
  - "umbral_alerta added to MediasProduct interface (was missing despite DB column existing)"
  - "Client-side filtering for critical products (reuses fetched data, no extra query)"
  - "Alert banner shows up to 5 products with codigo, tipo, talla, stock count"
  - "Row styling uses bg-red-50 and border-l-4 border-l-red-500 for visual emphasis"

patterns-established:
  - "isLowStock check: product.activo && product.stock_normal < product.umbral_alerta"
  - "Memoized critical products calculation from already-fetched data"

# Metrics
duration: 4min
completed: 2026-01-27
---

# Phase 15 Plan 08: Products Stock Alerts Summary

**Stock alert indicators in products table with AlertTriangle icons, row highlighting, Umbral column, and alert banner showing critical products count**

## Performance

- **Duration:** 4 min
- **Started:** 2026-01-27T01:24:03Z
- **Completed:** 2026-01-27T01:27:33Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Products table shows AlertTriangle icon for low stock products (stock_normal < umbral_alerta)
- Rows with critical stock highlighted with red background and left border
- New Umbral column displays threshold value for each product
- Alert banner above table shows count and list of critical products

## Task Commits

Each task was committed atomically:

1. **Task 1: Update products table with alert indicators** - `04c9377` (feat)
2. **Task 2: Update products page with alerts summary** - `2612f4d` (feat)

## Files Created/Modified
- `src/types/medias/products.ts` - Added umbral_alerta field to MediasProduct interface
- `src/components/medias/products/products-table.tsx` - AlertTriangle icon, Umbral column, row styling
- `src/app/(protected)/medias/productos/page.tsx` - Critical stock alert banner

## Decisions Made
- Added umbral_alerta to MediasProduct interface (was missing from type but exists in DB since migration 036)
- Used client-side filtering for critical products calculation (products already fetched, no need for separate query)
- Alert banner limited to 5 products with "y X mas..." for overflow
- Consistent isLowStock check: only active products with stock_normal below threshold

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added umbral_alerta to MediasProduct type**
- **Found during:** Task 1 (Update products table)
- **Issue:** MediasProduct interface was missing umbral_alerta field despite column existing in database
- **Fix:** Added `umbral_alerta: number` to interface in products.ts
- **Files modified:** src/types/medias/products.ts
- **Verification:** TypeScript compiles, field accessible in table component
- **Committed in:** 04c9377 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential fix - type was incomplete. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Stock alerts visible in products page and table
- Ready for any remaining dashboard/inventory plans
- umbral_alerta field now properly typed for use across codebase

---
*Phase: 15-dashboard-inventory*
*Completed: 2026-01-27*

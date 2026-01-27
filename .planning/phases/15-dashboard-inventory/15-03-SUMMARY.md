---
phase: 15-dashboard-inventory
plan: 03
subsystem: database
tags: [supabase, queries, dashboard, stock-alerts, movements]

# Dependency graph
requires:
  - phase: 15-01
    provides: umbral_alerta column and create_inventory_adjustment RPC
  - phase: 15-02
    provides: DashboardMetrics, LowStockProduct, StockAlertsSummary types
  - phase: 11-sales-core
    provides: getSalesSummary function
  - phase: 14-returns
    provides: getPendingReturnsCount function
provides:
  - getDashboardMetrics for efectivo_en_caja from cierre RPC
  - getLowStockProducts filtering stock_normal < umbral_alerta
  - getStockAlertsSummary for dashboard display
  - getStockMovements with product, date, and type filters
  - getProductMovements for single product history
affects: [15-04, 15-05, 15-06] # Dashboard UI, adjustment form, movements page

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Column comparison client-side (Supabase PostgREST limitation)
    - Date range extraction for today/month

key-files:
  created:
    - src/lib/queries/medias/dashboard.ts
    - src/lib/queries/medias/movements.ts
  modified: []

key-decisions:
  - "Client-side filter for stock_normal < umbral_alerta (Supabase PostgREST doesn't support column comparison)"
  - "efectivo_en_caja from get_medias_cierre_summary RPC efectivo_neto"
  - "Reuse getSalesSummary and getPendingReturnsCount from existing queries"
  - "Movements include product relation (codigo, tipo, talla) for display"

patterns-established:
  - "Dashboard metrics pattern: aggregate from multiple RPC/queries in parallel"
  - "Stock movement query pattern: filter by product, type, date range"

# Metrics
duration: 2min
completed: 2026-01-27
---

# Phase 15 Plan 03: Dashboard and Movements Queries Summary

**Dashboard metrics from cierre RPC/sales/returns, low stock filtering on stock_normal < umbral_alerta, and movement history with product/date/type filters**

## Performance

- **Duration:** 2 min
- **Started:** 2026-01-27T01:11:31Z
- **Completed:** 2026-01-27T01:17:12Z
- **Tasks:** 2
- **Files created:** 2

## Accomplishments
- Created getDashboardMetrics aggregating efectivo from cierre, ventas from sales summary, and devoluciones from returns
- Created getLowStockProducts with client-side filter for stock_normal < umbral_alerta
- Created getStockMovements with product_id, tipo, from_date, and to_date filters
- Movements include product relation for display (codigo, tipo, talla)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create dashboard queries** - `6a1fa07` (feat)
2. **Task 2: Create movements query** - `e4b600e` (feat)

## Files Created/Modified
- `src/lib/queries/medias/dashboard.ts` - Dashboard metrics and low stock queries
- `src/lib/queries/medias/movements.ts` - Stock movement queries with filters

## Decisions Made
- **Client-side column comparison:** Supabase PostgREST doesn't support comparing two columns (stock_normal < umbral_alerta), so we fetch all active products and filter client-side
- **Reuse existing queries:** getSalesSummary and getPendingReturnsCount imported from sales.ts and returns.ts for code reuse

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Dashboard queries ready for UI integration (15-04)
- Movements query ready for movements page (15-05, 15-06)
- All query functions exported and typed for server component use

---
*Phase: 15-dashboard-inventory*
*Completed: 2026-01-27*

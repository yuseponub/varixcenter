---
phase: 15-dashboard-inventory
plan: 01
subsystem: database
tags: [postgresql, rpc, inventory, stock-alerts, security-definer]

# Dependency graph
requires:
  - phase: 10-medias-foundation
    provides: medias_products table with stock_normal/stock_devoluciones
  - phase: 10-medias-foundation
    provides: medias_stock_movements immutable ledger
provides:
  - umbral_alerta column for per-product stock alert thresholds
  - create_inventory_adjustment RPC for manual stock corrections
affects: [15-02, 15-03, 15-04, 15-05, 15-06] # Dashboard UI, queries, adjustment form, movements page

# Tech tracking
tech-stack:
  added: []
  patterns:
    - JWT app_metadata role check with user_roles fallback
    - Stock validation prevents negative on salida
    - Movement snapshots for before/after audit trail

key-files:
  created:
    - supabase/migrations/036_dashboard_inventory.sql
  modified: []

key-decisions:
  - "umbral_alerta default 3 applies to all 11 existing products automatically"
  - "RPC checks JWT app_metadata.user_role first, falls back to user_roles table"
  - "Adjustment RPC supports both stock_normal and stock_devoluciones modifications"
  - "Movement referencia_tipo = 'ajuste' for all manual adjustments"

patterns-established:
  - "Inventory adjustment pattern: lock product FOR UPDATE, validate, update stock, create movement"
  - "Dual role check: JWT app_metadata first, user_roles table fallback"

# Metrics
duration: 2min
completed: 2026-01-27
---

# Phase 15 Plan 01: Dashboard Inventory Migration Summary

**Per-product umbral_alerta column (default 3) and create_inventory_adjustment RPC with admin/medico role validation and immutable movement logging**

## Performance

- **Duration:** 2 min
- **Started:** 2026-01-27T01:07:43Z
- **Completed:** 2026-01-27T01:09:24Z
- **Tasks:** 1
- **Files created:** 1

## Accomplishments
- Added umbral_alerta INTEGER NOT NULL DEFAULT 3 to medias_products for configurable stock alerts
- Created create_inventory_adjustment RPC with admin/medico role validation via JWT app_metadata
- Stock validation prevents negative stock on salida operations
- Movement records include before/after snapshots for complete audit trail
- Supports both stock_normal and stock_devoluciones adjustments

## Task Commits

Each task was committed atomically:

1. **Task 1: Create migration for umbral_alerta and adjustment RPC** - `fcb180c` (feat)

## Files Created/Modified
- `supabase/migrations/036_dashboard_inventory.sql` - umbral_alerta column and create_inventory_adjustment RPC

## Decisions Made
- **JWT + fallback role check:** RPC checks `auth.jwt() -> 'app_metadata' ->> 'user_role'` first, falls back to user_roles table lookup for compatibility
- **Minimum 10 char reason:** p_razon requires at least 10 characters for meaningful audit trail
- **referencia_tipo = 'ajuste':** Distinguishes manual adjustments from other movement types in movement history

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- umbral_alerta column ready for dashboard queries (stock_normal < umbral_alerta)
- create_inventory_adjustment RPC ready for UI integration
- Ready for 15-02: Types, Validations, Queries

---
*Phase: 15-dashboard-inventory*
*Completed: 2026-01-27*

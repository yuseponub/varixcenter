---
phase: 11-sales-core
plan: 02
subsystem: database
tags: [postgres, triggers, rpc, immutability, stock-management]

# Dependency graph
requires:
  - phase: 11-01
    provides: medias_sales, medias_sale_items, medias_sale_methods tables
  - phase: 10-01
    provides: medias_products, medias_stock_movements tables
provides:
  - Sales immutability enforcement via triggers
  - Admin delete RPC with stock reversal
  - Audit trail for all sale operations
affects: [11-03, 11-05, 11-06, 12-returns]

# Tech tracking
tech-stack:
  added: []
  patterns: [trigger-based-immutability, rpc-for-privileged-operations, stock-reversal-pattern]

key-files:
  created:
    - supabase/migrations/022_medias_sales_immutability.sql
  modified: []

key-decisions:
  - "Sales cannot be UPDATEd at all (simpler than payments which allow estado transition)"
  - "Admin delete uses DISABLE/ENABLE TRIGGER pattern for controlled update"
  - "Stock reversal uses ajuste_entrada movement type with eliminacion_venta reference"

patterns-established:
  - "Immutability for child tables: items and methods also have immutability triggers"
  - "Stock reversal pattern: lock product FOR UPDATE, restore stock, log movement"

# Metrics
duration: 2min
completed: 2026-01-26
---

# Phase 11 Plan 02: Immutability Enforcement Summary

**Database triggers enforcing VTA-09 (immutability) and eliminar_medias_sale RPC for VTA-13 (admin delete with stock reversal)**

## Performance

- **Duration:** 2 min
- **Started:** 2026-01-26T02:10:14Z
- **Completed:** 2026-01-26T02:12:01Z
- **Tasks:** 1
- **Files created:** 1

## Accomplishments
- Sales, items, and methods tables fully immutable via BEFORE UPDATE/DELETE triggers
- Admin-only eliminar_medias_sale RPC validates role and justification
- Stock automatically reversed to stock_normal with full audit trail
- Audit trigger logs all sale operations

## Task Commits

Each task was committed atomically:

1. **Task 1: Create immutability enforcement migration** - `0ee84f4` (feat)

## Files Created/Modified
- `supabase/migrations/022_medias_sales_immutability.sql` - Immutability triggers and admin delete RPC

## Key Functions Created

### enforce_medias_sale_immutability()
- Blocks ALL UPDATE and DELETE on medias_sales
- Error message directs to eliminar_medias_sale RPC

### enforce_medias_sale_items_immutability()
- Blocks UPDATE and DELETE on medias_sale_items
- Protects product snapshots from modification

### enforce_medias_sale_methods_immutability()
- Blocks UPDATE and DELETE on medias_sale_methods
- Protects payment method records

### eliminar_medias_sale(p_sale_id, p_justificacion)
- SECURITY DEFINER function (bypasses RLS)
- Validates caller is admin
- Validates justificacion >= 10 characters
- For each item: locks product, restores stock_normal
- Logs stock movements with tipo='ajuste_entrada', referencia_tipo='eliminacion_venta'
- Temporarily disables immutability trigger to update sale estado

## Decisions Made
- Sales are fully immutable (no estado transition like payments) - simpler model since sales have no "anulacion by user" workflow
- Stock reversal goes to stock_normal (not stock_devoluciones) since cancelled sale items weren't actually returned by customer
- Justification minimum 10 chars matches payments pattern

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Immutability enforcement ready for use
- eliminar_medias_sale RPC ready for admin UI
- Ready for 11-03 (crear_medias_sale RPC) which will decrement stock on sale creation

---
*Phase: 11-sales-core*
*Completed: 2026-01-26*

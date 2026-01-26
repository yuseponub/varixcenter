---
phase: 14-returns-workflow
plan: 02
subsystem: database
tags: [postgres, rpc, plpgsql, returns, stock-management, security-definer]

# Dependency graph
requires:
  - phase: 14-01
    provides: medias_returns table, get_next_medias_return_number function, immutability trigger
  - phase: 10-01
    provides: medias_products table, medias_stock_movements table
  - phase: 11-01
    provides: medias_sales table, medias_sale_items table
provides:
  - create_medias_return RPC function with quantity validation
  - approve_medias_return RPC function with stock_devoluciones increment
  - reject_medias_return RPC function without stock change
  - Stock movement logging for approved returns (tipo='devolucion')
affects: [14-03, 14-04, 14-05, returns-ui, cash-closing-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Role validation via user_roles table lookup in RPC
    - Two-pass quantity validation (already returned calculation)
    - Stock update with FOR UPDATE row locking
    - Stock movement audit trail with before/after snapshots

key-files:
  created:
    - supabase/migrations/034_medias_returns_rpc.sql
  modified: []

key-decisions:
  - "Quantity validation counts pendiente + aprobada returns (rechazada excluded)"
  - "Approved returns increment stock_devoluciones, NOT stock_normal"
  - "Stock movement uses tipo='devolucion' and referencia_tipo='devolucion'"
  - "reject_medias_return does NOT create stock movement (no audit needed)"

patterns-established:
  - "Returns RPC pattern: create (any auth) -> approve/reject (admin/medico)"
  - "Already-returned calculation: SUM(cantidad) WHERE estado IN ('pendiente', 'aprobada')"

# Metrics
duration: 2min
completed: 2026-01-26
---

# Phase 14 Plan 02: Medias Returns RPC Summary

**SECURITY DEFINER RPC functions for return lifecycle: create with quantity validation, approve with stock_devoluciones increment, reject without stock change**

## Performance

- **Duration:** 2 min
- **Started:** 2026-01-26T23:30:19Z
- **Completed:** 2026-01-26T23:32:26Z
- **Tasks:** 3
- **Files created:** 1

## Accomplishments

- create_medias_return RPC validates quantity against (sale_item.quantity - already_returned)
- approve_medias_return increments stock_devoluciones (NOT stock_normal) per CONTEXT.md
- reject_medias_return changes estado to 'rechazada' without any stock modification
- All functions have GRANT EXECUTE to authenticated with internal role checks
- Stock movement audit trail with tipo='devolucion' for approved returns

## Task Commits

All tasks implemented in single migration file:

1. **Task 1: Create create_medias_return RPC function** - `47ef432` (feat)
2. **Task 2: Create approve_medias_return RPC function** - included in `47ef432`
3. **Task 3: Create reject_medias_return RPC function** - included in `47ef432`

## Files Created

- `supabase/migrations/034_medias_returns_rpc.sql` - Three SECURITY DEFINER RPC functions for return lifecycle (517 lines)

## Decisions Made

1. **Quantity validation includes pendiente returns**: The already_returned calculation counts both 'pendiente' and 'aprobada' states. This prevents over-returns even when multiple pending requests exist for the same sale item.

2. **Stock movement on approval only**: Only approve_medias_return creates a stock movement entry. Rejected returns don't affect inventory and thus don't need audit trail in stock_movements (the medias_returns table itself has audit trigger).

3. **Approved returns go to stock_devoluciones**: Per CONTEXT.md and RESEARCH.md, returned products go to separate stock_devoluciones column for audit clarity, NOT stock_normal which is for new/purchased stock.

4. **Stock movement notas uses motivo if no approver notes**: `COALESCE(p_notas, v_return.motivo)` ensures every stock movement has meaningful description.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- RPC functions ready for TypeScript types and queries (14-03)
- Stock integration complete for UI components
- Cierre integration will need to subtract approved efectivo refunds

---
*Phase: 14-returns-workflow*
*Completed: 2026-01-26*

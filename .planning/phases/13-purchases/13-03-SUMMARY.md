---
phase: 13-purchases
plan: 03
subsystem: database
tags: [postgresql, rpc, stock-management, audit-trail, row-locking]

# Dependency graph
requires:
  - phase: 13-01
    provides: purchases tables schema, compra_estado enum, get_next_compra_number()
  - phase: 10-01
    provides: medias_products, medias_stock_movements tables
provides:
  - create_purchase RPC for atomic purchase creation
  - confirm_purchase_reception RPC for stock increment
  - cancel_purchase RPC for admin cancellation with stock reversal
affects: [13-04, 13-05, 13-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "FOR UPDATE row locking for race condition prevention"
    - "SECURITY DEFINER with search_path for RPC functions"
    - "Stock movement logging with before/after snapshots"
    - "Role check via app_metadata.user_role in JWT"

key-files:
  created:
    - supabase/migrations/032_purchases_rpc.sql
  modified: []

key-decisions:
  - "Stock only increments on reception confirmation, not at purchase registration"
  - "Stock reversal uses ajuste_salida movement type with referencia_tipo=compra_anulada"
  - "Role check uses JWT app_metadata for cancel_purchase (matches existing pattern)"
  - "All functions return JSONB for consistent API response"

patterns-established:
  - "Two-phase purchase flow: create (pendiente_recepcion) -> confirm (recibido)"
  - "cancel_purchase validates sufficient stock before reversal"
  - "Stock movements log both compra (reception) and compra_anulada (cancellation)"

# Metrics
duration: 2min
completed: 2026-01-26
---

# Phase 13 Plan 03: Purchases RPC Summary

**Atomic RPC functions for purchase lifecycle: create, confirm reception (stock increment), and cancel (stock reversal) with FOR UPDATE locking**

## Performance

- **Duration:** 2 min
- **Started:** 2026-01-26T21:56:45Z
- **Completed:** 2026-01-26T21:58:22Z
- **Tasks:** 1
- **Files created:** 1

## Accomplishments
- create_purchase RPC with gapless COM- numbering and product snapshots
- confirm_purchase_reception RPC atomically increments stock_normal for all items
- cancel_purchase RPC with admin/medico role check and stock reversal
- All functions use FOR UPDATE row locking to prevent race conditions
- Stock movements logged with before/after snapshots for audit trail

## Task Commits

1. **Task 1: Create purchases RPC functions** - `d5d4669` (feat)

## Files Created/Modified
- `supabase/migrations/032_purchases_rpc.sql` - Three RPC functions for purchase operations:
  - `create_purchase(proveedor, fecha_factura, numero_factura, total, factura_path, notas, items JSONB)`
  - `confirm_purchase_reception(purchase_id UUID)`
  - `cancel_purchase(purchase_id UUID, justificacion TEXT)`

## Decisions Made
- **Stock increment timing:** Stock only increases on reception confirmation, not at registration (matches CONTEXT.md two-step flow)
- **Movement type for reversal:** Uses `ajuste_salida` with `referencia_tipo = 'compra_anulada'` to distinguish from regular adjustments
- **Role validation:** Uses `auth.jwt() -> 'app_metadata' ->> 'user_role'` pattern consistent with existing codebase
- **Return format:** All functions return JSONB with id, numero_compra, estado for consistent API

## Deviations from Plan

None - plan executed exactly as specified in user instructions.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- RPC functions ready for TypeScript types and server actions (13-04)
- Stock increment/reversal logic complete
- Purchase lifecycle fully supported: create -> confirm -> (optionally) cancel
- Audit trail captures all stock changes via medias_stock_movements

---
*Phase: 13-purchases*
*Completed: 2026-01-26*

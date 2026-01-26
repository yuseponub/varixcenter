---
phase: 12
plan: 02
subsystem: cash-closing-medias
tags: [rpc, postgresql, cierre, medias, zero-tolerance]
depends_on:
  requires: ["12-01"]
  provides: ["get_medias_cierre_summary", "create_medias_cierre", "reopen_medias_cierre"]
  affects: ["12-03", "12-04"]
tech_stack:
  added: []
  patterns: ["SECURITY DEFINER RPC", "Zero-tolerance validation", "Atomic operations with row locking"]
key_files:
  created:
    - supabase/migrations/025_medias_cierre_rpc.sql
  modified: []
decisions:
  - id: "rpc-zero-tolerance"
    context: "Medias cash closing difference validation"
    decision: "IF v_diferencia != 0 requires justification (no threshold)"
    rationale: "Stricter than clinic - medias has zero tolerance policy per CIE-04"
metrics:
  duration: "2 min"
  completed: "2026-01-26"
---

# Phase 12 Plan 02: Medias Cierre RPC Functions Summary

**One-liner:** 3 RPC functions for medias cash closing with zero-tolerance validation, CIM numbering, and admin-only reopen.

## Objective Achieved

Created migration 025_medias_cierre_rpc.sql with atomic database operations for cash closing workflow:
- `get_medias_cierre_summary`: Preview totals by payment method from medias_sale_methods
- `create_medias_cierre`: Atomic closing creation with zero-tolerance validation
- `reopen_medias_cierre`: Admin-only reopen with mandatory justification

## Tasks Completed

| Task | Name | Commit | Key Changes |
|------|------|--------|-------------|
| 1 | Create get_medias_cierre_summary RPC | 47b9105 | Summary preview function aggregating from medias_sale_methods |
| 2 | Create create_medias_cierre RPC | da40893 | Atomic closing with zero-tolerance (v_diferencia != 0) |
| 3 | Create reopen_medias_cierre RPC | da8d9e2 | Admin-only reopen with verification block |

## Key Implementation Details

### get_medias_cierre_summary(DATE)
- Aggregates totals from `medias_sale_methods` (NOT `medias_sales.total`)
- Filters by `estado = 'activo'` only (excludes anuladas)
- Returns: fecha, totals by method, grand_total, sale_count, has_existing_closing, existing_closing_id
- No records created - pure read operation

### create_medias_cierre(DATE, DECIMAL, TEXT, TEXT, TEXT)
- **Zero-tolerance validation:** `IF v_diferencia != 0` requires justification (no threshold)
- Uses `get_next_medias_cierre_number()` for CIM- prefix
- Role validation: secretaria/admin only
- Photo validation: required (CIE-06)
- Queries `medias_sale_methods` for payment method breakdown
- Row locking via FOR UPDATE on counter

### reopen_medias_cierre(UUID, TEXT)
- Admin-only role check (CIE-07)
- 10-character minimum justification
- Updates `medias_cierres` table (not cash_closings)
- Validates closing exists and is not already reopened

## Key Links Verified

| From | To | Via | Pattern |
|------|-----|-----|---------|
| get_medias_cierre_summary | medias_sale_methods | SUM aggregation by metodo | `FROM medias_sales ms JOIN medias_sale_methods msm` |
| create_medias_cierre | get_next_medias_cierre_number | counter increment | `v_cierre_numero := get_next_medias_cierre_number()` |

## Must-Haves Verification

| Truth | Status |
|-------|--------|
| get_medias_cierre_summary RPC returns totals by payment method for a date | VERIFIED |
| create_medias_cierre RPC atomically creates closing with all validations | VERIFIED |
| reopen_medias_cierre RPC allows only admin to reopen with justification | VERIFIED |

## Deviations from Plan

None - plan executed exactly as written.

## Decisions Made

1. **Zero-tolerance check implementation**: Used `IF v_diferencia != 0` (not `ABS(v_diferencia) > 10000` like clinic) per CIE-04 medias policy.

2. **sale_count vs payment_count**: Used `sale_count` for medias (not `payment_count` from clinic) since medias tracks sales not payments.

## Files Created

### supabase/migrations/025_medias_cierre_rpc.sql (350 lines)
- 3 RPC functions with SECURITY DEFINER
- GRANT EXECUTE to authenticated
- Verification block confirming all functions exist

## Next Phase Readiness

- [x] Summary RPC provides preview for UI
- [x] Create RPC handles atomic closing with all validations
- [x] Reopen RPC enables admin to unlock closed days
- [x] All functions use medias_* tables (independent from clinic)

**Ready for:** Plan 03 (TypeScript types and queries) and Plan 04 (Closing form UI).

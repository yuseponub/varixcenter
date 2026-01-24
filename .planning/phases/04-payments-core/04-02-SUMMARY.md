---
phase: 04-payments-core
plan: 02
subsystem: database
tags: [postgres, triggers, storage, rls, immutability, fraud-prevention]

# Dependency graph
requires:
  - phase: 04-payments-core/01
    provides: payments table schema
  - phase: 01-security-foundation/02
    provides: audit_trigger_func for audit logging
provides:
  - Payment immutability enforcement via database trigger
  - anular_pago RPC for safe payment annulment
  - payment-receipts storage bucket with immutable policies
affects: [04-payments-core/03, 04-payments-core/04, 05-medical-records]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - SECURITY DEFINER triggers for immutability enforcement
    - IS DISTINCT FROM for null-safe field comparison
    - Storage bucket with no DELETE/UPDATE policies for evidence preservation

key-files:
  created:
    - supabase/migrations/010_payments_immutability.sql
    - supabase/migrations/011_payment_receipts_bucket.sql
  modified: []

key-decisions:
  - "IS DISTINCT FROM for all immutable field comparisons (handles NULL correctly)"
  - "anulado_at auto-set in trigger if not provided"
  - "Justificacion minimum 10 chars enforced in RPC, not trigger (better UX)"
  - "No DELETE/UPDATE policies on storage.objects for payment-receipts bucket"

patterns-established:
  - "tr_payment_immutability: BEFORE trigger pattern for immutability"
  - "anular_pago RPC: Safe state transition with role and validation checks"
  - "Storage bucket immutability: Evidence preservation via policy absence"

# Metrics
duration: 2min
completed: 2026-01-24
---

# Phase 04 Plan 02: Payment Immutability Summary

**Database-enforced payment immutability via BEFORE trigger blocking all DELETE and UPDATE (except anulacion), plus immutable storage bucket for receipt evidence**

## Performance

- **Duration:** 2 min
- **Started:** 2026-01-24T02:25:36Z
- **Completed:** 2026-01-24T02:27:11Z
- **Tasks:** 2
- **Files created:** 2

## Accomplishments

- enforce_payment_immutability() trigger blocks all DELETE and blocks UPDATE except estado 'activo' -> 'anulado' transition
- anular_pago() RPC function validates admin/medico role and requires 10+ character justificacion
- payment-receipts storage bucket with 5MB limit, image-only mime types, and NO delete/update policies (immutable evidence)
- Audit trigger on payments table logs all INSERT and UPDATE (anulacion) to audit_log

## Task Commits

Each task was committed atomically:

1. **Task 1: Create payment immutability trigger (010)** - `72d1b40` (feat)
2. **Task 2: Create storage bucket for payment receipts (011)** - `52267d2` (feat)

## Files Created

- `supabase/migrations/010_payments_immutability.sql` - Immutability trigger, anular_pago RPC, audit trigger
- `supabase/migrations/011_payment_receipts_bucket.sql` - Storage bucket with immutable policies

## Decisions Made

1. **IS DISTINCT FROM for field comparisons** - Handles NULL correctly (NULL IS DISTINCT FROM NULL = false)
2. **Separate checks for each immutable field** - Clearer error messages, easier debugging
3. **10-char minimum in RPC only** - Trigger validates non-empty, RPC validates length (better separation of concerns)
4. **Auto-set anulado_at in trigger** - If not provided, sets to now() for convenience
5. **No DELETE/UPDATE policies on storage** - Explicitly omitted (not forgotten) - receipts are permanent evidence

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Payment immutability foundation complete at database level
- Storage bucket ready for receipt uploads
- Ready for TypeScript types and payment UI (04-03, 04-04)
- Note: Migrations 008-009 (services catalog, payments tables) must be applied before 010-011

---
*Phase: 04-payments-core*
*Completed: 2026-01-24*

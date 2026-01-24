---
phase: 04-payments-core
plan: 08
completed: 2026-01-24
duration: 3 min
subsystem: payments
tags: [server-actions, rpc, atomic-transactions, invoice-numbering]

dependency-graph:
  requires: ["04-04", "04-05", "04-06"]
  provides: ["payment-creation-action", "payment-anulacion-action", "atomic-payment-rpc"]
  affects: ["04-09", "04-10"]

tech-stack:
  patterns: ["RPC-for-atomic-operations", "server-action-rpc-bridge"]

key-files:
  created:
    - supabase/migrations/012_create_payment_rpc.sql
    - src/app/(protected)/pagos/actions.ts
  modified:
    - src/types/supabase.ts

decisions:
  - id: "04-08-01"
    decision: "RPC function types added to supabase.ts manually until regeneration"
    rationale: "Type safety required for createPayment/anularPayment to compile"
  - id: "04-08-02"
    decision: "Patient existence validated in RPC before creating payment"
    rationale: "Early error with clear message instead of FK constraint error"
  - id: "04-08-03"
    decision: "SET LOCAL lock_timeout = '10s' to prevent deadlocks"
    rationale: "High concurrency could deadlock on invoice_counter row lock"

metrics:
  files-created: 2
  files-modified: 1
  tasks-completed: 2
---

# Phase 4 Plan 8: Payment Server Actions Summary

**One-liner:** Atomic payment creation RPC with gapless invoice numbering and Zod-validated server actions for createPayment and anularPayment.

## What Was Built

### Migration 012: create_payment_with_invoice RPC

Created `supabase/migrations/012_create_payment_rpc.sql` with:

1. **Input validation:**
   - Patient ID required and exists
   - Items array not empty
   - Methods array not empty

2. **Totals validation:**
   - Items subtotal matches p_subtotal (0.01 tolerance)
   - Methods total matches p_total (0.01 tolerance)

3. **Business rule validation:**
   - Descuento > 0 requires justificacion (5+ chars)
   - Electronic payments (tarjeta/transferencia/nequi) require comprobante_path

4. **Atomic operations:**
   - SET LOCAL lock_timeout = '10s' (deadlock prevention)
   - get_next_invoice_number() for gapless numbering
   - INSERT payment record
   - INSERT payment_items in loop
   - INSERT payment_methods in loop
   - Returns {id, numero_factura} as JSONB

### Server Actions: src/app/(protected)/pagos/actions.ts

1. **createPayment:**
   - Parses items/methods as JSON from FormData
   - Validates with paymentSchema (Zod)
   - Calculates subtotal and total
   - Calls create_payment_with_invoice RPC
   - Maps database errors to Spanish messages
   - Returns PaymentActionState with {id, numero_factura}

2. **anularPayment:**
   - Validates with anulacionSchema (Zod)
   - Calls anular_pago RPC (role check is internal)
   - Maps database errors to Spanish messages
   - Returns PaymentActionState

### Type Updates: src/types/supabase.ts

Added Functions section with:
- create_payment_with_invoice (Args/Returns)
- anular_pago (Args/Returns)
- get_next_invoice_number (Args/Returns)

## Verification Results

| Criteria | Status |
|----------|--------|
| Migration 012 creates valid RPC function | PASS |
| RPC validates all inputs before processing | PASS |
| RPC uses lock_timeout to prevent deadlocks | PASS |
| createPayment validates with Zod before calling RPC | PASS |
| createPayment returns payment ID and invoice number | PASS |
| anularPayment calls anular_pago RPC with role check | PASS |
| Error messages mapped to Spanish | PASS |

## Commits

| Hash | Message |
|------|---------|
| 1e339c5 | feat(04-08): create atomic payment RPC migration |
| 47d2d9e | feat(04-08): create payment server actions |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added RPC function types to supabase.ts**

- **Found during:** Task 2
- **Issue:** TypeScript error "Argument of type 'create_payment_with_invoice' is not assignable to parameter of type 'never'"
- **Fix:** Added Functions section with create_payment_with_invoice, anular_pago, get_next_invoice_number types
- **Files modified:** src/types/supabase.ts
- **Commit:** 47d2d9e

**2. [Rule 1 - Bug] Added nullish coalescing for descuento_justificacion**

- **Found during:** Task 2
- **Issue:** TypeScript error "Type 'string | null | undefined' is not assignable to type 'string | null'"
- **Fix:** Changed to `validated.data.descuento_justificacion ?? null`
- **Files modified:** src/app/(protected)/pagos/actions.ts
- **Commit:** 47d2d9e

**3. [Rule 2 - Missing Critical] Added patient existence validation in RPC**

- **Found during:** Task 1
- **Issue:** Plan didn't explicitly mention patient validation
- **Fix:** Added `IF NOT EXISTS (SELECT 1 FROM patients WHERE id = p_patient_id)` check
- **Files modified:** supabase/migrations/012_create_payment_rpc.sql
- **Commit:** 1e339c5

## Next Phase Readiness

**Ready for 04-09:** Payment form components can now use:
- `createPayment` action for form submission
- `PaymentActionState` type for form state
- RPC returns `{id, numero_factura}` for success toast

**Pending migration:** Apply 012_create_payment_rpc.sql to Supabase before testing.

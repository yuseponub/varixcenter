---
phase: 04-payments-core
plan: 01
subsystem: database
tags: [postgres, migrations, payments, services, rls, triggers, gapless-invoice]

# Dependency graph
requires:
  - phase: 01-security-foundation
    provides: audit infrastructure (enable_audit_for_table), RLS patterns, get_user_role()
  - phase: 02-patients
    provides: patients table (FK reference for payments)
provides:
  - services catalog table with variable pricing support
  - payments table with gapless invoice numbering
  - payment_items table with service snapshots
  - payment_methods table with comprobante requirement for electronic payments
  - invoice_counter with single-row enforcement
  - get_next_invoice_number() function with FOR UPDATE locking
affects: [04-payments-core/02, 04-payments-core/03, future payment UI, reports]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Gapless invoice counter with single-row table and FOR UPDATE locking"
    - "Variable pricing constraints (precio_variable, precio_minimo, precio_maximo)"
    - "Immutable payment foundation: no RLS UPDATE/DELETE policies"
    - "Service snapshot in payment_items (name, price at time of sale)"
    - "Comprobante CHECK constraint for electronic payment methods"

key-files:
  created:
    - supabase/migrations/008_services_catalog.sql
    - supabase/migrations/009_payments_tables.sql
  modified: []

key-decisions:
  - "payment_status as enum with only 'activo' and 'anulado' values"
  - "payment_method_type enum: efectivo, tarjeta, transferencia, nequi"
  - "Single-row invoice_counter with CHECK (id = 1) enforcement"
  - "No updated_at column on payments table - payments are immutable"
  - "ON DELETE RESTRICT for all payment FK references"
  - "Staff can view/insert payments but no UPDATE/DELETE RLS policies"

patterns-established:
  - "Invoice numbering: FAC-NNNNNN format (6 digits, zero-padded)"
  - "Service snapshots: store service_name and unit_price in payment_items"
  - "Electronic payment validation: comprobante_path required except for efectivo"
  - "Counter protection: trigger prevents DELETE and multiple INSERTs"

# Metrics
duration: 2min
completed: 2026-01-24
---

# Phase 4 Plan 01: Payments Database Schema Summary

**Services catalog with variable pricing and payments tables with gapless invoice counter, comprobante CHECK constraint, and immutability foundation (no UPDATE/DELETE policies)**

## Performance

- **Duration:** 2 min
- **Started:** 2026-01-24T02:25:20Z
- **Completed:** 2026-01-24T02:27:06Z
- **Tasks:** 2
- **Files created:** 2

## Accomplishments
- Services table with variable price support (precio_variable, precio_minimo, precio_maximo)
- Payments table with gapless invoice numbering via counter table with FOR UPDATE locking
- Payment items with service snapshots for immutability (name/price captured at sale time)
- Payment methods with mandatory comprobante for electronic payments (tarjeta, transferencia, nequi)
- Immutability foundation: NO UPDATE/DELETE RLS policies on payment tables

## Task Commits

Each task was committed atomically:

1. **Task 1: Create services catalog migration (008)** - `fd93615` (feat)
2. **Task 2: Create payments tables migration (009)** - `c32335a` (feat)

## Files Created
- `supabase/migrations/008_services_catalog.sql` - Services catalog with variable pricing, RLS (admin write), audit trigger
- `supabase/migrations/009_payments_tables.sql` - Payments, payment_items, payment_methods, invoice_counter, get_next_invoice_number()

## Decisions Made
- **payment_status enum:** Only two values ('activo', 'anulado') - transitions enforced by trigger in 010
- **payment_method_type enum:** Four methods (efectivo, tarjeta, transferencia, nequi) - matches Colombian payment landscape
- **Single-row invoice_counter:** CHECK (id = 1) plus trigger protection ensures exactly one counter row
- **No updated_at on payments:** Payments are immutable; no timestamp tracking for modifications
- **ON DELETE RESTRICT everywhere:** Prevents accidental deletion of related data
- **No RLS UPDATE/DELETE policies:** Foundation for immutability - trigger in 010 will handle anulacion only

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

**Migrations must be applied to Supabase:**
```bash
# Apply migrations (order matters)
supabase db push
# OR manually via Supabase Dashboard SQL Editor
```

## Next Phase Readiness
- Services catalog ready for admin CRUD UI (04-02)
- Payments schema ready for immutability trigger (04-03/010 migration)
- All FK relationships established for payment creation
- Blockers: None

---
*Phase: 04-payments-core*
*Completed: 2026-01-24*

---
phase: 11-sales-core
plan: 01
subsystem: database
tags: [postgres, supabase, rls, gapless-numbering, sales, medias]

# Dependency graph
requires:
  - phase: 04-payments-core
    provides: payment_status ENUM, payment_method_type ENUM, gapless counter pattern
  - phase: 10-medias-foundation
    provides: medias_products table for sale_items FK
provides:
  - venta_counter table with gapless VTA- numbering
  - get_next_venta_number() function with FOR UPDATE lock
  - medias_sales header table with patient/vendedor/receptor tracking
  - medias_sale_items with product snapshots
  - medias_sale_methods with comprobante enforcement
  - RLS policies for all sales tables
affects: [11-02-immutability, 11-03-rpc, 11-04-types, medias-cash-closing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Gapless sequential numbering with counter table + FOR UPDATE lock"
    - "Product snapshot pattern (codigo, tipo, talla, price) in sale_items"
    - "Split payment methods with comprobante enforcement"

key-files:
  created:
    - supabase/migrations/021_medias_sales.sql
  modified: []

key-decisions:
  - "Reuse payment_status and payment_method_type ENUMs from payments module"
  - "Patient link is optional to allow sales to non-patient customers (VTA-06)"
  - "receptor_efectivo_id tracks who received cash when different from seller (VTA-08)"
  - "No UPDATE/DELETE RLS policies - immutability enforced by trigger in plan 02"

patterns-established:
  - "VTA- prefixed gapless numbering separate from FAC- invoice numbering"
  - "Snapshot pattern for sale_items matching payment_items structure"

# Metrics
duration: 2min
completed: 2026-01-26
---

# Phase 11 Plan 01: Medias Sales Tables Summary

**Sales schema with venta_counter for gapless VTA- numbering, three-table structure (header + items + methods), and comprobante enforcement for electronic payments**

## Performance

- **Duration:** 2 min
- **Started:** 2026-01-26T02:04:32Z
- **Completed:** 2026-01-26T02:06:47Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Created venta_counter table with single-row enforcement and protection trigger
- Implemented get_next_venta_number() function with FOR UPDATE lock for race protection
- Built medias_sales header with patient link, vendedor, and receptor_efectivo tracking
- Created medias_sale_items with product snapshots (codigo, tipo, talla, unit_price)
- Added medias_sale_methods with comprobante_required_for_electronic constraint
- Established RLS policies for staff SELECT/INSERT on all tables

## Task Commits

Each task was committed atomically:

1. **Task 1: Create sales tables migration** - `283a7b6` (feat)

**Plan metadata:** Pending after summary creation

## Files Created/Modified

- `supabase/migrations/021_medias_sales.sql` - Complete sales schema with 4 tables, functions, triggers, RLS, and indexes

## Decisions Made

1. **Reuse existing ENUMs:** Used payment_status and payment_method_type from 009_payments_tables.sql rather than creating new types
2. **Optional patient link:** patient_id is NULLABLE to support sales to walk-in customers not in the patient database (VTA-06)
3. **Separate cash receiver:** receptor_efectivo_id allows tracking who received cash when different from the seller who rang up the sale (VTA-08)
4. **Deferred immutability:** No UPDATE/DELETE RLS policies; immutability will be enforced by trigger in plan 02

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Sales tables ready for immutability trigger (plan 02)
- venta_counter ready for atomic RPC function (plan 03)
- medias_products FK in place for stock decrement operations
- All VTA requirements from plan 01 (VTA-02 through VTA-10 schema support) addressed

**Ready for:** Plan 02 (immutability trigger + admin delete with stock reversal)

---
*Phase: 11-sales-core*
*Completed: 2026-01-26*

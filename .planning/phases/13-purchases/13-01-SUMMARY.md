---
phase: 13-purchases
plan: 01
subsystem: database
tags: [postgres, supabase, migration, purchases, inventory, rls]

# Dependency graph
requires:
  - phase: 10-medias-foundation
    provides: medias_products table for product references
  - phase: 01-security-foundation
    provides: user_roles table for RLS policies, audit functions
provides:
  - purchases table with two-step reception flow (pendiente_recepcion -> recibido)
  - purchase_items table with product snapshots and costo_unitario
  - purchase_counter with get_next_compra_number() for gapless COM- numbers
  - compra_estado ENUM for purchase state management
affects: [13-purchases-forms, 13-purchases-reception, 13-purchases-ocr, inventory-reports]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Counter table pattern for gapless numbering (matches venta_counter)
    - Product snapshot pattern for audit trail (matches medias_sale_items)
    - Two-step flow pattern for stock management

key-files:
  created:
    - supabase/migrations/031_purchases_tables.sql

key-decisions:
  - "Migration numbered 031 (030 already taken by notifications)"
  - "factura_path NOT NULL enforces required invoice evidence"
  - "RLS: all authenticated users can create, admin/medico can update/delete"
  - "Follows venta_counter pattern for gapless COM-000001 numbering"

patterns-established:
  - "Two-step reception: pendiente_recepcion -> recibido triggers stock increment"
  - "Product snapshots capture codigo, tipo, talla at purchase time"
  - "costo_unitario stored for margin analysis in reports"

# Metrics
duration: 2min
completed: 2026-01-26
---

# Phase 13 Plan 01: Purchases Database Schema Summary

**Purchases and purchase_items tables with gapless COM- numbering, two-step reception flow, and product snapshots for margin analysis**

## Performance

- **Duration:** 2 min
- **Started:** 2026-01-26T21:52:44Z
- **Completed:** 2026-01-26T21:54:22Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Created compra_estado ENUM with pendiente_recepcion, recibido, anulado states
- Built purchases table with required factura_path for invoice evidence
- Built purchase_items table with product snapshots and costo_unitario for margin analysis
- Implemented purchase_counter with get_next_compra_number() for gapless COM- numbers
- Configured RLS policies allowing all users to create, admin/medico to modify

## Task Commits

Each task was committed atomically:

1. **Task 1: Create purchases database migration** - `ce5c8f6` (feat)

## Files Created/Modified
- `supabase/migrations/031_purchases_tables.sql` - Complete purchases schema with tables, enums, functions, indexes, RLS, audit logging, and verification

## Decisions Made
- Used migration number 031 since 030 was already taken by notifications
- Made factura_path NOT NULL to enforce required invoice evidence (COM-04)
- Admin/medico can update/delete directly; enfermera restricted via app layer (per CONTEXT.md)
- Followed existing venta_counter pattern exactly for consistency

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Database schema ready for purchase registration forms
- Stock increment RPC needed for reception confirmation flow
- OCR integration can be built on top of this foundation

---
*Phase: 13-purchases*
*Completed: 2026-01-26*

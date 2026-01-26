# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-25)

**Core value:** Pagos inmutables con evidencia obligatoria — hacer el fraude imposible
**Current milestone:** v1.1 Varix-Medias
**Current focus:** Phase 12 - Cash Closing Medias

## Current Position

Phase: 12 of 15 (Cash Closing Medias)
Plan: 05 of 6 (UI components complete)
Status: Phase 12 in progress
Last activity: 2026-01-26 — Completed 12-05-PLAN.md

Progress: [####################] v1.0 complete (simulated) | [################░░░░] v1.1 ~80%

## Performance Metrics

**Velocity:**
- Total plans completed: 37
- Average duration: 4 min
- Total execution time: 135 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-security-foundation | 4 | 27 min | 7 min |
| 02-patients | 7 | 27 min | 4 min |
| 03-appointments | 6 | 22 min | 4 min |
| 04-payments-core | 5 | 20 min | 4 min |
| 10-medias-foundation | 4 | 9 min | 2.3 min |
| 11-sales-core | 8 | 13 min | 1.6 min |
| 12-cash-closing-medias | 5 | 17 min | 3.4 min |

**Recent Trend:**
- Last 5 plans: 12-05 (4 min), 12-04 (2 min), 12-03 (6 min), 12-02 (2 min), 12-01 (3 min)
- Trend: Component tasks ~4 min

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting v1.1 Varix-Medias:

- [Roadmap v1.1]: Phases 10-15 continue from v1.0 numbering (no restart)
- [Roadmap v1.1]: Medias uses separate cash closing from clinic (CIM- prefix vs CIE-)
- [Roadmap v1.1]: Dual stock tracking (stock_normal + stock_devoluciones) for audit clarity
- [Roadmap v1.1]: Two-phase returns approval for fraud prevention
- [Roadmap v1.1]: Zero tolerance for cash differences (stricter than clinic's $10k threshold)
- [Research]: 90% pattern reuse from existing VarixClinic codebase
- [Research]: Only new dependency is thermal printer support (no Tesseract.js in v1.1)
- [10-01]: Stock movements are fully immutable with before/after snapshots for audit trail
- [10-02]: Separate medias types/validations directories for module isolation
- [10-02]: Zod v4 API syntax ({ error: } instead of { required_error: })
- [10-03]: Dual stock display shows stock_normal/stock_devoluciones separately with total
- [10-03]: Only precio and activo are editable after product creation (tipo, talla, codigo immutable)
- [10-04]: Button shows "Actualizar Precio" when editing (only price changes allowed)
- [10-04]: Products ordered by tipo then talla for logical grouping
- [11-04]: Reused PaymentMethodType pattern from clinic payments for medias sales
- [11-04]: Product snapshots stored as strings for immutability
- [11-02]: Sales fully immutable (no estado transition like payments - simpler model)
- [11-02]: Stock reversal goes to stock_normal via ajuste_entrada movement type
- [11-03]: Two-pass validation pattern for atomic stock operations (validate all, then execute all)
- [11-03]: FOR UPDATE row locking prevents race conditions on concurrent sales
- [11-05]: Explicit any cast for Supabase client on untyped tables (pending migration)
- [11-06]: Cart state managed via parent-controlled callbacks pattern
- [11-06]: SaleMethodForm reuses ReceiptUpload from payments for VTA-05 compliance
- [11-07]: Patient selection via searchable Select dropdown (matching appointment-form pattern)
- [11-07]: date-fns added for date formatting in SalesTable
- [11-08]: window.print() with CSS @media print for thermal receipt (VTA-14)
- [11-08]: 58mm width with monospace font for thermal printer compatibility
- [11-08]: Delete button only visible to admin users for active sales
- [12-01]: CIM prefix for medias cierre (independent from clinic CIE prefix)
- [12-01]: Zero tolerance constraint: ANY difference requires justification (no threshold)
- [12-01]: Reuses cierre_estado ENUM from clinic migration 015
- [12-02]: RPC zero-tolerance check: IF v_diferencia != 0 (not ABS > threshold)
- [12-02]: sale_count used for medias (not payment_count like clinic)
- [12-03]: Medias types not added to barrel export (conflicts with clinic PAYMENT_METHODS, CierreEstado)
- [12-03]: Import medias cierres from @/types/medias/cierres directly
- [12-03]: cierre_photo_path required in medias (vs optional in clinic)
- [12-04]: Direct type imports from @/types/medias/cierres (not barrel export)
- [12-04]: Auth check in server actions before RPC calls for explicit error handling
- [12-05]: Photo upload REQUIRED for medias cierre (vs optional in clinic)
- [12-05]: Reuse CierrePhotoUpload from clinic components (no duplication)

### Pending Todos

- [ ] Enable Custom Access Token Hook in Supabase Dashboard after migrations applied
- [ ] Bootstrap first admin user via `SELECT public.bootstrap_first_admin();`
- [ ] Create test user in Supabase Auth to verify login flow
- [ ] Apply pending migrations (007-025) to Supabase

### Blockers/Concerns

None yet for v1.1 Varix-Medias.

## Session Continuity

Last session: 2026-01-26
Stopped at: Completed 12-05-PLAN.md (UI components)
Resume file: None

---
*v1.1 Varix-Medias: Modulo de medias de compresion con ventas inmutables, inventario dual, y cierre de caja independiente.*

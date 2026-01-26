# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-25)

**Core value:** Pagos inmutables con evidencia obligatoria — hacer el fraude imposible
**Current milestone:** v1.1 Varix-Medias
**Current focus:** Phase 11 - Sales Core

## Current Position

Phase: 11 of 15 (Sales Core) — IN PROGRESS
Plan: 02 of 8 (wave 2 complete)
Status: Executing wave 2 plans
Last activity: 2026-01-26 — Completed 11-02-PLAN.md (Immutability enforcement)

Progress: [####################] v1.0 complete (simulated) | [######░░░░░░░░░░░░░░] v1.1 ~25%

## Performance Metrics

**Velocity:**
- Total plans completed: 29
- Average duration: 4 min
- Total execution time: 110 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-security-foundation | 4 | 27 min | 7 min |
| 02-patients | 7 | 27 min | 4 min |
| 03-appointments | 6 | 22 min | 4 min |
| 04-payments-core | 5 | 20 min | 4 min |
| 10-medias-foundation | 4 | 9 min | 2.3 min |
| 11-sales-core | 3 | 5 min | 1.7 min |

**Recent Trend:**
- Last 5 plans: 10-04 (2 min), 11-04 (2 min), 11-01 (2 min), 11-03 (1 min), 11-02 (2 min)
- Trend: Consistent ~2 min for types/validation tasks, 1 min for single-file RPC migrations

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

### Pending Todos

- [ ] Enable Custom Access Token Hook in Supabase Dashboard after migrations applied
- [ ] Bootstrap first admin user via `SELECT public.bootstrap_first_admin();`
- [ ] Create test user in Supabase Auth to verify login flow
- [ ] Apply pending migrations (007-023) to Supabase

### Blockers/Concerns

None yet for v1.1 Varix-Medias.

## Session Continuity

Last session: 2026-01-26
Stopped at: Completed 11-02-PLAN.md
Resume file: None

---
*v1.1 Varix-Medias: Modulo de medias de compresion con ventas inmutables, inventario dual, y cierre de caja independiente.*

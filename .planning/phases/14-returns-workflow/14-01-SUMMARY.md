---
phase: 14-returns-workflow
plan: 01
subsystem: database
tags: [migration, returns, medias, immutability, enums, rls]
depends:
  requires: [10-01, 11-01]  # medias_foundation, medias_sales
  provides: [medias_returns table, devolucion_estado enum, reembolso_metodo enum, DEV- counter]
  affects: [14-02, 14-03, 14-04, 14-05]  # RPC, types, queries, UI
tech-stack:
  added: []
  patterns: [gapless counter, immutability trigger, state machine, two-phase approval]
key-files:
  created:
    - supabase/migrations/033_medias_returns.sql
  modified: []
decisions:
  - "DEV- prefix for return numbering (consistent with VTA-, CIM-, COM-)"
  - "foto_path OPTIONAL per CONTEXT.md decision"
  - "motivo minimum 10 chars for meaningful explanations"
  - "Terminal states (aprobada/rechazada) are completely immutable"
metrics:
  duration: 2 min
  completed: 2026-01-26
---

# Phase 14 Plan 01: Medias Returns Migration Summary

**One-liner:** Database schema for two-phase return approval with DEV- gapless numbering, immutable state machine, and role-based RLS.

## What Was Built

### ENUMs Created

1. **devolucion_estado** - Return status workflow:
   - `pendiente` - Created, awaiting Admin/Medico approval
   - `aprobada` - Approved, stock will be affected
   - `rechazada` - Rejected, no stock change

2. **reembolso_metodo** - Refund method:
   - `efectivo` - Cash refund (affects cierre calculation)
   - `cambio_producto` - Product exchange (no cash impact)

### Tables Created

1. **medias_return_counter** - Single-row gapless counter:
   - Initialized with `DEV` prefix
   - Protected by trigger (no DELETE, single INSERT only)
   - `get_next_medias_return_number()` function for atomic increment

2. **medias_returns** - Main returns table:
   - `numero_devolucion` - Gapless DEV-000001 format
   - `sale_id`, `sale_item_id` - FKs to original sale
   - `cantidad` - Partial return support
   - Product snapshots (`product_codigo`, `product_tipo`, `product_talla`)
   - `monto_devolucion` - Refund amount
   - `motivo` - Free text (10+ chars required)
   - `foto_path` - OPTIONAL photo evidence
   - `metodo_reembolso` - Cash or product exchange
   - `estado` - State machine with terminal states
   - `solicitante_id` - Who requested
   - `aprobador_id`, `aprobado_at`, `notas_aprobador` - Approval tracking

### Immutability Enforcement

**Trigger: `tr_medias_return_immutability`**
- Blocks DELETE completely
- Protects core fields from modification:
  - numero_devolucion, sale_id, sale_item_id, cantidad
  - Product snapshots, monto_devolucion, motivo
  - metodo_reembolso, solicitante_id, created_at
- State machine enforcement:
  - From `pendiente`: only `aprobada` or `rechazada` allowed
  - `aprobada` and `rechazada` are terminal (no further changes)
  - Auto-sets `aprobado_at` on state transition

### RLS Policies

| Operation | Roles Allowed | Rationale |
|-----------|---------------|-----------|
| SELECT | admin, medico, enfermera, secretaria | All staff see returns for transparency |
| INSERT | admin, medico, enfermera, secretaria | Any employee can request a return |
| UPDATE | admin, medico only | Two-phase approval requires privileged role |
| DELETE | None | Immutable records for audit |

### Indexes

- `idx_medias_returns_sale` - Lookup returns by sale
- `idx_medias_returns_estado` - Filter by status (pending list)
- `idx_medias_returns_created` - Sort by creation date DESC
- `idx_medias_returns_aprobado` - Partial index for cierre calculations (approved only)
- `idx_medias_returns_sale_item` - For partial return validation

### Audit Integration

Trigger `tr_audit_medias_returns` logs all INSERT and UPDATE operations to `audit_log` table for fraud trail.

## Pattern Alignment

| Requirement | Implementation | Status |
|-------------|----------------|--------|
| DEV-01: Two-phase approval | RLS INSERT all staff, UPDATE admin/medico | Complete |
| DEV-02: Partial returns | cantidad column, validated in RPC | Schema ready |
| DEV-03: Product snapshots | product_codigo/tipo/talla columns | Complete |
| DEV-04: Optional photo | foto_path nullable | Complete |
| DEV-05: Motivo 10+ chars | medias_returns_motivo_length constraint | Complete |
| DEV-06: Estado machine | Trigger enforces transitions | Complete |
| DEV-07: Terminal states | Trigger blocks changes from aprobada/rechazada | Complete |
| DEV-08: Gapless numbering | medias_return_counter + get_next function | Complete |
| DEV-09: Refund method | reembolso_metodo ENUM, set at creation | Complete |

## Deviations from Plan

None - plan executed exactly as written.

## Files Changed

| File | Change Type | Lines |
|------|-------------|-------|
| supabase/migrations/033_medias_returns.sql | Created | 601 |

## Commits

- `8be8c12`: feat(14-01): create medias_returns database migration

## Next Phase Readiness

**Ready for 14-02 (RPC Functions):**
- [ ] Schema complete with all columns
- [ ] ENUMs defined for status and refund method
- [ ] Counter function ready for use
- [ ] Immutability trigger in place (RPC can work with it)

**Pending for RPC:**
- `create_medias_return` - Validate quantity against sale_item, generate number, create record
- `approve_medias_return` - Set estado=aprobada, increment stock_devoluciones, log movement
- `reject_medias_return` - Set estado=rechazada with optional notes
- Cierre integration - Subtract efectivo refunds from total_efectivo

---

*Phase: 14-returns-workflow, Plan: 01*
*Completed: 2026-01-26*

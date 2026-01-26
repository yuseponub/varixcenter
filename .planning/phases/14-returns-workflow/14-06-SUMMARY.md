---
phase: 14-returns-workflow
plan: 06
subsystem: returns-ui
tags: [pages, next.js, returns, workflow]
depends_on:
  requires: ["14-04", "14-05"]
  provides: ["returns-pages", "returns-navigation"]
  affects: ["dashboard", "medias-navigation"]
tech-stack:
  added: []
  patterns: ["two-step-flow", "sale-search-select", "getUserRole-inline"]
key-files:
  created:
    - src/app/(protected)/medias/devoluciones/page.tsx
    - src/app/(protected)/medias/devoluciones/nueva/page.tsx
    - src/app/(protected)/medias/devoluciones/pendientes/page.tsx
    - src/app/(protected)/medias/devoluciones/[id]/page.tsx
    - src/components/medias/returns/sale-search-select.tsx
  modified: []
decisions:
  - key: inline-getUserRole
    choice: Define getUserRole in each page file
    rationale: Follows existing pattern in ventas/[id], cierres/[id], pagos/[id]
  - key: two-step-return-flow
    choice: Select sale first, then show return form
    rationale: Returns require context from original sale
  - key: sale-search-local
    choice: Filter sales client-side from server-fetched list
    rationale: Reduces complexity, sufficient for 50-sale limit
metrics:
  duration: 3 min
  completed: 2026-01-26
---

# Phase 14 Plan 06: Returns Workflow Pages Summary

Returns workflow pages providing complete navigation for creating and managing returns.

## One-liner

Four pages for returns workflow: list, new (two-step), pending queue, and detail with approve/reject.

## Tasks Completed

| Task | Description | Commit | Key Changes |
|------|-------------|--------|-------------|
| 1 | Returns list page | 1c34f38 | page.tsx with pending badge, navigation to pendientes |
| 2 | New return page | 5c1d4ee | Two-step flow, SaleSearchSelect component |
| 3 | Pending returns page | 341719a | Filtered view for admin quick access |
| 4 | Return detail page | 4821bea | Full detail with approve/reject actions |

## What Was Built

### Returns List Page (`/medias/devoluciones`)
- Displays all returns with ReturnsTable component
- Pending count badge linking to pendientes page
- Nueva Devolucion button for all users
- Passes userRole for conditional table actions

### New Return Page (`/medias/devoluciones/nueva`)
- **Step 1 (no sale_id):** SaleSearchSelect for sale selection
  - Filters by numero_venta or patient name/cedula
  - Shows 50 most recent active sales
  - Table with sale info and select button
- **Step 2 (with sale_id):** ReturnForm for return creation
  - Fetches sale details and returnable quantities
  - Blocks anulado sales with message

### Sale Search Select Component
- Client component with local filtering
- Search input for numero_venta or patient
- Table display with sale details
- Navigation via useRouter on selection

### Pending Returns Page (`/medias/devoluciones/pendientes`)
- Filtered to estado='pendiente' only
- Quick access for Admin/Medico to process queue
- Count display in header

### Return Detail Page (`/medias/devoluciones/[id]`)
- Breadcrumb navigation
- Return status badge (pendiente/aprobada/rechazada)
- Two-column layout:
  - Left: Return details (product, quantity, amount, motivo)
  - Right: Approval status (solicitante, aprobador, dates, notas)
- Link to original sale
- Approve/reject buttons for pendiente + admin/medico only

## Key Decisions

1. **Inline getUserRole:** Each page defines its own getUserRole function (follows existing pattern)
2. **Two-step return flow:** Select sale first via searchParams, then show form
3. **Local sale filtering:** SaleSearchSelect filters client-side from 50-sale list
4. **Spanish locale:** All dates formatted with date-fns es locale

## Verification Results

- [x] List page fetches returns and shows pending count badge
- [x] New return page has two-step flow (select sale then create return)
- [x] Pending page filters to estado='pendiente'
- [x] Detail page shows full return info with conditional approve/reject
- [x] All pages follow existing medias page patterns
- [x] Navigation between pages works correctly

## Files Created

| File | Lines | Purpose |
|------|-------|---------|
| devoluciones/page.tsx | 81 | Returns list |
| devoluciones/nueva/page.tsx | 119 | New return flow |
| devoluciones/pendientes/page.tsx | 65 | Pending queue |
| devoluciones/[id]/page.tsx | 219 | Return detail |
| sale-search-select.tsx | 142 | Sale selection component |

## Deviations from Plan

None - plan executed exactly as written.

## Phase 14 Status

Phase 14 (Returns Workflow) is now COMPLETE:
- 14-01: Database migration and RPC functions
- 14-02: Additional RPC functions for approval workflow
- 14-03: Types and validations
- 14-04: Query functions
- 14-05: UI components (form, table, dialogs, status badge)
- 14-06: Pages and navigation (this plan)

## Next Phase Readiness

Phase 14 complete. Returns workflow is fully functional:
- Users can create return requests from any active sale
- Admin/Medico can approve or reject from pending queue or detail page
- Approved returns increment stock_devoluciones
- Cash refunds tracked by aprobado_at for cierre reconciliation

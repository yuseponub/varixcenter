---
phase: 11-sales-core
plan: 05
completed: 2026-01-26
duration: 3 min
subsystem: medias-sales
tags: [queries, server-actions, rpc, supabase]
requires: [11-03, 11-04]
provides: [sales-queries, sales-server-actions]
affects: [11-06, 11-07]
tech-stack:
  patterns: [server-actions, rpc-pattern, zod-validation]
key-files:
  created:
    - src/lib/queries/medias/sales.ts
    - src/app/(protected)/medias/ventas/actions.ts
decisions:
  - id: "11-05-01"
    decision: "Use explicit any cast for Supabase client on untyped tables"
    rationale: "Medias tables not in generated types until migrations applied"
---

# Phase 11 Plan 05: Sales Queries and Server Actions Summary

Data access layer for medias sales with query functions and server actions following clinic payments pattern.

## What Was Built

### Sales Query Functions (`src/lib/queries/medias/sales.ts`)

- **getSales(options)**: Fetches sales with items, methods, and patient relations. Supports filtering by status, date range, pagination
- **getSaleById(id)**: Single sale with all details including nested items and methods
- **getActiveSaleProducts()**: Active products with stock_normal > 0 for sale form dropdown
- **getTodaySales()**: Sales created today (for cash closing module)
- **getSalesSummary(startDate, endDate)**: Count and totals for date range reporting

### Sales Server Actions (`src/app/(protected)/medias/ventas/actions.ts`)

- **createMediasSale**: Validates with Zod, calls `create_medias_sale` RPC for atomic operation
- **deleteMediasSale**: Validates 10+ char justification, calls `eliminar_medias_sale` RPC (admin only)
- **SaleActionState type**: Consistent action state with error/errors/success/data

## Key Patterns Implemented

1. **RPC for Atomic Operations**: Server actions call RPC functions instead of direct queries
2. **Zod Validation First**: All input validated before database interaction
3. **Spanish Error Messages**: User-facing errors in Spanish for Colombian users
4. **Path Revalidation**: Both `/medias/ventas` and `/medias/productos` revalidated after mutations

## Commits

| Hash | Type | Description |
|------|------|-------------|
| cef789d | feat | create sales query functions |
| 3abf772 | feat | create sales server actions |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added TypeScript explicit any casts for Supabase queries**
- **Found during:** Task 1
- **Issue:** Medias tables (medias_sales, medias_sale_items, medias_sale_methods, medias_products) not in generated Supabase types
- **Fix:** Used `(supabase as any).from('table')` pattern with eslint-disable comments
- **Files modified:** src/lib/queries/medias/sales.ts
- **Commit:** cef789d

## Verification Checklist

- [x] getSales fetches with items, methods, and patient relations
- [x] getSaleById returns single sale with all details
- [x] getActiveSaleProducts filters by activo=true and stock_normal > 0
- [x] createMediasSale validates with Zod then calls RPC
- [x] deleteMediasSale validates admin role via RPC
- [x] All error messages are in Spanish
- [x] revalidatePath called for /medias/ventas and /medias/productos

## Next Phase Readiness

Ready for Phase 11-06 (Sale Form Component) which will use:
- `getActiveSaleProducts()` for product dropdown
- `createMediasSale` server action for form submission

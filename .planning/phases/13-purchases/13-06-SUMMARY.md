---
phase: 13-purchases
plan: 06
subsystem: purchases-actions
tags: [server-actions, rpc, ocr, supabase]

dependency-graph:
  requires: ["13-02", "13-03", "13-05"]
  provides: ["purchase-crud-actions", "invoice-ocr-action"]
  affects: ["13-07", "13-08", "13-09"]

tech-stack:
  added: []
  patterns: ["formData-parsing", "rpc-wrapper-actions", "explicit-any-cast"]

key-files:
  created:
    - src/app/(protected)/medias/compras/actions.ts
  modified: []

decisions:
  - id: "13-06-01"
    description: "parseInvoice wraps OCR service as server action for authenticated access"
  - id: "13-06-02"
    description: "Zod v4 uses issues[0].message instead of errors[0].message"

metrics:
  duration: "3 min"
  completed: "2026-01-26"
---

# Phase 13 Plan 06: Purchase Server Actions Summary

Server actions for purchase CRUD operations with RPC calls and OCR integration.

## One-liner

Purchase server actions wrapping create/confirm/cancel RPCs with Zod validation and parseInvoice for OCR pre-fill.

## What Was Done

### Task 1: Create purchase server actions

Created `src/app/(protected)/medias/compras/actions.ts` with four server actions:

1. **createPurchase(prevState, formData)**: Parses FormData, validates with createPurchaseSchema, calls `create_purchase` RPC with items array. Returns purchase id and numero_compra.

2. **confirmReception(purchaseId)**: Validates UUID, calls `confirm_purchase_reception` RPC which atomically increments stock_normal for all items and logs stock movements.

3. **cancelPurchase(purchaseId, justificacion)**: Validates 10+ char justification, calls `cancel_purchase` RPC which checks admin/medico role internally. Reverts stock if purchase was already received.

4. **parseInvoice(base64Image, mimeType)**: Wraps the OCR service for authenticated access. Returns ParsedInvoice data for form pre-fill.

### Key Implementation Details

- All actions verify authentication before processing
- Uses `(supabase as any).rpc()` pattern for untyped RPC calls (pending types update)
- Spanish error messages mapped from database exceptions
- Revalidates `/medias/compras` and `/medias/productos` paths after mutations
- Zod v4 API: `validated.error.issues[0]?.message` for error extraction

## Verification Results

- [x] All server actions marked with 'use server'
- [x] createPurchase validates input and calls RPC
- [x] confirmReception calls confirm_purchase_reception RPC
- [x] cancelPurchase checks role via RPC and reverses stock if needed
- [x] parseInvoice wraps OCR service
- [x] All paths revalidated after mutations
- [x] TypeScript compiles without errors

## Commits

| Hash | Message |
|------|---------|
| 7592a36 | feat(13-06): add purchase server actions |

## Deviations from Plan

None - plan executed exactly as written.

## Files Changed

### Created
- `src/app/(protected)/medias/compras/actions.ts` - 267 lines, 4 server actions

## Next Phase Readiness

Ready for:
- 13-07: Purchase form and list UI components
- 13-08: Purchase detail page with actions
- 13-09: Integration testing

No blockers identified.

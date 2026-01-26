---
phase: 12-cash-closing-medias
plan: 05
subsystem: medias-cierres-ui
status: complete
tags: [components, cash-closing, medias, zero-tolerance, photo-upload]
dependency-graph:
  requires: ["12-03"]
  provides: ["medias-cierre-components"]
  affects: ["12-06"]
tech-stack:
  added: []
  patterns: ["useActionState", "component-reuse"]
file-tracking:
  key-files:
    created:
      - src/components/medias/cierres/cierre-summary-card.tsx
      - src/components/medias/cierres/cierre-form.tsx
      - src/components/medias/cierres/reopen-dialog.tsx
      - src/components/medias/cierres/cierres-table.tsx
    modified: []
decisions:
  - id: "medias-photo-required"
    choice: "Photo upload is REQUIRED (not optional like clinic)"
    rationale: "Zero tolerance policy requires stricter evidence for medias"
  - id: "component-reuse-photo"
    choice: "Reuse CierrePhotoUpload from clinic components"
    rationale: "Same functionality, avoid duplication"
metrics:
  duration: "4 min"
  completed: "2026-01-26"
---

# Phase 12 Plan 05: Cierre Components Summary

Medias cierre UI components with zero-tolerance UX and required photo upload.

## What Was Built

### Task 1: Cierre Summary Card (120 lines)

Created `MediasCierreSummaryCard` component that displays:
- Total by payment method (efectivo, tarjeta, transferencia, nequi)
- Uses `sale_count` (not `payment_count` - medias model)
- TOLERANCIA CERO warning when diferencia != 0
- No descuentos/anulaciones sections (simpler medias model)

### Task 2: Cierre Form with Required Photo (288 lines)

Created `MediasCierreForm` component with:
- Photo upload is **REQUIRED** (hasPhoto validation blocks submit)
- "TOLERANCIA CERO" warning for any difference (!= 0)
- useActionState with createMediasCierre action
- Reuses CierrePhotoUpload from @/components/cash-closing/cierre-photo-upload
- Navigates to /medias/cierres on success

### Task 3: Reopen Dialog and Cierres Table (116 + 101 lines)

Created `MediasReopenDialog` component:
- Uses useActionState with reopenMediasCierre action
- Requires 10+ char justification for admin reopen
- Shows toast on success

Created `MediasCierresTable` component:
- Links to /medias/cierres/[id] paths
- Shows reopen button for admin when estado='cerrado'
- Highlights diferencia != 0 in red

## Key Implementation Details

```typescript
// Photo is REQUIRED for medias (different from clinic optional)
const hasPhoto = photoPath !== null && photoPath.trim() !== ''
const isValid = !needsJustificacion && hasPhoto

// Zero tolerance warning
{hasDiferencia && (
  <p className="text-sm text-red-600 mt-1 font-semibold">
    TOLERANCIA CERO: Cualquier diferencia requiere justificacion detallada.
  </p>
)}
```

## Component Reuse

Reused from clinic components:
- `CierrePhotoUpload` - photo upload with preview
- `CIERRE_ESTADO_LABELS` / `CIERRE_ESTADO_VARIANTS` - estado badge mapping

## Decisions Made

1. **Photo Required**: Unlike clinic's optional photo, medias requires photo evidence for every cierre (zero tolerance policy)
2. **Component Reuse**: CierrePhotoUpload reused from clinic rather than duplicating
3. **Sale Count**: Using `sale_count` terminology (not `payment_count`) to match medias domain

## Deviations from Plan

None - plan executed exactly as written.

## Test Coverage

Components tested via TypeScript compilation. Full integration testing pending page implementation.

## Files Created

| File | Lines | Purpose |
|------|-------|---------|
| cierre-summary-card.tsx | 120 | Summary display with zero-tolerance warning |
| cierre-form.tsx | 288 | Main form with required photo |
| reopen-dialog.tsx | 116 | Admin reopen with justification |
| cierres-table.tsx | 101 | Closings list table |

## Next Phase Readiness

Ready for 12-06: Pages and routes that consume these components.

Dependencies ready:
- Components export from src/components/medias/cierres/
- Types available from @/types/medias/cierres
- Actions expected at @/app/(protected)/medias/cierres/actions

## Commits

| Hash | Message |
|------|---------|
| 11ae56f | feat(12-05): add medias cierre summary card component |
| 46a32dc | feat(12-05): add medias cierre form component with required photo |
| b8a6892 | feat(12-05): add medias reopen dialog and cierres table |

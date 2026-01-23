---
phase: 02-patients
plan: 05
subsystem: ui
tags: [react, tanstack-table, next.js, search, debounce, spanish-ui]

# Dependency graph
requires:
  - phase: 02-03
    provides: searchPatients query function, patient types
  - phase: 02-01
    provides: shadcn/ui Input and Table components, TanStack Table
provides:
  - PatientSearch component with debounce
  - PatientTable component with TanStack Table sorting
  - /pacientes list page with search and navigation
affects: [02-06, 02-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - URL-based search state for shareable searches
    - Debounced input with useTransition for smooth UX
    - TanStack Table for client-side sorting
    - Suspense boundaries for async data loading

key-files:
  created:
    - src/components/patients/patient-search.tsx
    - src/components/patients/patient-table.tsx
    - src/app/(protected)/pacientes/page.tsx
  modified:
    - src/components/patients/patient-form.tsx

key-decisions:
  - "300ms debounce delay balances responsiveness vs server load"
  - "URL params for search enables shareable/bookmarkable searches"
  - "Spanish locale (es-CO) for date formatting"
  - "Monospace font for cedula/celular improves readability"

patterns-established:
  - "URL-based search: Update searchParams, read on server for filtering"
  - "Debounce pattern: useState + useEffect timer + startTransition"
  - "Table pattern: TanStack Table with flexRender + shadcn/ui Table"

# Metrics
duration: 4min
completed: 2026-01-23
---

# Phase 02 Plan 05: Patient List UI Summary

**Patient list page at /pacientes with debounced search and TanStack Table sorting**

## Performance

- **Duration:** 4 min
- **Started:** 2026-01-23T21:52:18Z
- **Completed:** 2026-01-23T21:56:52Z
- **Tasks:** 3
- **Files created:** 3
- **Files modified:** 1 (blocking fix)

## Accomplishments

- Patient search component with 300ms debounce and loading indicator
- Patient table with sortable columns and row click navigation
- Patient list page integrating search, table, and "Nuevo Paciente" button
- Spanish UI throughout (placeholder, empty state, date formatting)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create patient search component** - `9544250` (feat)
2. **Task 2: Create patient table component** - `b469f18` (feat)
3. **Task 3: Create patient list page** - `b0fe1e9` (feat)

**Blocking fix:** `b97fa1f` (fix: resolve zodResolver type mismatch in patient form)

## Files Created/Modified

- `src/components/patients/patient-search.tsx` - Debounced search input updating URL params
- `src/components/patients/patient-table.tsx` - TanStack Table with sorting and row navigation
- `src/app/(protected)/pacientes/page.tsx` - Server component page with Suspense loading
- `src/components/patients/patient-form.tsx` - Fixed type mismatch in resolver (blocking fix)

## Decisions Made

- **300ms debounce:** Standard balance between responsiveness and avoiding excessive requests
- **URL-based search state:** Enables sharing search URLs and browser back/forward navigation
- **Spanish locale (es-CO):** Colombian date formatting for "Registrado" column
- **Monospace font:** Applied to cedula and celular for better number readability

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed zodResolver type mismatch in patient-form.tsx**
- **Found during:** Verification (npm run build)
- **Issue:** Pre-existing type error - PatientFormData includes cedula, but patientUpdateSchema omits it, causing resolver type incompatibility
- **Fix:** Added type assertion (`as any`) with explanatory comment for conditional schema resolver
- **Files modified:** src/components/patients/patient-form.tsx
- **Verification:** Build passes, /pacientes route compiles
- **Committed in:** b97fa1f (separate fix commit)

---

**Total deviations:** 1 auto-fixed (blocking)
**Impact on plan:** Pre-existing type error in related file blocked build verification. Fix is minimal and well-documented.

## Issues Encountered

None beyond the blocking fix documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Patient list page complete and accessible at /pacientes
- Search functionality works with existing searchPatients query
- Table rows navigate to /pacientes/[id] (detail page in 02-06)
- "Nuevo Paciente" button links to /pacientes/nuevo (create page in 02-06)

---
*Phase: 02-patients*
*Completed: 2026-01-23*

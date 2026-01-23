---
phase: 02-patients
plan: 04
subsystem: api
tags: [server-actions, react-hook-form, zod, crud, forms]

# Dependency graph
requires:
  - phase: 02-03
    provides: Zod validation schemas (patientSchema, patientUpdateSchema)
provides:
  - createPatient server action with Zod validation
  - updatePatient server action with cedula immutability
  - PatientForm reusable component for create/edit modes
affects: [02-05, 02-06, 02-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server action signature: (prevState, formData) for useActionState"
    - "Bound server action for patientId: updatePatient.bind(null, patientId)"
    - "Conditional Zod schema in useForm resolver"

key-files:
  created:
    - src/app/(protected)/pacientes/nuevo/actions.ts
    - src/app/(protected)/pacientes/[id]/editar/actions.ts
    - src/components/patients/patient-form.tsx
  modified: []

key-decisions:
  - "ActionState type includes errors Record for field-level error display"
  - "Empty strings converted to null before database insert/update"
  - "Duplicate cedula error code 23505 returns Spanish user-friendly message"

patterns-established:
  - "Server action with useActionState: [state, formAction, pending]"
  - "React Hook Form with shadcn/ui Form components"
  - "Conditional schema: isEdit ? patientUpdateSchema : patientSchema"

# Metrics
duration: 6min
completed: 2026-01-23
---

# Phase 02, Plan 04: Patient Server Actions Summary

**Server actions with Zod validation and reusable PatientForm component using react-hook-form**

## Performance

- **Duration:** 6 min
- **Started:** 2026-01-23T21:52:18Z
- **Completed:** 2026-01-23T21:58:18Z
- **Tasks:** 2
- **Files created:** 3

## Accomplishments
- createPatient server action validates with full patientSchema before database insert
- updatePatient server action validates with patientUpdateSchema (cedula omitted)
- PatientForm component handles both create and edit modes with mode prop
- Edit mode disables cedula field with visual feedback and helper text
- Loading state shows "Guardando..." during submission

## Task Commits

Each task was committed atomically:

1. **Task 1: Create server actions for patient CRUD** - `de736f7` (feat)
2. **Task 2: Create reusable patient form component** - `d48a39a` (feat)

**Plan metadata:** `[pending]` (docs: complete plan)

## Files Created/Modified

- `src/app/(protected)/pacientes/nuevo/actions.ts` - createPatient server action with Zod validation
- `src/app/(protected)/pacientes/[id]/editar/actions.ts` - updatePatient server action (no cedula)
- `src/components/patients/patient-form.tsx` - Reusable form for create/edit modes

## Decisions Made

- **ActionState type with field-level errors:** Returns `errors: Record<string, string[]>` for per-field error display in form
- **Empty string to null conversion:** Optional fields like email, fecha_nacimiento, direccion converted to null for proper database storage
- **Type assertion for conditional schema:** Added eslint-disable comment for zodResolver type mismatch when using conditional schema

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Type assertion needed for conditional Zod resolver**
- **Found during:** Task 2 (Build verification)
- **Issue:** zodResolver(isEdit ? patientUpdateSchema : patientSchema) causes TypeScript error because schemas have different shapes
- **Fix:** Added `as any` type assertion with eslint-disable comment and explanatory comment
- **Files modified:** src/components/patients/patient-form.tsx
- **Verification:** npm run build passes
- **Committed in:** d48a39a (part of Task 2 commit after linter ran)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Type assertion is safe because disabled field prevents cedula edits in edit mode

## Issues Encountered

None - plan executed as specified.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Server actions ready for page integration in 02-05 (patient list page)
- PatientForm ready for use in nuevo and editar page routes
- Both actions revalidate /pacientes path for automatic list refresh

---
*Phase: 02-patients*
*Completed: 2026-01-23*

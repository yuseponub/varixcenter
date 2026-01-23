---
phase: 02-patients
plan: 03
completed: 2026-01-23
duration: 3 min
subsystem: patients
tags: [zod, validation, supabase, queries]

dependency_graph:
  requires: ["02-01", "02-02"]
  provides: ["validation-schemas", "patient-queries"]
  affects: ["02-04", "02-05"]

tech_stack:
  added: []
  patterns: ["zod-form-validation", "supabase-query-functions"]

key_files:
  created:
    - src/lib/validations/patient.ts
    - src/lib/queries/patients.ts
  modified:
    - src/types/supabase.ts

decisions:
  - id: validation-spanish
    choice: "All validation messages in Spanish"
    rationale: "Colombian user base"
  - id: cedula-immutable-zod
    choice: "patientUpdateSchema.omit({ cedula: true })"
    rationale: "Type-safe immutability at validation layer"
  - id: search-ilike-pattern
    choice: "ILIKE with % wildcards for multi-field search"
    rationale: "Simple, performant partial matching across cedula, nombre, apellido, celular"

metrics:
  tasks_completed: 2
  commits: 2
---

# Phase 02 Plan 03: Validation Schemas and Query Functions Summary

Zod validation schemas with Spanish messages and Supabase query functions using ILIKE for multi-field patient search

## What Was Built

### Validation Schemas (`src/lib/validations/patient.ts`)

1. **patientSchema** - Full patient creation validation
   - cedula: 6-10 digits regex validation
   - Phone: 10-digit Colombian format
   - Emergency contact fields: Required (NOT NULL)
   - All error messages in Spanish

2. **patientUpdateSchema** - Update-safe variant
   - Uses `.omit({ cedula: true })` for compile-time immutability
   - Works with database trigger as defense-in-depth

3. **patientSearchSchema** - URL parameter validation
   - Pagination (page, limit) with coercion
   - Search query with max length

4. **Type exports**
   - `PatientFormData` - Inferred from patientSchema
   - `PatientUpdateData` - Inferred from patientUpdateSchema
   - `PatientSearchParams` - Inferred from patientSearchSchema

### Query Functions (`src/lib/queries/patients.ts`)

1. **searchPatients(query, limit)** - Multi-field search
   - Uses ILIKE for case-insensitive partial matching
   - Searches: cedula, nombre, apellido, celular
   - Returns recent patients when query empty

2. **getPatientById(id)** - Single patient fetch
   - Returns full record or null
   - Distinguishes "not found" from errors

3. **getPatientTimeline(patientId, limit)** - Audit history
   - Queries audit_log for patient changes
   - Transforms to human-readable events
   - Spanish descriptions (e.g., "Paciente registrado en el sistema")

4. **cedulaExists(cedula)** - Pre-submission check
   - Efficient count query with head: true
   - Better UX for duplicate detection

5. **getPatientsPage(page, limit)** - Paginated list
   - Returns data + pagination metadata
   - Sorted by apellido alphabetically

## Commits

| Commit | Type | Description |
|--------|------|-------------|
| 30680e3 | feat | Create Zod validation schemas for patients |
| d15023a | feat | Create Supabase query functions for patients |

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Validation messages | Spanish | Colombian user base |
| Cedula immutability | `.omit({ cedula: true })` | Type-safe at validation layer |
| Search pattern | ILIKE with .or() | Simple, performant multi-field matching |
| Timeline source | audit_log table | Leverages Phase 1 audit infrastructure |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added audit_log table type to supabase.ts**
- **Found during:** Task 2 verification
- **Issue:** TypeScript build failed - `audit_log` table not in Database type
- **Fix:** Added audit_log Row/Insert/Update types to `src/types/supabase.ts`
- **Files modified:** src/types/supabase.ts
- **Commit:** d15023a (combined with Task 2)

## Test Coverage

No unit tests added (validation schemas and queries will be tested through integration in subsequent plans).

## Next Phase Readiness

Ready for:
- **02-04**: Patient server actions can import validation schemas and query functions
- **02-05**: Patient components can use query functions for data fetching

No blockers.

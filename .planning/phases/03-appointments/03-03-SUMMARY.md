---
phase: 03-appointments
plan: 03
subsystem: database, api
tags: [supabase, queries, calendar, doctors_view, fullcalendar]

# Dependency graph
requires:
  - phase: 03-01
    provides: appointments table, appointment_status enum
provides:
  - doctors_view for doctor list queries without service role
  - getAppointmentsForCalendar with date range and doctor filter
  - getAppointmentById with patient join
  - getDoctors using view
  - getAppointmentsByPatient for history
  - countAppointmentsForDate for metrics
affects: [03-04, 03-05, 03-06, 04-payments]

# Tech tracking
tech-stack:
  added: []
  patterns: [database views for secure data access]

key-files:
  created:
    - src/lib/queries/appointments.ts
  modified:
    - supabase/migrations/007_appointments.sql
    - src/types/supabase.ts

key-decisions:
  - "doctors_view uses SECURITY DEFINER to access auth.users without service role"
  - "STATUS_COLORS mapping for FullCalendar event styling by appointment state"
  - "Date range filter uses gte/lte on fecha_hora_inicio for calendar queries"

patterns-established:
  - "Database views for cross-schema queries (public + auth)"
  - "CalendarEvent transformation pattern with extendedProps for metadata"

# Metrics
duration: 2min
completed: 2026-01-23
---

# Phase 03 Plan 03: Appointment Queries Summary

**Supabase query functions for calendar data with doctors_view for secure doctor list access**

## Performance

- **Duration:** 2 min
- **Started:** 2026-01-23T22:58:01Z
- **Completed:** 2026-01-23T22:59:42Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created doctors_view joining user_roles with auth.users for secure doctor queries
- Implemented getAppointmentsForCalendar with date range and doctor filtering (APT-02)
- Added STATUS_COLORS mapping for FullCalendar event styling by appointment state
- Updated Supabase types with appointments table and doctors_view

## Task Commits

Each task was committed atomically:

1. **Task 1: Add doctors view to migration** - `2b65629` (feat)
2. **Task 2: Create appointment query functions** - `9a1d146` (feat)

## Files Created/Modified
- `supabase/migrations/007_appointments.sql` - Added doctors_view for secure doctor queries
- `src/lib/queries/appointments.ts` - Query functions for calendar, appointments, doctors
- `src/types/supabase.ts` - Added appointments table and doctors_view types

## Decisions Made
- **doctors_view with SECURITY DEFINER:** Allows authenticated users to query doctor list from auth.users without service role, filtering by user_role = 'medico'
- **STATUS_COLORS constant:** Maps all 7 appointment states to color schemes for FullCalendar events
- **CalendarEvent transformation:** extendedProps contains all appointment metadata (patient info, estado, notas) for event click handlers

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Query layer complete for calendar, doctors, and appointment data
- Ready for server actions (03-04) that will use these queries
- doctors_view migration must be applied alongside 007_appointments.sql

---
*Phase: 03-appointments*
*Completed: 2026-01-23*

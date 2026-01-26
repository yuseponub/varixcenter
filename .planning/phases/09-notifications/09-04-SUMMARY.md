---
phase: 09-notifications
plan: 04
subsystem: api
tags: [cron, twilio, sms, vercel, notifications, reminders]

# Dependency graph
requires:
  - phase: 09-01
    provides: notifications database schema with unique constraint
  - phase: 09-02
    provides: notification types and validation schemas
  - phase: 09-03
    provides: Twilio SMS client and message builder
provides:
  - Notification query functions for appointment reminder logic
  - Cron API endpoint with Bearer token authentication
  - Vercel cron schedule configuration (every 15 minutes)
  - 24h and 2h reminder processing with retry logic
affects: [09-05-notification-list-page]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Vercel Cron with CRON_SECRET Bearer authentication
    - Time window query for cron timing tolerance
    - E.164 phone number formatting for Colombia

key-files:
  created:
    - src/lib/queries/notifications.ts
    - src/app/api/cron/send-reminders/route.ts
    - vercel.json
  modified: []

key-decisions:
  - "1-hour time window (+-30min) for reminder queries to handle Vercel Hobby plan cron variance"
  - "E.164 format with +57 country code for Colombian phone numbers"
  - "30 minute retry delay with max 2 attempts (initial + 1 retry)"
  - "Duplicate prevention via database constraint (error code 23505)"

patterns-established:
  - "Cron auth pattern: Bearer token matching CRON_SECRET env var"
  - "Phone formatting: formatPhoneE164() adds +57 for 10-digit Colombian numbers"
  - "Notification lifecycle: pendiente -> enviado/fallido/reintentando"

# Metrics
duration: 4min
completed: 2026-01-26
---

# Phase 09 Plan 04: Cron Job and Query Functions Summary

**Vercel cron endpoint sending SMS reminders at 24h and 2h intervals via Twilio, with time-window queries and automatic retry logic**

## Performance

- **Duration:** 4 min
- **Started:** 2026-01-26T21:53:18Z
- **Completed:** 2026-01-26T21:57:25Z
- **Tasks:** 3
- **Files created:** 3

## Accomplishments
- Query functions for finding appointments needing reminders within 1-hour time window
- Cron API endpoint with CRON_SECRET Bearer token authentication
- Vercel.json cron configuration running every 15 minutes
- Phone number E.164 formatting for Colombian numbers (+57)
- Retry logic scheduling failed sends 30 minutes later (max 1 retry)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create notification query functions** - `ef9dd1f` (feat)
2. **Task 2: Create cron API route** - `6000786` (feat)
3. **Task 3: Create vercel.json with cron schedule** - `a41530a` (chore)

## Files Created

- `src/lib/queries/notifications.ts` - Query functions: getAppointmentsNeedingReminder, createNotification, updateNotificationStatus, getNotificationsForRetry, getNotifications, getPatientNotifications
- `src/app/api/cron/send-reminders/route.ts` - Cron endpoint with GET handler, processes 24h/2h reminders and retry queue
- `vercel.json` - Vercel cron configuration with */15 * * * * schedule

## Decisions Made

1. **Time window for queries:** 1-hour window (+-30 min) around target time to handle Vercel Hobby plan cron variance (up to 1 hour)
2. **Phone formatting:** E.164 with +57 country code - detects 10-digit Colombian numbers starting with 3
3. **Retry policy:** 30 minute delay, max 2 total attempts (initial + 1 retry)
4. **Auth pattern:** CRON_SECRET as Bearer token in Authorization header

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created Twilio module files (dependency 09-03)**
- **Found during:** Plan initialization
- **Issue:** Plan depends on 09-03 (Twilio client) but those files didn't exist yet
- **Fix:** Created src/lib/twilio/client.ts, sms.ts, message-builder.ts matching 09-03 spec
- **Files created:** src/lib/twilio/client.ts, src/lib/twilio/sms.ts, src/lib/twilio/message-builder.ts
- **Verification:** Imports in cron route resolve correctly
- **Committed in:** 24b73d4 (from prior operation)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Dependency files were required to unblock imports. No scope creep.

## Issues Encountered

None - plan executed as specified after resolving the blocking dependency.

## User Setup Required

**External services require manual configuration:**

1. **Vercel Environment Variables:**
   - `CRON_SECRET` - Generate with: `openssl rand -hex 16`
   - Add in Vercel Dashboard -> Project -> Settings -> Environment Variables

2. **Twilio Configuration (from 09-03):**
   - `TWILIO_ACCOUNT_SID` - From Twilio Console
   - `TWILIO_AUTH_TOKEN` - From Twilio Console
   - `TWILIO_PHONE_NUMBER` - Active number in E.164 format
   - `CLINIC_PHONE_NUMBER` - Contact phone for appointment changes

## Next Phase Readiness

- Cron system complete and ready for deployment
- When deployed with env vars, will automatically send reminders
- Next: 09-05 notification list page for admin monitoring

---
*Phase: 09-notifications*
*Completed: 2026-01-26*

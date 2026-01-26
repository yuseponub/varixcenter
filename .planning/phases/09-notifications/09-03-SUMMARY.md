---
phase: 09-notifications
plan: 03
subsystem: notifications
tags: [twilio, sms, gsm-7, colombia]

# Dependency graph
requires:
  - phase: 09-02
    provides: Notification types and SendSMSResult interface
provides:
  - Twilio client singleton with graceful degradation
  - sendSMS function with Twilio error handling
  - Message builder with GSM-7 safe text
  - isPermanentError helper for retry logic
affects: [09-04, 09-05]

# Tech tracking
tech-stack:
  added: [twilio@5.12.0]
  patterns: [singleton-with-graceful-degradation, gsm-7-encoding]

key-files:
  created:
    - src/lib/twilio/client.ts
    - src/lib/twilio/sms.ts
    - src/lib/twilio/message-builder.ts
  modified: []

key-decisions:
  - "Graceful degradation: null client in dev when credentials missing"
  - "PERMANENT_ERROR_CODES list for retry logic (21211, 21212, 21214, 21217, 21608)"
  - "GSM-7 encoding: uses 'manana' instead of special char to avoid UCS-2"
  - "Spanish message template with es-CO locale for date formatting"

patterns-established:
  - "Twilio client pattern: null when unconfigured, check with isTwilioConfigured()"
  - "SMS error handling: Twilio error codes captured and typed"
  - "Message builder: sanitize patient name, GSM-7 safe text, 160 char warning"

# Metrics
duration: 3min
completed: 2026-01-26
---

# Phase 09 Plan 03: Twilio SMS Client Summary

**Twilio SMS integration with sendSMS function, Twilio error code handling, and GSM-7 safe Spanish message templates**

## Performance

- **Duration:** 3 min
- **Started:** 2026-01-26T21:53:18Z
- **Completed:** 2026-01-26T21:56:24Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Twilio SDK v5.12.0 installed for SMS sending capability
- Client singleton with graceful degradation when credentials missing
- sendSMS function wrapping Twilio API with typed error handling
- isPermanentError helper for distinguishing retryable errors
- Message builder using GSM-7 encoding (160 char limit)
- Spanish templates avoiding accented vowels (manana vs mañana)

## Task Commits

Each task was committed atomically:

1. **Task 1: Install twilio package** - `978f14c` (chore)
2. **Task 2: Create Twilio client and SMS functions** - `24b73d4` (feat)

## Files Created/Modified

- `src/lib/twilio/client.ts` - Twilio client singleton with env validation
- `src/lib/twilio/sms.ts` - sendSMS function with Twilio error code handling
- `src/lib/twilio/message-builder.ts` - GSM-7 safe message templates
- `package.json` - Added twilio@5.12.0 dependency
- `package-lock.json` - Updated lockfile

## Decisions Made

1. **Graceful degradation in development** - When TWILIO_ACCOUNT_SID/AUTH_TOKEN missing, client is null and isTwilioConfigured() returns false. Allows dev work without Twilio account.

2. **Permanent error codes** - Five Twilio error codes (21211, 21212, 21214, 21217, 21608) are marked as permanent and should not be retried. These indicate invalid/unreachable phone numbers.

3. **GSM-7 encoding strategy** - Uses "manana" instead of "mañana" to keep messages in GSM-7 encoding (160 char single segment vs 70 chars for UCS-2 with accented characters).

4. **es-CO locale for dates** - Uses Intl.DateTimeFormat with es-CO locale and America/Bogota timezone for appointment date formatting.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

**External services require manual configuration.** The following environment variables must be set:

| Variable | Source |
|----------|--------|
| `TWILIO_ACCOUNT_SID` | Twilio Console -> Account -> Account SID |
| `TWILIO_AUTH_TOKEN` | Twilio Console -> Account -> Auth Token |
| `TWILIO_PHONE_NUMBER` | Twilio Console -> Phone Numbers -> Active Numbers (E.164 format, e.g., +17605551234) |
| `CLINIC_PHONE_NUMBER` | Clinic contact phone for appointment changes (e.g., 607-001-2345) |

## Next Phase Readiness

- Twilio client ready for use by notification processing (09-04)
- sendSMS function accepts E.164 phone format (+57 prefix for Colombia)
- Message builder ready for appointment reminders
- Error handling distinguishes permanent vs retryable errors

---
*Phase: 09-notifications*
*Completed: 2026-01-26*

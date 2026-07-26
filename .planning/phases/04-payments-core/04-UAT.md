---
status: partial
phase: 04-payments-core
source:
  - 04-08-SUMMARY.md
  - 04-10-SUMMARY.md
started: 2026-07-26T00:15:00-05:00
updated: 2026-07-26T09:07:00-05:00
---

## Current Test

[testing paused — corrected cold-close validation failed safely; 2 items remain blocked]

## Tests

### 1. Cold start, new WiMAX customer, and quantity greater than one
expected: FAC-001151 is processed from WiMAX closed; WiMAX starts and authenticates, the new customer is created with the collision-safe code, one FE is emitted for two SES units totaling COP 190000, and CUFE, ColFact XML, and stored PDF all match.
result: issue
reported: "The first guarded close opened the WiMAX Salir menu without selecting it. A newly authorized retry sent Alt+S followed by Enter, but WiMAX still remained running. Both attempts stopped before creating a job or emitting an invoice."
severity: major

### 2. Existing customer with accented surname while a test browser is open
expected: FAC-001164 emits exactly once for COP 100000 while an unrelated browser is open, preserving the Herreño surname identity and returning WiMAX to a clean main screen.
result: blocked
blocked_by: prior-phase
reason: "The authorization required stopping all remaining invoices after any error in the first scenario."

### 3. Consecutive invoice for the same patient without a false duplicate
expected: After FAC-001164 is fully linked, FAC-001166 emits exactly once for COP 250000; the prior FE is recognized as consumed, not as an ambiguous duplicate, and the second CUFE and PDF match independently.
result: blocked
blocked_by: prior-phase
reason: "The authorization required stopping all remaining invoices after any error in the first scenario."

## Summary

total: 3
passed: 0
issues: 1
pending: 0
skipped: 0
blocked: 2

## Gaps

- truth: "A clean WiMAX session can be closed and then cold-started before the first authorized invoice."
  status: failed
  reason: "The corrected Alt+S then Enter sequence was dispatched successfully, but WiMAX did not exit within the guarded timeout; the fail-closed path stopped before queue creation."
  severity: major
  test: 1
  root_cause: "Unknown. The initial missing Enter explained only the open menu. The second attempt proves that Alt+S plus Enter is not a reliable close operation for this WiMAX state; another dialog, focus transition, or command path must be identified without emitting."
  artifacts:
    - path: "scripts/wimax-facturas/close-wimax-clean-uat.ps1"
      issue: "The retry used the atomic %s{ENTER} sequence and still reached UAT_CLOSE_WIMAX_DID_NOT_EXIT."
    - path: "C:\varix-facturas\app\logs\uat-close-wimax-20260726.log"
      issue: "The log records CLOSE_START and a successful key dispatch, but no CLOSE_END."
    - path: "C:\varix-facturas\app\logs\uat-close-wimax-20260726-run2.log"
      issue: "The retry log also records CLOSE_START and successful dispatch, but no CLOSE_END."
  missing:
    - "Diagnose the actual WiMAX exit interaction in a non-emitting session, then request fresh authorization before attempting FAC-001151 again."
  debug_session: "inline-2026-07-26-wimax-cold-close"

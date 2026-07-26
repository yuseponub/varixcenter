---
status: partial
phase: 04-payments-core
source:
  - 04-08-SUMMARY.md
  - 04-10-SUMMARY.md
started: 2026-07-26T00:15:00-05:00
updated: 2026-07-26T00:23:00-05:00
---

## Current Test

[testing paused — 2 items blocked by the cold-start prerequisite]

## Tests

### 1. Cold start, new WiMAX customer, and quantity greater than one
expected: FAC-001151 is processed from WiMAX closed; WiMAX starts and authenticates, the new customer is created with the collision-safe code, one FE is emitted for two SES units totaling COP 190000, and CUFE, ColFact XML, and stored PDF all match.
result: issue
reported: "The guarded close command opened the WiMAX Salir menu but did not select its only item. WiMAX remained running, so the run stopped before creating a job or emitting an invoice."
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
  reason: "The close command opened the Salir menu but omitted the Enter needed to select its only item; the fail-closed timeout stopped before queue creation."
  severity: major
  test: 1
  root_cause: "close-wimax-clean-uat.ps1 sent Alt+S only. In this WiMAX build Alt+S opens a one-item native menu; it does not invoke Salir until Enter is sent."
  artifacts:
    - path: "scripts/wimax-facturas/close-wimax-clean-uat.ps1"
      issue: "The first run used %s instead of the atomic %s{ENTER} sequence."
    - path: "C:\varix-facturas\app\logs\uat-close-wimax-20260726.log"
      issue: "The log records CLOSE_START and a successful key dispatch, but no CLOSE_END."
  missing:
    - "Validate the corrected Alt+S then Enter sequence in a fresh authorized cold-start UAT."
  debug_session: "inline-2026-07-26-wimax-cold-close"

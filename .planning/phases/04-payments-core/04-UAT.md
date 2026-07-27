---
status: partial
phase: 04-payments-core
source:
  - 04-08-SUMMARY.md
  - 04-10-SUMMARY.md
started: 2026-07-26T00:15:00-05:00
updated: 2026-07-26T12:52:00-05:00
---

## Current Test

[testing paused — FAC-001151 failed safely before emission; 2 items remain blocked]

## Tests

### 1. Cold start, new WiMAX customer, and quantity greater than one
expected: FAC-001151 is processed from WiMAX closed; WiMAX starts and authenticates, the new customer is created with the collision-safe code, one FE is emitted for two SES units totaling COP 190000, and CUFE, ColFact XML, and stored PDF all match.
result: issue
reported: "The guarded cold-stop and cold startup passed. FAC-001151 created customer 37MRO, but the customer UI saved La Guajira/Riohacha/440017 instead of Santander/Bucaramanga/680011. When the robot redundantly reloaded the already prepared header, it typed FE into Bodega and WiMAX rejected it with 'Bodega FE no existe'. The robot aborted before items, accounting acceptance, DIAN, ColFact, or any FE/CUFE/PDF."
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

- truth: "A new WiMAX customer can be created with exact identity and locality, then continue from the already loaded invoice header without corrupting Bodega."
  status: failed
  reason: "The directory selectors were not verified before save, and prepareJobUi replayed the FE/account prefix after createCustomer even though WiMAX had already loaded FE, account, and Bodega BP."
  severity: major
  test: 1
  root_cause: "The profile confirmed department/city by blind physical clicks and did not assert their displayed values. The shared prepareInvoice flow had no post-create entry point, so its first FE keystrokes landed on the focused Bodega field."
  artifacts:
    - path: 'C:\varix-facturas\app\state\ccd05817-00ac-4fac-bc77-5776266297b1\46-clasificar-salida-guardar-cliente.png'
      issue: "Shows FE7871 as the next uncommitted number, account 37MRO, city Riohacha, Bodega BP, zero rows and subtotal 0."
    - path: 'C:\varix-facturas\app\state\ccd05817-00ac-4fac-bc77-5776266297b1\72-abortado.png'
      issue: "Shows 'Bodega FE no existe', zero rows and subtotal 0; it is not an emitted invoice."
    - path: "scripts/wimax-facturas/inspect-tmdir-FAC001151.mjs"
      issue: "Read-only DBF inspection confirms 37MRO has DPTO La Guajira, DIREC3 Riohacha and COD_POSTAL 440017."
  missing:
    - "Confirm or correct the intended locality for customer 37MRO; the Varix patient record has ciudad=null."
    - "Run a new supervised invoice only after fresh authorization because the original authorization required stopping on any error or ambiguity."
  fix_status: "Implemented and deployed without requeueing: new customers use a post-create validation flow and enter prepareInvoice at metodo-campo; identity/locality fields are asserted; abort handles the exact Bodega error; UTF-8 stdin and CP850 DBF decoding preserve Ñ/ñ. Local suite: 55/55 passing."
  debug_session: "inline-2026-07-26-fac001151-new-customer"

- truth: "A clean WiMAX session can be stopped under exact guards and cold-started before an authorized invoice."
  status: passed
  reason: "The guarded stop produced wx_count=0 with an unchanged DBF; WiMAX then started and authenticated from zero without reorganization."
  severity: none
  test: 1
  artifacts:
    - path: 'C:\varix-facturas\app\logs\uat-stop-wimax-FAC001151-20260726.log'
      issue: "Records STOP_END, wx_count=0 and dbf_unchanged=true."
  debug_session: "wimax-cold-close-fails.md"

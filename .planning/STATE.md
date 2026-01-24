# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-23)

**Core value:** Pagos inmutables con evidencia obligatoria — hacer el fraude imposible
**Current focus:** Phase 3 - Appointments

## Current Position

Phase: 4 of 9 (Payments Core)
Plan: 10 of ? in current phase
Status: In progress
Last activity: 2026-01-24 — Completed 04-10-PLAN.md (payment form and new payment page)

Progress: [██████████████████░░] ~85%

## Performance Metrics

**Velocity:**
- Total plans completed: 22
- Average duration: 4 min
- Total execution time: 96 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-security-foundation | 4 | 27 min | 7 min |
| 02-patients | 7 | 27 min | 4 min |
| 03-appointments | 6 | 22 min | 4 min |
| 04-payments-core | 5 | 20 min | 4 min |

**Recent Trend:**
- Last 5 plans: 04-06 (4 min), 04-08 (3 min), 04-09 (5 min), 04-10 (3 min)
- Trend: Consistent ~3-5 min for focused implementation tasks

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Security/audit foundation must be Phase 1 per research recommendations (RLS misconfig is #1 Supabase vulnerability)
- [Roadmap]: Payments before Medical Records because anti-fraud is core value
- [Roadmap]: Voice dictation deferred to Phase 7 due to high complexity and independence
- [Roadmap]: Notifications last phase (external integrations, not core to anti-fraud mission)
- [01-01]: Used Database generic type in all Supabase clients for compile-time type safety
- [01-01]: Added isValidRole type guard for runtime role validation
- [01-02]: Use enum type for user_role instead of CHECK constraint for type safety
- [01-02]: Store role in app_metadata (not user_metadata) to prevent privilege escalation
- [01-02]: No UPDATE/DELETE policies on audit_log = database-enforced immutability
- [01-04]: Use tr_audit_{tablename} naming convention for audit triggers
- [01-04]: bootstrap_first_admin() allows first-time setup without SQL access
- [01-03]: Use getUser() not getSession() for secure JWT validation in middleware
- [01-03]: Role read from app_metadata for security (set by access token hook)
- [01-03]: Spanish UI with route groups: (auth) for login, (protected) for dashboard
- [02-01]: Use shadcn/ui with Tailwind CSS v4 for component library
- [02-01]: Form validation pattern: zod schema + react-hook-form + @hookform/resolvers
- [02-02]: cedula omitted from TypeScript Update type for compile-time immutability
- [02-02]: All staff roles can INSERT/UPDATE patients, only admin can DELETE
- [02-02]: Emergency contact fields are required (NOT NULL)
- [02-03]: All validation messages in Spanish for Colombian users
- [02-03]: patientUpdateSchema.omit({ cedula: true }) for Zod-level immutability
- [02-03]: ILIKE with .or() for multi-field patient search
- [02-04]: ActionState type includes errors Record for field-level error display
- [02-04]: Empty strings converted to null before database insert/update
- [02-04]: Server action signature: (prevState, formData) for useActionState compatibility
- [02-05]: 300ms debounce for search balances responsiveness vs server load
- [02-05]: URL params for search enables shareable/bookmarkable searches
- [02-05]: Spanish locale (es-CO) for date formatting in tables
- [02-06]: Edit page shows cedula in header with immutability notice
- [02-06]: Breadcrumb includes patient name link to detail page
- [02-06]: Null database values converted to empty strings for form compatibility
- [02-07]: Timeline supports future event types (payment, appointment, procedure) via type union
- [02-07]: Empty state placeholder mentions future features for user awareness
- [02-07]: Parallel fetching via Promise.all for patient + timeline data
- [03-01]: Used btree_gist extension for EXCLUDE USING gist constraint
- [03-01]: appointment_status enum with 7 states matches workflow requirements
- [03-01]: Exclusion constraint only applies to active appointments (not cancelada/no_asistio)
- [03-01]: RLS policies use EXISTS subquery against user_roles table
- [03-02]: APPOINTMENT_STATES as const array for runtime and compile-time type safety
- [03-02]: State machine allows reversion and cancellation from any state
- [03-02]: STATUS_HEX_COLORS provides FullCalendar-compatible color values
- [03-02]: Zod v4 syntax uses error: instead of errorMap: for enum error messages
- [03-03]: doctors_view uses SECURITY DEFINER to access auth.users without service role
- [03-03]: STATUS_COLORS mapping for FullCalendar event styling by appointment state
- [03-03]: CalendarEvent transformation pattern with extendedProps for metadata
- [03-04]: ActionState type extended with data field for returning created entity ID
- [03-04]: State machine validation happens server-side before DB update
- [03-04]: 23P01 exclusion violation returns Spanish user-friendly message about overlap
- [03-04]: deleteAppointment suggests using cancel for non-admins
- [03-05]: 300ms longPressDelay for mobile-friendly drag-drop without tap interference
- [03-05]: eventDurationEditable: false - appointments can only be moved, not resized
- [03-05]: DoctorFilter uses 'all' string value for SelectItem compatibility
- [03-05]: StatusBadge supports 'sm' and 'default' size variants
- [03-06]: Use Intl.DateTimeFormat with es-CO locale for Spanish dates (no date-fns)
- [03-06]: CalendarView fetches via API route for refresh without page reload
- [03-06]: Selected doctor filter pre-filled when navigating to new appointment
- [03-06]: Toaster configured globally in root layout with richColors and closeButton
- [04-01]: payment_status enum with only 'activo' and 'anulado' values
- [04-01]: payment_method_type enum: efectivo, tarjeta, transferencia, nequi
- [04-01]: Single-row invoice_counter with CHECK (id = 1) enforcement
- [04-01]: No updated_at on payments table - payments are immutable
- [04-01]: ON DELETE RESTRICT for all payment FK references
- [04-01]: No RLS UPDATE/DELETE policies on payment tables (immutability foundation)
- [04-01]: Invoice numbering format: FAC-NNNNNN (6 digits, zero-padded)
- [04-01]: Service snapshots stored in payment_items (service_name, unit_price)
- [04-01]: comprobante_path CHECK constraint requires photo for non-cash payments
- [04-02]: IS DISTINCT FROM for null-safe immutable field comparisons
- [04-02]: anulado_at auto-set in trigger if not provided
- [04-02]: Justificacion 10+ chars enforced in RPC (better UX than trigger)
- [04-02]: No DELETE/UPDATE policies on storage.objects for payment-receipts (evidence preservation)
- [04-03]: PAYMENT_STATES uses 'activo'/'anulado' matching database enum
- [04-03]: requiresComprobante() returns true for tarjeta/transferencia/nequi
- [04-03]: PaymentWithDetails includes nested patients/items/methods relations
- [04-03]: ServiceOption type extracts only fields needed for payment form dropdown
- [04-05]: Type cast complex joins to PaymentWithDetails using `as unknown as` pattern
- [04-05]: Added services, payments, payment_items, payment_methods to supabase.ts
- [04-06]: Unique path format: comprobantes/{user_id}/{timestamp}_{filename}
- [04-06]: Safe filename sanitization replaces non-alphanumeric with underscore
- [04-06]: 2 hour validity for signed upload URLs
- [04-06]: Storage upload pattern: Server creates signed URL, client uploads via uploadToSignedUrl
- [04-04]: Variable price validation: min <= base <= max when precio_variable=true
- [04-04]: Comprobante validation via refine(): non-cash methods require photo path
- [04-04]: Descuento justificacion: 5+ chars (more lenient than anulacion)
- [04-04]: Anulacion justificacion: 10+ chars for proper audit trail
- [04-08]: RPC function types added manually to supabase.ts until regeneration
- [04-08]: Patient existence validated in RPC before creating payment
- [04-08]: SET LOCAL lock_timeout = '10s' to prevent deadlocks on invoice_counter
- [04-07]: Use z.input instead of z.infer for form types when schema has .default() modifiers
- [04-07]: Dialog-based editing for services (not separate page) for inline workflow
- [04-07]: Conditional form fields pattern: watch() + conditional render
- [04-09]: Auto-increment quantity when same service selected twice
- [04-09]: Clamp variable price to min/max on input change
- [04-09]: Reset comprobante_path when payment method type changes
- [04-09]: Balance validation uses Math.abs(diff) < 0.01 for floating point safety
- [04-10]: Auto-update first method amount when items change for single-method UX
- [04-10]: canSubmit combines all business rules as single source of truth
- [04-10]: Patient query param for pre-selection from detail page

### Pending Todos

- [ ] Enable Custom Access Token Hook in Supabase Dashboard after migrations applied
- [ ] Bootstrap first admin user via `SELECT public.bootstrap_first_admin();`
- [ ] Create test user in Supabase Auth to verify login flow
- [ ] Apply 007_appointments.sql migration to Supabase
- [ ] Apply 008_services_catalog.sql migration to Supabase
- [ ] Apply 009_payments_tables.sql migration to Supabase
- [ ] Apply 010_payments_immutability.sql migration to Supabase
- [ ] Apply 011_payment_receipts_bucket.sql migration to Supabase
- [ ] Apply 012_create_payment_rpc.sql migration to Supabase

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-01-24T02:45:12Z
Stopped at: Completed 04-10-PLAN.md (payment form and new payment page)
Resume file: None

---
*Phase 4 (Payments Core) starting. This is the CORE VALUE - immutable payments with mandatory evidence.*

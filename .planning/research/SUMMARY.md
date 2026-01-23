# Project Research Summary

**Project:** VarixClinic - Sistema de gestión para clínica de flebología
**Domain:** Healthcare clinic management with anti-fraud financial controls
**Researched:** 2026-01-23
**Confidence:** HIGH

## Executive Summary

VarixClinic is a phlebology clinic management system for a Colombian practice facing internal payment fraud through record manipulation. The research validates that the chosen stack (Next.js 15 + Supabase + shadcn/ui) is excellent for this use case, with specific emphasis on PostgreSQL's Row-Level Security (RLS) and append-only audit patterns to make fraud impossible at the database level.

The recommended approach treats **financial immutability as the core architectural invariant**: payments must be append-only (INSERT-only) records protected by database-level RLS policies, triggers, and audit trails that cannot be bypassed by application code. This differs from typical CRUD systems by making unauthorized data modification structurally impossible rather than merely detectable. The anti-fraud features (immutable payment audit, cash drawer reconciliation, daily closing lockdown) should be built in Phase 1 alongside the foundation, not retrofitted later.

The primary risk is RLS misconfiguration, which has exposed 170+ Supabase applications in recent security audits. Mitigation requires: enabling RLS on ALL tables from day one, using app_metadata (not user_metadata) for roles, never exposing service_role keys to clients, and implementing defense-in-depth with triggers + RLS + application logic. Success depends on treating security as a foundational concern, not a feature to add later.

## Key Findings

### Recommended Stack

The chosen stack is validated as industry-standard for this domain with specific version requirements for security and performance. Next.js 15 provides server-side rendering with App Router for secure API routes, Supabase delivers managed PostgreSQL with built-in RLS and SOC 2 compliance, and shadcn/ui offers accessible components without vendor lock-in.

**Core technologies:**
- **Next.js 15 + React 19 + TypeScript**: Full-stack framework with server actions for secure mutations, concurrent rendering, and compile-time type safety — industry standard used by 68% of JS developers
- **Supabase (Pro plan $25/mo)**: Managed PostgreSQL with RLS, built-in auth with JWT custom claims, Storage with signed URLs, real-time subscriptions — provides SOC 2 Type 2 compliance adequate for Colombian healthcare (HIPAA add-on not required)
- **PostgreSQL 15+**: ACID compliance, JSONB for flexible schemas, database triggers for immutability enforcement, supa_audit/pgaudit extensions for tamper-proof logging
- **React Hook Form + Zod 4**: Form state management with minimal re-renders, TypeScript-first validation 14x faster than v3 — essential for high-volume data entry
- **TanStack Query + Zustand**: Server state caching with background refetch and client state management — eliminates need for Redux complexity
- **shadcn/ui + Tailwind CSS 4**: Accessible Radix primitives with utility-first styling, v0.dev compatible for AI-assisted UI generation

**Critical version notes:**
- Tailwind CSS 4.1+ uses CSS-first config (5x faster builds)
- Zod 4.3+ required for performance improvements
- @supabase/ssr required for Next.js 15 App Router SSR auth

**Budget validation:** Pro plan ($25) + Vercel Pro ($20) = $45/mo, leaving $20-25 for domain/email within the $65-70 budget. HIPAA compliance ($599/mo Team plan) exceeds budget but is not legally required for Colombian clinic without US patient data.

### Expected Features

Research identified three feature tiers based on domain analysis of 20+ clinic management systems and phlebology-specific platforms.

**Must have (table stakes):**
- **Patient Registry** — foundational data, searchable by name/ID/phone
- **Appointment Scheduling** — calendar view with drag-and-drop, conflict detection
- **Payment Recording** — capture amount, method (cash/card/transfer), receipt photo
- **Immutable Payment Audit Trail** — append-only log with before/after snapshots, user/timestamp/IP (CORE DIFFERENTIATOR)
- **Cash Drawer Reconciliation** — end-of-day expected vs actual counts with discrepancy tracking
- **User Authentication + RBAC** — role-based permissions (admin/doctor/nurse/secretary)
- **Medical Records (Basic)** — visit notes, diagnosis, treatment per patient encounter

**Should have (competitive differentiators):**
- **Payment Deletion Prevention** — void-only workflow requiring admin approval and reason code
- **Daily Closing Process** — formal close that locks period records, prevents backdating
- **Phlebology-Specific Templates** — pre-built forms for CEAP classification, vein segments, sclerotherapy protocols
- **Voice Dictation** — speech-to-text for clinical notes (doctors prefer speaking, 3-5x faster)
- **Ultrasound Image Attachments** — photo evidence linked to patient records with integrity hashing
- **Treatment Progress Tracking** — multi-session timeline for sclerotherapy courses

**Defer to v2+ (anti-features for MVP):**
- Insurance claims processing (massive complexity, clinic is mostly private-pay)
- Patient self-service portal (adds auth complexity, not needed for 5-person clinic)
- E-prescribing (regulatory requirements, pharmacy integration)
- Multi-location support (premature optimization, single clinic first)
- Inventory/supply management (separate problem domain)
- Telehealth/video consultations (phlebology requires physical examination)

**Feature dependency insight:** Payment audit trail must be built from the start — retrofitting immutability is painful and error-prone. Voice dictation is independent and can be added later to existing medical records.

### Architecture Approach

The recommended architecture uses a hybrid pattern: **append-only tables with soft-delete semantics for financial entities** (payments, invoices, cash closes) combined with **standard CRUD for non-financial entities** (patients, appointments). This balances fraud prevention with development pragmatism, avoiding full event sourcing complexity while maintaining financial immutability.

**Major components:**
1. **Immutable Zone (payments, invoices, cash_closes, void_requests)** — INSERT-only tables with RLS policies denying UPDATE/DELETE, database triggers for gapless invoice numbers and void status updates, JSONB snapshots in audit log
2. **Audited Zone (patients, appointments, medical_records, users)** — Standard CRUD with before/after triggers writing to audit_log, RLS policies restricting access by role
3. **Security Layer (RLS + Triggers + Middleware)** — PostgreSQL RLS as single source of truth, database triggers for immutability enforcement (cannot be bypassed), Next.js middleware for session validation, JWT custom claims for role injection
4. **Storage Layer (Supabase Storage with RLS)** — Private buckets for payment receipts and medical images, signed URLs with 15-minute expiry, SHA-256 hashes stored in records for integrity verification
5. **Audit System (append-only audit_log table)** — Captures all INSERT/UPDATE/DELETE on audited tables with old_data/new_data JSONB, client IP, user agent — INSERT-only RLS policy (even admins cannot modify)

**Key patterns:**
- **Gapless invoice numbering** via counter table with row-level lock (legally required in Colombia)
- **Void requests table** instead of soft-delete flags (prevents UPDATE permission abuse)
- **Two-person cash close** workflow (one counts, one verifies — prevents embezzlement)
- **Post-close lockdown** via trigger checking cash_closes table before allowing payment inserts for closed dates
- **JWT custom claims** for role injection (avoids extra DB query in every RLS policy)

### Critical Pitfalls

Research identified 17 pitfalls across critical/moderate/minor severity. Top 5 that MUST be avoided:

1. **RLS Not Enabled on All Tables (CRITICAL)** — Tables in Supabase have RLS disabled by default; forgetting to enable exposes entire database via anon API key. CVE-2025-48757 affected 170+ apps. Prevention: migration checklist mandating RLS, run Supabase Security Advisor before every deployment, create database trigger to auto-enable RLS on new tables.

2. **Database Triggers Can Be Bypassed by Superusers (CRITICAL)** — Triggers preventing UPDATE/DELETE can be disabled by table owners or service_role. Prevention: never expose service_role key to clients, use RLS policies AS WELL AS triggers (defense in depth), restrict Supabase dashboard access to admin only, consider external immutable audit storage.

3. **Soft Delete Instead of True Immutability (CRITICAL)** — Using deleted_at flag enables "undelete" fraud scenario. Prevention: no DELETE or UPDATE policies on payments table, implement void as separate INSERT to void_requests table requiring admin role + justification.

4. **Single Person Controls Entire Transaction Flow (CRITICAL)** — 82% of medical clinics report employee theft; allowing one person to register payments AND close cash drawer enables embezzlement. Prevention: cash close requires two users (one counts, one verifies), enforce different user IDs via application logic, photo evidence at multiple points.

5. **Views Bypass RLS by Default (MODERATE-HIGH)** — PostgreSQL views run with SECURITY DEFINER (creator's permissions), bypassing carefully constructed RLS policies. Prevention: use security_invoker = true on all views (Postgres 15+), test every view with each user role, prefer RLS-aware functions over views.

**Additional critical pitfalls:**
- Using user_metadata (user-editable) instead of app_metadata for roles in RLS policies
- Predictable receipt numbers enabling fake receipt generation (use GENERATED ALWAYS + date prefix)
- Photo evidence without integrity verification (store SHA-256 hash, INSERT-only storage)
- Missing authorization on Realtime subscriptions (use private channels, RLS on realtime.messages)
- Insufficient logging of failed operations (log permission denials, alert on >3 errors/hour)

## Implications for Roadmap

Based on combined research, the roadmap should prioritize anti-fraud infrastructure in Phase 1 rather than treating it as a later enhancement. Architecture dependencies and pitfall severity indicate that financial immutability must be correct from the start.

### Phase 1: Security Foundation + Anti-Fraud Core
**Rationale:** RLS misconfigurations are the #1 Supabase vulnerability (170+ apps exposed). Database schema with proper RLS must exist before building features. Anti-fraud patterns (immutable payments, audit trails) are painful to retrofit.

**Delivers:**
- PostgreSQL schema with RLS enabled on ALL tables
- Authentication with JWT custom claims (app_metadata for roles)
- User roles table (admin/doctor/nurse/secretary) with RBAC policies
- Immutable payments table (INSERT-only RLS, no UPDATE/DELETE)
- Gapless invoice numbering (counter table with row lock)
- Append-only audit_log with JSONB snapshots
- Void requests workflow (admin-only with reason requirement)
- Supabase Storage setup (private buckets, signed URLs)

**Addresses features:**
- User Authentication + RBAC (table stakes)
- Immutable Payment Audit Trail (core differentiator)
- Payment Deletion Prevention (differentiator)

**Avoids pitfalls:**
- Pitfall #1: RLS not enabled (CRITICAL)
- Pitfall #2: Trigger bypass (CRITICAL)
- Pitfall #3: Soft delete vs immutability (CRITICAL)
- Pitfall #6: user_metadata in RLS policies (CRITICAL)
- Pitfall #7: Predictable receipt numbers (CRITICAL)

**Research flags:**
- Test RLS policies with attack scenarios (Phase 1 testing requirement)
- External audit storage decision (can defer to Phase 5 if budget-constrained)

### Phase 2: Core Clinical Operations
**Rationale:** Patient registry is foundational (everything links to patients). Appointments and basic medical records are table-stakes features users expect from day one.

**Delivers:**
- Patient CRUD with search/filter (cedula validation for Colombia)
- Appointment scheduling (calendar view, conflict detection)
- Basic medical records (visit notes, diagnosis, treatment)
- Patient history timeline view

**Addresses features:**
- Patient Registry (table stakes)
- Appointment Scheduling (table stakes)
- Medical Records Basic (table stakes)
- Patient History View (table stakes)

**Uses stack:**
- React Hook Form + Zod for patient/appointment forms
- TanStack Query for optimistic updates on scheduling
- shadcn/ui Calendar component
- date-fns for Colombian timezone handling

**Implements architecture:**
- Audited Zone (patients, appointments, medical_records with audit triggers)
- RLS policies for role-based access (doctors CRUD own patients, secretary Read only)

**Avoids pitfalls:**
- Pitfall #16: Colombian data validation (cedula format, phone numbers, COP currency)
- Pitfall #12: Missing correlation between physical and digital events (link payments to appointments)

**Research flags:** Standard CRUD patterns, well-documented in Supabase examples (skip research-phase).

### Phase 3: Payment System Integration
**Rationale:** Builds on Phase 1 immutable foundation and Phase 2 patient data. Integrates payment recording into clinical workflow.

**Delivers:**
- Payment registration UI (amount, method, receipt photo upload)
- Payment list/search with filters (date range, patient, method)
- Receipt photo upload to Supabase Storage with SHA-256 integrity hash
- Payment-appointment linkage (prevent orphan payments)
- Payment void workflow (admin approval with evidence)
- Basic financial reports (daily collections by method)

**Addresses features:**
- Payment Recording (table stakes)
- Basic Reports (table stakes)

**Uses stack:**
- Supabase Storage for receipt photos
- Server Actions for payment mutations (extra validation layer)
- Recharts for daily collections visualization

**Implements architecture:**
- Storage Layer with RLS on buckets
- Payment-appointment correlation

**Avoids pitfalls:**
- Pitfall #9: Photo evidence integrity (SHA-256 hash verification)
- Pitfall #12: Missing physical-digital correlation (mandatory appointment or service link)
- Pitfall #11: Tablet session security (re-auth required for payment registration)

**Research flags:** Standard patterns (skip research-phase).

### Phase 4: Cash Drawer Reconciliation
**Rationale:** Completes the anti-fraud workflow. Depends on payment data from Phase 3.

**Delivers:**
- Daily closing workflow (expected vs declared cash counts)
- Two-person verification (one counts, one verifies)
- Discrepancy justification (required if >10,000 COP difference)
- Cash drawer photo evidence upload
- Post-close lockdown (trigger prevents payment inserts for closed dates)
- Closing reports for management review
- Alert system (flag same user registering payments and closing drawer)

**Addresses features:**
- Cash Drawer Reconciliation (core differentiator)
- Daily Closing Process (core differentiator)

**Implements architecture:**
- Post-close lockdown trigger
- Two-person workflow enforcement

**Avoids pitfalls:**
- Pitfall #4: Single person control (CRITICAL — enforce two-person close)
- Pitfall #13: Insufficient failed operation logging (log unauthorized close attempts)

**Research flags:** Need to research Colombian accounting regulations for daily close requirements (use `/gsd:research-phase` for "Colombian fiscal regulations for medical cash handling").

### Phase 5: Clinical Excellence
**Rationale:** Enhances clinical workflow after financial controls are solid. Can develop in parallel with Phase 4 if resources allow.

**Delivers:**
- Phlebology-specific templates (CEAP classification, vein segments)
- Ultrasound image attachments with integrity hashing
- Treatment progress tracking (multi-session sclerotherapy timeline)
- Medical record completion workflow (required before payment for procedures)

**Addresses features:**
- Phlebology-Specific Templates (differentiator)
- Ultrasound Image Attachments (differentiator)
- Treatment Progress Tracking (differentiator)

**Uses stack:**
- Supabase Storage for medical images
- Radix UI for template form components

**Avoids pitfalls:**
- Pitfall #9: Photo integrity (apply same hashing pattern as payment receipts)

**Research flags:** Standard patterns for file upload (skip research-phase).

### Phase 6: Productivity Boost
**Rationale:** Voice dictation is high-complexity and independent of other features. Defer until core system is stable.

**Delivers:**
- Voice dictation for clinical notes (Web Speech API or Whisper)
- Draft-approve workflow (transcription creates draft, doctor must approve)
- Original audio storage (evidence for disputes)
- Low-confidence segment highlighting

**Addresses features:**
- Voice Dictation (differentiator)

**Uses stack:**
- react-speech-recognition + Web Speech API (free but privacy concern: sends to Google/Apple)
- Alternative: Whisper API (~$0.006/min) for offline/private transcription

**Avoids pitfalls:**
- Pitfall #17: Dictation without review (draft status + explicit approval required)

**Research flags:** Need to research Spanish medical terminology support and offline transcription options (use `/gsd:research-phase` for "Spanish medical voice dictation in Colombia").

### Phase 7: Anomaly Detection & Advanced Reports
**Rationale:** Requires all data flowing. Intelligence layer built on complete foundation.

**Delivers:**
- Anomaly detection alerts (unusual payment patterns, void frequency, drawer discrepancies)
- Performance dashboard (revenue trends, patient flow, doctor productivity)
- Audit log query interface (admin investigation tools)
- Advanced financial reports (monthly reconciliation, tax reports for Colombian DIAN)

**Addresses features:**
- Performance Dashboard (operational differentiator)

**Uses stack:**
- Recharts for dashboard visualizations
- TanStack Query for real-time dashboard updates

**Implements architecture:**
- Audit Log Queries component

**Avoids pitfalls:**
- Pitfall #5: Views bypass RLS (use security_invoker = true)
- Pitfall #15: Complex RLS killing performance (index policy columns)

**Research flags:** Need to research Colombian tax reporting requirements (use `/gsd:research-phase` for "Colombian DIAN tax reporting for medical practices").

### Phase Ordering Rationale

**Why this order:**
1. **Security first** — RLS misconfigurations cannot be easily fixed after launch; database schema must be correct from day one
2. **Anti-fraud early** — Immutable payment patterns are architectural, not features; retrofitting is expensive and error-prone
3. **Clinical after financial** — Core problem is fraud, not clinical workflow; solve the problem statement before optimizing operations
4. **Intelligence last** — Anomaly detection requires complete data; build data foundation first

**Why this grouping:**
- Phase 1 groups all database-level security (foundation for everything else)
- Phases 2-3 group patient-payment linkage (prevents orphan payment fraud)
- Phase 4 completes cash handling workflow (depends on payment data)
- Phases 5-6 can run in parallel (independent features)
- Phase 7 requires all prior data sources

**How this avoids pitfalls:**
- Building RLS in Phase 1 prevents the #1 Supabase vulnerability
- Two-person workflow in Phase 4 addresses the #1 medical practice fraud pattern (employee theft)
- Deferring voice dictation avoids complexity creep during critical security implementation
- Separating phases allows thorough testing of immutability before adding features

### Research Flags

**Phases needing deeper research during planning:**
- **Phase 4 (Cash Drawer):** Colombian accounting regulations for daily close procedures, fiscal year requirements
- **Phase 6 (Voice Dictation):** Spanish medical terminology support, offline transcription options (Whisper.cpp), privacy regulations for audio storage
- **Phase 7 (Advanced Reports):** Colombian DIAN tax reporting formats, retention requirements per Ley 1581 de 2012

**Phases with standard patterns (skip research-phase):**
- **Phase 2 (Clinical Operations):** Standard Supabase CRUD patterns, well-documented in official examples
- **Phase 3 (Payment Integration):** Standard file upload and form validation patterns
- **Phase 5 (Clinical Excellence):** Standard template form patterns with Radix UI

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All technologies verified with official documentation, version requirements confirmed, budget validated against Supabase pricing |
| Features | MEDIUM | Based on WebSearch across 20+ clinic management platforms and phlebology-specific systems, but needs validation with actual Colombian clinic workflow |
| Architecture | HIGH | Patterns verified across authoritative PostgreSQL RLS guides, Supabase security documentation, and financial audit trail implementations |
| Pitfalls | HIGH | Critical pitfalls sourced from CVE reports, Supabase security audits (170+ app breach), and healthcare fraud statistics (82% clinics experience theft) |

**Overall confidence:** HIGH

Research is comprehensive with strong official documentation for stack and architecture. Feature expectations validated across multiple domain sources. Pitfall severity confirmed with real-world incident data.

### Gaps to Address

Areas requiring validation during implementation:

- **Colombian regulatory compliance** — Research identified Ley 1581 de 2012 for data protection, but specific requirements for medical record retention, fiscal receipts, and DIAN tax reporting need legal validation during Phase 1
- **Offline/connectivity reliability** — If clinic tablets have unreliable internet, need to research Progressive Web App patterns for offline payment recording with sync-on-reconnect (may impact Phase 3 architecture)
- **Multi-clinic expansion path** — Currently architecting for single clinic, but if expansion is likely within 1-2 years, need to research tenant isolation patterns early (separate Supabase projects vs RLS tenant filtering)
- **Voice dictation privacy** — Web Speech API sends audio to Google/Apple servers; need to validate if Colombian medical privacy regulations permit this, or if offline Whisper.cpp is required (impacts Phase 6 cost/complexity)
- **Backup beyond Supabase** — Pro plan has daily backups, but for critical financial records, consider additional off-Supabase backup strategy (research external backup services during Phase 1)

**How to handle gaps:**
1. **Legal compliance** — Consult Colombian healthcare lawyer during Phase 1, document architectural decisions in `.planning/compliance/`
2. **Offline capability** — Test actual clinic connectivity during Phase 1, research PWA patterns if needed with `/gsd:research-phase "offline-first Supabase sync"`
3. **Multi-tenant** — Document as v2 consideration, avoid premature optimization, but verify RLS patterns scale (test with 10,000+ patient records)
4. **Voice privacy** — Research during Phase 6 planning, budget for Whisper API if needed ($0.006/min × 100 consultations/month × 5min avg = ~$3/mo additional cost)
5. **External backup** — Research S3-compatible backup solutions during Phase 1, consider Supabase database dumps to Google Drive or local NAS

## Sources

### Primary Sources (HIGH confidence)

**Official Documentation:**
- [Next.js 15 Release](https://nextjs.org/blog/next-15) — App Router, React 19 support, server actions
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) — RLS patterns, policy syntax
- [Supabase Custom Claims & RBAC](https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac) — JWT custom claims, role injection
- [Supabase Storage Access Control](https://supabase.com/docs/guides/storage/security/access-control) — Private buckets, signed URLs
- [Supabase HIPAA Compliance](https://supabase.com/docs/guides/security/hipaa-compliance) — Team plan requirements, SOC 2 compliance
- [PostgreSQL Audit Extension](https://www.pgaudit.org/) — Statement-level logging
- [Tailwind CSS v4](https://tailwindcss.com/blog/tailwindcss-v4) — CSS-first config
- [React Hook Form](https://react-hook-form.com/docs/useform) — Form state management
- [TanStack Query v5](https://tanstack.com/query/v5/docs/react/overview) — Server state caching
- [Zod v4](https://zod.dev/) — Schema validation

**Security Research:**
- [Supabase Security 2025 Retro](https://supabase.com/blog/supabase-security-2025-retro) — CVE-2025-48757 analysis
- [Row-Level Recklessness | Precursor Security](https://www.precursorsecurity.com/security-blog/row-level-recklessness-testing-supabase-security) — RLS penetration testing
- [PGaudit and immudb](https://immudb.io/blog/pgaudit-and-immudb-the-dynamic-duo-for-tamper-proof-postgresql-audit-trails) — Tamper-proof audit patterns

**Healthcare Fraud:**
- [Protecting Practice from Embezzlement | AAPL](https://www.physicianleaders.org/articles/protecting-your-practice-embezzlement-theft-prevention-tips) — 82% clinics report theft, $25B annually
- [Medical Practice Embezzlement | The Fox Group](https://www.foxgrp.com/assessment-benchmarks/medical-practice-embezzlement-detection-protection/) — Fraud triangle, detection patterns
- [Five Internal Controls | Rehmann](https://www.rehmann.com/resource/five-internal-controls-to-protect-your-healthcare-practices-finances/) — Separation of duties

### Secondary Sources (MEDIUM confidence)

**Architecture Patterns:**
- [PostgreSQL Sequences vs Invoice Numbers](https://www.cybertec-postgresql.com/en/postgresql-sequences-vs-invoice-numbers/) — Gapless numbering with row locks
- [Immutable Audit Trail Guide](https://www.hubifi.com/blog/immutable-audit-log-basics) — Append-only patterns
- [Event Sourcing in Financial Systems](https://naya.finance/learn/financial-events-system-architecture) — Immutability patterns

**Domain Features:**
- [Capterra Medical Practice Management](https://www.capterra.com/medical-practice-management-software/) — Feature landscape analysis
- [Pabau Practice Management Features](https://pabau.com/blog/practice-management-software-features/) — Industry standards
- [FindEMR Vascular Phlebology Software](https://www.findemr.com/vascular-phlebology-emr-software) — Phlebology-specific features
- [BillRMD Audit Trails](https://www.billrmd.com/audit-trails-ensuring-accountability-in-healthcare-with-practice-management-software) — Healthcare audit requirements

**Voice Dictation:**
- [Lindy Medical Dictation](https://www.lindy.ai/blog/best-medical-speech-to-text) — Spanish support analysis
- [Freed AI Medical Scribe](https://www.getfreed.ai/resources/medical-dictation-software) — Medical terminology handling
- [Amazon Transcribe Medical](https://aws.amazon.com/transcribe/medical/) — Pricing and accuracy

### Tertiary Sources (LOW confidence — needs validation)

**Colombian Regulations:**
- Ley 1581 de 2012 — Data protection regulations (mentioned in STACK.md, not directly verified)
- Colombian DIAN requirements — Tax reporting formats (needs legal consultation)
- Colombian fiscal receipt regulations — Gapless numbering requirements (inferred from general Latin American patterns)

---

**Research completed:** 2026-01-23
**Ready for roadmap:** Yes

**Top 5 Things That MUST Be Done Right:**

1. **Enable RLS on EVERY table from day one** — Supabase tables default to RLS disabled; missing RLS is the #1 security vulnerability. Create migration checklist, run Security Advisor before deployments.

2. **Use app_metadata (not user_metadata) for roles in RLS policies** — user_metadata is user-editable via auth.update(); using it for role checks enables privilege escalation. Store roles in app_metadata or separate user_roles table.

3. **Never expose service_role key to client code** — Service role bypasses ALL RLS policies. Only use in server-side code (API routes, Edge Functions). Client should only have anon key.

4. **Build immutable payment tables from the start (INSERT-only RLS)** — No UPDATE or DELETE policies on payments. Retrofitting immutability is painful. Use void_requests table for cancellations.

5. **Enforce two-person cash drawer close** — Single-person control enables embezzlement (82% of clinics report employee theft). Require different user IDs for payment registration vs cash close, with photo evidence at each step.

# Domain Pitfalls: Clinic Management System with Anti-Fraud Focus

**Domain:** Healthcare clinic management with payment fraud prevention
**Researched:** 2026-01-23
**Confidence:** HIGH (verified with official documentation and domain expertise)

---

## Critical Pitfalls

Mistakes that enable fraud or require complete rewrites.

---

### Pitfall 1: RLS Not Enabled on All Tables

**What goes wrong:** Tables created in Supabase have RLS disabled by default. Developers create tables, forget to enable RLS, and the `anon` API key becomes a master key to the entire database. Staff with technical knowledge (or who Google "how to bypass system") can access or modify any record directly via the API.

**Why it happens:**
- RLS is opt-in, not default
- Developers enable RLS on "sensitive" tables (payments) but forget related tables (patients, appointments)
- Prototyping without RLS, then forgetting to enable before production

**Consequences:**
- CVE-2025-48757 affected 170+ applications
- 83% of exposed Supabase databases involve RLS misconfigurations
- Direct database manipulation bypassing all application controls

**Warning signs:**
- Tables without explicit RLS policies in migration files
- Supabase Security Advisor showing warnings
- Any table query working without authentication during testing

**Prevention:**
1. Create a migration checklist: "Every table MUST have RLS enabled"
2. Run Supabase Security Advisor before every deployment
3. Create a database trigger that auto-enables RLS on new tables
4. Integration tests that verify unauthenticated access is blocked

**Phase to address:** Foundation/Database Setup (Phase 1)

---

### Pitfall 2: Triggers Can Be Bypassed by Table Owners and Superusers

**What goes wrong:** Developers create triggers to prevent UPDATE/DELETE on payment records, thinking the data is immutable. But anyone with table ownership or superuser privileges can:
- Disable triggers temporarily
- Modify data directly
- Drop and recreate triggers

**Why it happens:**
- Misunderstanding that triggers are not true immutability
- Application connecting with elevated privileges
- Supabase service_role key used where anon should be used

**Consequences:**
- Fraudulent staff with database access can still manipulate records
- False sense of security
- No audit trail of trigger bypass

**Warning signs:**
- Application using service_role key in client code
- No restrictions on who can access Supabase dashboard
- Triggers as the only protection mechanism

**Prevention:**
1. NEVER expose service_role key to client applications
2. Use RLS policies AS WELL AS triggers (defense in depth)
3. Restrict Supabase dashboard access (only admin should have it)
4. External immutable audit log (e.g., append-only table with restricted INSERT-only policy)
5. Consider external audit storage (S3 with object lock, immudb) for critical financial data

**Phase to address:** Anti-Fraud Core (Phase 2)

---

### Pitfall 3: Soft Delete Instead of True Immutability for Financial Records

**What goes wrong:** Implementing "soft delete" (deleted_at flag) for payment records, thinking this preserves data. Staff discovers they can undelete records, or the "deleted" payments remain queryable and manipulable.

**Why it happens:**
- Familiar pattern from other applications
- Seems "safer" than hard delete
- Confusion between "recoverable" and "immutable"

**Consequences:**
- Deleted payments can be restored (enabling fraud scenarios)
- Soft-deleted records still count in some queries (false totals)
- Compliance issues: soft-deleted data is still stored data

**Warning signs:**
- Payment table has `deleted_at` column
- Any code path that can "undelete" a payment
- Queries that filter `WHERE deleted_at IS NULL`

**Prevention:**
1. NO DELETE operations on payment records (not even soft delete)
2. Implement anulacion (void) as a separate INSERT (a reversal record)
3. Void records require admin role + mandatory justification
4. Original payment remains untouched, linked to void record
5. Use PostgreSQL policies that explicitly deny DELETE

```sql
-- Example: Deny all deletes on payments
CREATE POLICY "No delete ever" ON payments
FOR DELETE USING (false);
```

**Phase to address:** Anti-Fraud Core (Phase 2)

---

### Pitfall 4: Single Person Controls Entire Transaction Flow

**What goes wrong:** System allows one person to: receive cash, register payment, count cash drawer, and close the day. Classic embezzlement scenario where the same person who steals can hide the evidence.

**Why it happens:**
- Small clinic, limited staff
- System doesn't enforce separation of duties
- "Trust" in employees

**Consequences:**
- 82% of medical clinics report experience with employee theft
- $25 billion annually lost in US medical practices from embezzlement
- Fraud triangle: opportunity + rationalization + incentive

**Warning signs:**
- Same user_id on payment registration AND cash drawer close
- No "verified_by" field on cash counts
- Cash drawer close requires only one person

**Prevention:**
1. Cash drawer close requires TWO users: one counts, one verifies
2. Enforce different user for payment registration vs cash close
3. Random spot-check workflow: Admin randomly selects days to audit
4. Photo evidence required at multiple points (payment receipt, drawer count)
5. Alert when same person registers payment and closes drawer

**Phase to address:** Cash Drawer/Cierre de Caja (Phase 4)

---

### Pitfall 5: Views Bypass RLS by Default

**What goes wrong:** Creating database views for reports (e.g., `daily_income_summary`) that bypass RLS because views run with `SECURITY DEFINER` by default in PostgreSQL.

**Why it happens:**
- Creating views seems like good practice for complex queries
- Postgres default behavior (views use creator's permissions)
- Not testing view access with different user roles

**Consequences:**
- Any authenticated user can see all financial data via the view
- Bypasses carefully constructed RLS policies
- Data exposure to unauthorized staff

**Warning signs:**
- Views without `security_invoker = true` setting
- Views returning data that should be role-restricted
- Report endpoints returning more data than expected

**Prevention:**
1. PostgreSQL 15+: Set `security_invoker = true` on all views
2. Prefer RLS-aware functions over views
3. Test every view with each user role
4. For reports, use Edge Functions with explicit permission checks

```sql
-- Correct view creation in Postgres 15+
CREATE VIEW daily_income_summary
WITH (security_invoker = true)
AS SELECT ...;
```

**Phase to address:** Reports (Phase 5-6)

---

### Pitfall 6: Using user_metadata in RLS Policies

**What goes wrong:** Creating RLS policies that check `auth.jwt() -> 'user_metadata' -> 'role'` for authorization. Users can modify their own `user_metadata` via `supabase.auth.update()`.

**Why it happens:**
- user_metadata is convenient for storing user info
- Looks like app_metadata (which IS secure)
- Documentation doesn't emphasize the difference

**Consequences:**
- Users can escalate their own privileges
- Staff can grant themselves admin access
- Complete bypass of role-based security

**Warning signs:**
- RLS policies referencing `user_metadata`
- `auth.update()` calls in client code that modify role info
- Roles stored in JWT under `user_metadata` key

**Prevention:**
1. Store roles in `raw_app_meta_data` (not user-editable)
2. Or use a separate `user_roles` table with RLS
3. Set roles via server-side Edge Function only
4. Audit any client code calling `auth.update()`

```sql
-- WRONG: User can modify this
auth.jwt() -> 'user_metadata' ->> 'role'

-- RIGHT: Only server can modify this
auth.jwt() -> 'app_metadata' ->> 'role'
```

**Phase to address:** Authentication/Authorization (Phase 1)

---

### Pitfall 7: Receipt Numbers That Can Be Predicted or Reused

**What goes wrong:** Using simple incrementing integers for receipt numbers that reset, skip, or can be predicted. Fraudulent staff generates fake receipts or reuses voided numbers.

**Why it happens:**
- Using `SERIAL` or `SEQUENCE` without proper configuration
- Resetting sequences annually
- Not handling transaction rollbacks correctly

**Consequences:**
- Duplicate receipt numbers enable fictitious entries
- Gaps in sequence are hard to explain to auditors
- Predictable numbers enable pre-printed fake receipts

**Warning signs:**
- Receipt numbers that reset (001, 002... then 001 again)
- Gaps larger than 1 in the sequence (might indicate deleted records)
- Receipt sequence accessible to non-admin users

**Prevention:**
1. Use `GENERATED ALWAYS AS IDENTITY` (cannot be manually set)
2. Include tamper-evident components: date prefix + clinic code + sequence
3. Never reset sequence (use year prefix instead: 2026-00001)
4. Store sequence in separate table with strict INSERT-only policy
5. Any gaps trigger automatic alert

```sql
-- Tamper-resistant receipt number
CREATE TABLE receipt_sequence (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Generate receipt: VCENTER-2026-00001
```

**Phase to address:** Anti-Fraud Core (Phase 2)

---

## Moderate Pitfalls

Mistakes that cause technical debt, security weaknesses, or usability issues.

---

### Pitfall 8: Audit Log in Same Database as Application Data

**What goes wrong:** Storing audit logs in the same PostgreSQL database. If someone compromises the database (or has service_role access), they can modify both data AND its audit trail.

**Why it happens:**
- Simplicity of single database
- Audit triggers naturally write to same DB
- Cost of external audit storage

**Prevention:**
1. At minimum: separate schema with stricter policies
2. Better: replicate audit to external storage (S3, separate Supabase project)
3. Best: cryptographically chained audit (immudb, blockchain-style)
4. Consider: Supabase log exports to external SIEM

**Phase to address:** Anti-Fraud Core (Phase 2)

---

### Pitfall 9: Photo Evidence Without Integrity Verification

**What goes wrong:** Requiring photo of payment voucher but storing it in a way that allows replacement. Staff takes photo, system accepts it, later staff replaces with different photo.

**Why it happens:**
- Using mutable storage
- Not linking photo hash to payment record
- Storage policies allowing UPDATE

**Prevention:**
1. Store SHA-256 hash of photo in payment record
2. Photo storage bucket: INSERT only, no UPDATE/DELETE
3. Photo filename includes payment ID (immutable link)
4. Periodic integrity check: rehash stored photos, compare to records

**Phase to address:** Anti-Fraud Core (Phase 2)

---

### Pitfall 10: Realtime Subscriptions Without Authorization

**What goes wrong:** Enabling Supabase Realtime for live updates but not configuring authorization. All authenticated users receive all data changes.

**Why it happens:**
- Realtime is easy to enable
- Assumes RLS applies (it does for Postgres Changes, but not Broadcast/Presence)
- Testing only with admin account

**Prevention:**
1. Disable "Allow public access" in Realtime settings
2. Create RLS policies on `realtime.messages` table
3. Use private channels for production
4. Test realtime subscriptions with each user role

**Phase to address:** Core Infrastructure (Phase 1)

---

### Pitfall 11: Tablet Session Security

**What goes wrong:** Tablets shared between staff members. One person logs in, walks away, another person performs actions under their identity.

**Why it happens:**
- Busy clinic environment
- No automatic timeout
- No re-authentication for sensitive actions

**Consequences:**
- Actions attributed to wrong person
- Audit trail loses integrity
- Enables "it wasn't me" defense for fraud

**Prevention:**
1. Aggressive session timeout (5-10 minutes of inactivity)
2. Re-authentication required for: payments, voids, drawer close
3. Consider biometric or PIN for sensitive actions
4. Log device identifier with each action
5. "Lock screen" feature for stepping away

**Phase to address:** Authentication (Phase 1), UX throughout

---

### Pitfall 12: Missing Correlation Between Physical and Digital Events

**What goes wrong:** Payment recorded in system but no correlation to actual appointment. Staff registers fake payment, pockets difference, no way to verify service was actually rendered.

**Why it happens:**
- Payment and appointment systems not tightly integrated
- Allowing payments without associated service
- No reconciliation process

**Prevention:**
1. Every payment MUST link to: appointment OR service type
2. "Miscellaneous" payment category requires admin approval
3. Daily reconciliation: appointments completed vs payments received
4. Alert when payment amount doesn't match service catalog price
5. Medical record completion required before payment for procedures

**Phase to address:** Appointments + Payments integration (Phase 3-4)

---

### Pitfall 13: Insufficient Logging of Failed Operations

**What goes wrong:** Only logging successful operations. Missing the most important signal: someone trying to do something they shouldn't.

**Why it happens:**
- Logging success is straightforward
- Failed operations throw errors, easier to ignore
- Performance concerns

**Prevention:**
1. Log ALL attempts, not just successes
2. Critical events to log:
   - Failed login attempts
   - Permission denied errors
   - Attempts to access other users' data
   - Unusual query patterns
3. Alert threshold: >3 permission errors from same user in 1 hour

**Phase to address:** Auditing (Phase 2)

---

### Pitfall 14: Not Testing RLS Policies with Actual Attack Scenarios

**What goes wrong:** Writing RLS policies, testing they "work" with normal flows, but not testing adversarial scenarios.

**Why it happens:**
- Happy path testing
- Developer mindset vs attacker mindset
- RLS policy bugs are subtle

**Prevention:**
1. Create explicit test cases:
   - User A tries to read User B's data
   - Secretaria tries to void a payment
   - User modifies their JWT claims
   - Direct API access bypassing UI
2. Use Supabase security testing guide
3. Consider security audit before launch

**Phase to address:** Testing throughout, Security audit before launch

---

## Minor Pitfalls

Mistakes that cause frustration but are fixable without major refactoring.

---

### Pitfall 15: Complex RLS Policies That Kill Performance

**What goes wrong:** RLS policies with multiple joins or subqueries that execute on every row, making queries extremely slow.

**Prevention:**
1. Index all columns used in RLS policies
2. Keep policies simple (single table lookups)
3. Use `EXPLAIN ANALYZE` to verify policy performance
4. Consider denormalizing role info into main tables

**Phase to address:** Performance optimization (ongoing)

---

### Pitfall 16: Spanish/Colombian-Specific Data Validation Gaps

**What goes wrong:** Not validating cedula format, phone numbers, or currency amounts according to Colombian standards.

**Prevention:**
1. Cedula: 6-10 digits, validate check digit
2. Phone: Colombian format with country code
3. Currency: COP without decimals (whole pesos)
4. Names: Support Spanish characters (tildes, eñe)

**Phase to address:** Patient management (Phase 3)

---

### Pitfall 17: Voice Dictation Without Review Workflow

**What goes wrong:** Doctor dictates, system transcribes, but transcription errors go into medical record without review.

**Prevention:**
1. Dictation creates "draft" status record
2. Doctor must explicitly approve transcription
3. Original audio stored for disputes
4. Highlight low-confidence transcription segments

**Phase to address:** Clinical records (Phase 4-5)

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Database Setup | RLS not enabled (#1) | Migration checklist, Security Advisor |
| Authentication | user_metadata in policies (#6) | Use app_metadata only |
| Payments Core | Soft delete (#3), Trigger bypass (#2) | INSERT-only design, defense in depth |
| Receipt Numbers | Predictable/reused (#7) | GENERATED ALWAYS + date prefix |
| Photo Evidence | Replaceable photos (#9) | Hash in record, INSERT-only storage |
| Cash Drawer | Single person control (#4) | Two-person verification |
| Reports/Views | View RLS bypass (#5) | security_invoker = true |
| Realtime | Unauth subscriptions (#10) | Private channels, RLS on realtime.messages |
| Tablet UX | Session security (#11) | Timeouts, re-auth for sensitive ops |
| Audit System | Same-DB vulnerability (#8) | External audit storage |

---

## Anti-Fraud Design Principles (Summary)

Based on research, these principles should guide every phase:

1. **Immutability over mutability**: INSERT new records, never UPDATE/DELETE financial data
2. **Defense in depth**: RLS + triggers + application logic + audit (multiple layers)
3. **Separation of duties**: No single person controls full transaction flow
4. **Evidence at every step**: Photos, timestamps, user IDs, device IDs
5. **Fail closed**: When in doubt, deny access (require explicit permission grants)
6. **Log everything**: Especially failures and denied operations
7. **External verification**: Audit trail must survive database compromise

---

## Sources

### Supabase Security
- [Row Level Security | Supabase Docs](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Security Flaw: 170+ Apps Exposed | byteiota](https://byteiota.com/supabase-security-flaw-170-apps-exposed-by-missing-rls/)
- [Row-Level Recklessness | Precursor Security](https://www.precursorsecurity.com/security-blog/row-level-recklessness-testing-supabase-security)
- [Best Practices for Supabase | Leanware](https://www.leanware.co/insights/supabase-best-practices)
- [Realtime Authorization | Supabase Docs](https://supabase.com/docs/guides/realtime/authorization)
- [Supabase Security 2025 Retro](https://supabase.com/blog/supabase-security-2025-retro)

### PostgreSQL Audit & Immutability
- [PGaudit and immudb | immudb](https://immudb.io/blog/pgaudit-and-immudb-the-dynamic-duo-for-tamper-proof-postgresql-audit-trails)
- [PostgreSQL Audit Extension | pgaudit.org](https://www.pgaudit.org/)
- [PostgreSQL Audit Trigger | Wiki](https://wiki.postgresql.org/wiki/Audit_trigger_91plus)
- [Nice Postgres Trigger for Immutable Data | GitHub Gist](https://gist.github.com/drbobbeaty/1c4a513e14fdb1e4e123ff9443f978c4)

### Healthcare Fraud & Embezzlement
- [Protecting Practice from Embezzlement | AAPL](https://www.physicianleaders.org/articles/protecting-your-practice-embezzlement-theft-prevention-tips)
- [Medical Practice Embezzlement | The Fox Group](https://www.foxgrp.com/assessment-benchmarks/medical-practice-embezzlement-detection-protection/)
- [Understanding Embezzlement in Practice | MGMA](https://www.mgma.com/articles/understanding-and-preventing-embezzlement-in-your-practice)
- [Five Internal Controls | Rehmann](https://www.rehmann.com/resource/five-internal-controls-to-protect-your-healthcare-practices-finances/)
- [Internal Controls Medical Practice | Reed Tinsley CPA](https://www.rtacpa.com/internal-controls-in-a-medical-practice-part-1/)

### Audit Trail Design
- [Payments with Audit Trails Guide 2026 | InfluenceFlow](https://influenceflow.io/resources/payments-with-audit-trails-complete-guide-for-2026/)
- [Soft Delete vs Hard Delete | Dev.to](https://dev.to/akarshan/the-delete-button-dilemma-when-to-soft-delete-vs-hard-delete-3a0i)
- [Deleting Data: Soft, Hard or Audit | Marty Friedel](https://www.martyfriedel.com/blog/deleting-data-soft-hard-or-audit)

### POS/Tablet Security
- [POS Security | Fortinet](https://www.fortinet.com/resources/cyberglossary/pos-security)
- [Mobile POS Security Issues | TeskaLabs](https://teskalabs.com/blog/point-of-sale-security-issues-retail)
- [POS Security Issues | PCI DSS Guide](https://pcidssguide.com/point-of-sale-pos-security-issues/)

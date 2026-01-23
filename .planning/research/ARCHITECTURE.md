# Architecture Patterns: Clinic Management with Anti-Fraud

**Domain:** Healthcare clinic management with financial anti-fraud requirements
**Researched:** 2026-01-23
**Overall Confidence:** HIGH (patterns verified across multiple authoritative sources)

## Executive Summary

A clinic management system with strong anti-fraud requirements should be architected around **immutable financial records** as the core invariant. Rather than full event sourcing (which adds significant complexity), the recommended pattern is a **hybrid approach**: use append-only tables with soft-delete semantics for payments/invoices, combined with standard CRUD for non-financial entities (patients, appointments, medical records).

The key insight: **fraud prevention is about making unauthorized changes impossible at the database level**, not just detecting them after the fact. This means Row-Level Security (RLS) policies, database triggers, and carefully designed permissions—not application-level checks that can be bypassed.

---

## Recommended Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           NEXT.JS APPLICATION                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │   UI Layer   │  │  Server      │  │  API Routes  │  │  Middleware │ │
│  │  (React 19)  │  │  Components  │  │  (if needed) │  │  (Auth)     │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬──────┘ │
│         │                 │                 │                 │        │
│         └─────────────────┴─────────────────┴─────────────────┘        │
│                                    │                                    │
│                          SUPABASE CLIENT                               │
└────────────────────────────────────┼────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         SUPABASE PLATFORM                               │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────────────────┐ │
│  │  Supabase Auth  │  │ Supabase Storage│  │  Supabase Realtime       │ │
│  │  - JWT tokens   │  │  - Payment      │  │  - Live updates          │ │
│  │  - Custom claims│  │    receipts     │  │  - Cash register sync    │ │
│  │  - Role in JWT  │  │  - Photos       │  │                          │ │
│  └────────┬────────┘  └────────┬────────┘  └────────────────────────┬─┘ │
│           │                    │                                    │   │
│           ▼                    ▼                                    ▼   │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                     POSTGRESQL DATABASE                          │   │
│  │  ┌─────────────────────────────────────────────────────────────┐ │   │
│  │  │                    ROW-LEVEL SECURITY                       │ │   │
│  │  │  - Admin: full access except deleting payments              │ │   │
│  │  │  - Doctor: read patients, write medical records             │ │   │
│  │  │  - Secretary: register payments, no modifications           │ │   │
│  │  └─────────────────────────────────────────────────────────────┘ │   │
│  │  ┌────────────────┐  ┌────────────────┐  ┌──────────────────────┐│   │
│  │  │ IMMUTABLE ZONE │  │ AUDITED ZONE   │  │   STANDARD ZONE      ││   │
│  │  │ - payments     │  │ - patients     │  │   - service_catalog  ││   │
│  │  │ - invoices     │  │ - appointments │  │   - locations        ││   │
│  │  │ - cash_closes  │  │ - medical_recs │  │   - config           ││   │
│  │  │ - void_requests│  │ - users        │  │                      ││   │
│  │  │ (No UPDATE/DEL)│  │ (With audit)   │  │   (Standard CRUD)    ││   │
│  │  └────────────────┘  └────────────────┘  └──────────────────────┘│   │
│  │  ┌─────────────────────────────────────────────────────────────┐ │   │
│  │  │                      AUDIT LOG TABLE                        │ │   │
│  │  │  - All changes from AUDITED ZONE captured via triggers      │ │   │
│  │  │  - JSONB old_data/new_data for full snapshots               │ │   │
│  │  │  - INSERT-only (no UPDATE/DELETE allowed)                   │ │   │
│  │  └─────────────────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Component Boundaries

| Component | Responsibility | Communicates With | Security Level |
|-----------|---------------|-------------------|----------------|
| **UI Layer** | Render forms, display data, handle user input | Server Components, Client SDK | User-facing |
| **Server Components** | Data fetching, server-side rendering | Supabase Client (anon key) | Protected by RLS |
| **API Routes** | Server-side mutations requiring service role | Supabase Admin Client | Service role (bypasses RLS) |
| **Supabase Auth** | Authentication, JWT generation with custom claims | Database (user roles) | Critical |
| **Supabase Storage** | Photo/receipt storage with RLS | Database (references) | Protected by RLS |
| **PostgreSQL** | All business data, RLS enforcement, audit triggers | All services | Core security |
| **Audit Log** | Immutable record of all changes | Triggered by database | Tamper-proof |

### Component Interaction Rules

1. **UI never talks directly to database** - Always through Supabase client
2. **RLS is the source of truth for permissions** - Application checks are secondary
3. **Financial operations use Server Actions** - Extra validation layer
4. **Storage URLs are signed** - Never expose direct bucket paths
5. **Audit triggers are database-level** - Cannot be bypassed by application code

---

## Data Flow

### Payment Registration Flow (Critical Path)

```
┌─────────┐    ┌───────────┐    ┌────────────┐    ┌───────────────────┐
│Secretary│───▶│  Upload   │───▶│  Create    │───▶│     Database      │
│   UI    │    │   Photo   │    │  Payment   │    │                   │
└─────────┘    └─────┬─────┘    └──────┬─────┘    │  ┌─────────────┐  │
                     │                 │          │  │RLS: Can user│  │
                     ▼                 ▼          │  │insert into  │  │
              ┌─────────────┐   ┌─────────────┐   │  │payments?    │  │
              │  Storage    │   │  Server     │   │  └──────┬──────┘  │
              │  Bucket     │   │  Action     │   │         │         │
              │  (private)  │   │             │   │         ▼         │
              └──────┬──────┘   └──────┬──────┘   │  ┌─────────────┐  │
                     │                 │          │  │TRIGGER:     │  │
                     │                 │          │  │Generate     │  │
                     │                 │          │  │invoice_no   │  │
                     ▼                 ▼          │  └──────┬──────┘  │
              ┌─────────────────────────────────┐ │         │         │
              │     Payment Record Created      │◀┘         │         │
              │  - payment_id (UUID)            │           │         │
              │  - invoice_no (sequential)      │◀──────────┘         │
              │  - receipt_photo_path           │                     │
              │  - created_by (from JWT)        │                     │
              │  - created_at (now())           │                     │
              │  - status: 'active'             │                     │
              └─────────────────────────────────┘                     │
                                                                      │
                           ┌──────────────────────────────────────────┘
                           │
                           ▼
              ┌─────────────────────────────────┐
              │      CANNOT BE MODIFIED         │
              │  - No UPDATE allowed by RLS     │
              │  - No DELETE allowed by RLS     │
              │  - Only void_request creation   │
              └─────────────────────────────────┘
```

### Payment Void Flow (Admin Only)

```
┌───────┐    ┌──────────────┐    ┌────────────────┐    ┌──────────────────┐
│ Admin │───▶│  Create Void │───▶│   RLS Check:   │───▶│  void_requests   │
│  UI   │    │   Request    │    │   user.role    │    │  table INSERT    │
└───────┘    └──────────────┘    │   == 'admin'?  │    └────────┬─────────┘
                     │           └────────────────┘             │
                     │                                          │
                     ▼                                          ▼
              ┌─────────────────┐                    ┌─────────────────────┐
              │  Void Request   │                    │  Original Payment   │
              │  - reason (req) │                    │  status: 'voided'   │
              │  - admin_id     │                    │  (via trigger)      │
              │  - photo (opt)  │                    │  Amount preserved   │
              │  - timestamp    │                    │  History intact     │
              └─────────────────┘                    └─────────────────────┘
```

### Cash Closing Flow

```
┌─────────┐    ┌────────────────┐    ┌─────────────────┐    ┌──────────────┐
│Secretary│───▶│ System sums    │───▶│ Secretary enters│───▶│ Photo upload │
│  UI     │    │ day's payments │    │ physical count  │    │ of cash      │
└─────────┘    │ by method      │    │                 │    └───────┬──────┘
               └───────┬────────┘    └────────┬────────┘            │
                       │                      │                     │
                       ▼                      ▼                     ▼
               ┌───────────────────────────────────────────────────────┐
               │                  CASH CLOSING RECORD                  │
               │  - Expected amounts (from payments)                   │
               │  - Declared amounts (from secretary)                  │
               │  - Discrepancy calculated                             │
               │  - Discrepancy justification (if > threshold)         │
               │  - Photo path                                         │
               │  - Closed by, closed at                               │
               └───────────────────────────────────────────────────────┘
                                       │
                                       ▼
               ┌───────────────────────────────────────────────────────┐
               │          POST-CLOSE LOCKDOWN (via RLS)                │
               │  - Payments for this date: no more inserts allowed    │
               │  - Void requests for closed period: admin + reason    │
               │  - Cash close: no modification ever                   │
               └───────────────────────────────────────────────────────┘
```

### Audit Trail Data Flow

```
Any INSERT/UPDATE/DELETE on audited tables
              │
              ▼
    ┌─────────────────────┐
    │  BEFORE/AFTER       │
    │  Trigger fires      │
    └──────────┬──────────┘
               │
               ▼
    ┌─────────────────────────────────────────────────────────────┐
    │                    AUDIT_LOG INSERT                         │
    │  - id: bigserial                                            │
    │  - table_name: 'patients'                                   │
    │  - record_id: '123e4567-e89b...'                            │
    │  - action: 'UPDATE'                                         │
    │  - old_data: {"name": "Juan", "phone": "123"}               │
    │  - new_data: {"name": "Juan Carlos", "phone": "123"}        │
    │  - changed_by: 'user-uuid-here'                             │
    │  - changed_at: '2026-01-23T10:30:00Z'                       │
    │  - client_ip: '192.168.1.100' (from request headers)        │
    │  - user_agent: 'Mozilla/5.0...'                             │
    └─────────────────────────────────────────────────────────────┘
               │
               ▼
    ┌─────────────────────────────────────────────────────────────┐
    │               AUDIT_LOG is INSERT-ONLY                      │
    │  - No role has UPDATE permission                            │
    │  - No role has DELETE permission                            │
    │  - Even service_role should not modify                      │
    └─────────────────────────────────────────────────────────────┘
```

---

## Database Design Patterns for Immutability

### Pattern 1: Append-Only Payment Table

**Why:** Payments must never be modified or deleted. Period.

```sql
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Sequential invoice number (gapless)
    invoice_number INTEGER NOT NULL UNIQUE,

    -- Core payment data
    patient_id UUID NOT NULL REFERENCES patients(id),
    amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
    payment_method TEXT NOT NULL CHECK (payment_method IN
        ('cash', 'debit_card', 'credit_card', 'transfer', 'nequi')),

    -- Evidence (required for non-cash)
    receipt_photo_path TEXT,

    -- Immutable metadata
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Soft-delete via status
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'voided')),

    -- Constraints
    CONSTRAINT receipt_required_for_non_cash
        CHECK (payment_method = 'cash' OR receipt_photo_path IS NOT NULL)
);

-- CRITICAL: No UPDATE or DELETE allowed via RLS
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Payments are insert-only for authorized users"
    ON payments FOR INSERT
    WITH CHECK (
        auth.uid() IS NOT NULL AND
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_id = auth.uid()
            AND role IN ('admin', 'secretary')
        )
    );

CREATE POLICY "Payments are readable by authenticated users"
    ON payments FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- NO UPDATE POLICY = no updates allowed
-- NO DELETE POLICY = no deletes allowed
```

### Pattern 2: Gapless Invoice Number Generation

**Why:** Sequential invoice numbers with no gaps are legally required in Colombia.

```sql
-- Counter table for gapless sequence
CREATE TABLE invoice_counter (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- Singleton
    last_number INTEGER NOT NULL DEFAULT 0
);

INSERT INTO invoice_counter (id, last_number) VALUES (1, 0);

-- Function to get next invoice number (with row-level lock)
CREATE OR REPLACE FUNCTION next_invoice_number()
RETURNS INTEGER AS $$
DECLARE
    next_num INTEGER;
BEGIN
    -- Row-level lock prevents concurrent access
    UPDATE invoice_counter
    SET last_number = last_number + 1
    WHERE id = 1
    RETURNING last_number INTO next_num;

    RETURN next_num;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-assign invoice number
CREATE OR REPLACE FUNCTION assign_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
    NEW.invoice_number := next_invoice_number();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_assign_invoice_number
    BEFORE INSERT ON payments
    FOR EACH ROW
    EXECUTE FUNCTION assign_invoice_number();
```

**Trade-off:** This serializes payment inserts, but for a clinic with ~50-100 payments/day, this is not a bottleneck.

### Pattern 3: Void Request Table (Soft Delete Pattern)

**Why:** Instead of deleting payments, create a void request that marks the payment as voided.

```sql
CREATE TABLE void_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID NOT NULL REFERENCES payments(id),
    reason TEXT NOT NULL CHECK (length(reason) >= 10),
    evidence_photo_path TEXT,

    requested_by UUID NOT NULL REFERENCES auth.users(id),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Only one void per payment
    UNIQUE(payment_id)
);

-- Only admins can create void requests
ALTER TABLE void_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can create void requests"
    ON void_requests FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_id = auth.uid()
            AND role = 'admin'
        )
    );

-- Trigger to update payment status when voided
CREATE OR REPLACE FUNCTION mark_payment_voided()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE payments SET status = 'voided' WHERE id = NEW.payment_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_mark_payment_voided
    AFTER INSERT ON void_requests
    FOR EACH ROW
    EXECUTE FUNCTION mark_payment_voided();
```

**Important:** The UPDATE to payments.status is done by a TRIGGER, not by a user. The trigger function runs with elevated privileges, but only in response to a void_request insert (which requires admin role).

### Pattern 4: Audit Log with JSONB Snapshots

**Why:** Every change to important tables must be recorded with before/after values.

```sql
CREATE TABLE audit_log (
    id BIGSERIAL PRIMARY KEY,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    old_data JSONB,
    new_data JSONB,
    changed_by UUID REFERENCES auth.users(id),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    client_ip INET,
    user_agent TEXT
);

-- Index for common queries
CREATE INDEX idx_audit_log_table_record ON audit_log(table_name, record_id);
CREATE INDEX idx_audit_log_changed_by ON audit_log(changed_by);
CREATE INDEX idx_audit_log_changed_at ON audit_log(changed_at);

-- CRITICAL: No UPDATE or DELETE on audit_log
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Audit log is append-only"
    ON audit_log FOR INSERT
    WITH CHECK (true); -- Allow all inserts (from triggers)

CREATE POLICY "Audit log readable by admins only"
    ON audit_log FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_id = auth.uid()
            AND role = 'admin'
        )
    );

-- Generic audit trigger function
CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO audit_log (table_name, record_id, action, new_data, changed_by)
        VALUES (TG_TABLE_NAME, NEW.id::TEXT, 'INSERT', to_jsonb(NEW), auth.uid());
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, changed_by)
        VALUES (TG_TABLE_NAME, NEW.id::TEXT, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), auth.uid());
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO audit_log (table_name, record_id, action, old_data, changed_by)
        VALUES (TG_TABLE_NAME, OLD.id::TEXT, 'DELETE', to_jsonb(OLD), auth.uid());
        RETURN OLD;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply to tables that need auditing
CREATE TRIGGER tr_audit_patients
    AFTER INSERT OR UPDATE OR DELETE ON patients
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER tr_audit_appointments
    AFTER INSERT OR UPDATE OR DELETE ON appointments
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
```

### Pattern 5: Cash Closing with Post-Close Lock

**Why:** Once the day is closed, no financial changes should be possible.

```sql
CREATE TABLE cash_closes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    close_date DATE NOT NULL UNIQUE,

    -- Expected totals (calculated from payments)
    expected_cash DECIMAL(12,2) NOT NULL,
    expected_card DECIMAL(12,2) NOT NULL,
    expected_transfer DECIMAL(12,2) NOT NULL,

    -- Declared totals (entered by secretary)
    declared_cash DECIMAL(12,2) NOT NULL,

    -- Discrepancy handling
    discrepancy DECIMAL(12,2) GENERATED ALWAYS AS
        (declared_cash - expected_cash) STORED,
    discrepancy_justification TEXT,

    -- Evidence
    close_photo_path TEXT NOT NULL,

    -- Metadata
    closed_by UUID NOT NULL REFERENCES auth.users(id),
    closed_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Constraint: justification required if discrepancy > threshold
    CONSTRAINT discrepancy_needs_justification
        CHECK (ABS(discrepancy) <= 10000 OR discrepancy_justification IS NOT NULL)
);

-- Payments for a closed date cannot be modified
CREATE OR REPLACE FUNCTION check_date_not_closed()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM cash_closes
        WHERE close_date = DATE(NEW.created_at)
    ) THEN
        RAISE EXCEPTION 'Cannot modify payments for a closed date';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_check_date_not_closed
    BEFORE INSERT ON payments
    FOR EACH ROW
    EXECUTE FUNCTION check_date_not_closed();
```

---

## Role-Based Access Control Implementation

### JWT Custom Claims for Roles

```sql
-- User roles table
CREATE TABLE user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('admin', 'doctor', 'nurse', 'secretary')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id)
);

-- Custom Access Token Hook (configured in Supabase Dashboard)
CREATE OR REPLACE FUNCTION custom_access_token_hook(event JSONB)
RETURNS JSONB AS $$
DECLARE
    user_role TEXT;
BEGIN
    SELECT role INTO user_role
    FROM user_roles
    WHERE user_id = (event->>'user_id')::UUID;

    -- Add role to claims
    event := jsonb_set(
        event,
        '{claims,user_role}',
        COALESCE(to_jsonb(user_role), '"none"'::jsonb)
    );

    RETURN event;
END;
$$ LANGUAGE plpgsql;
```

### Permission Matrix

| Resource | Admin | Doctor | Nurse | Secretary |
|----------|-------|--------|-------|-----------|
| **Payments** | Create, Read, Void | Read own patients | Read | Create, Read |
| **Invoices** | Create, Read | Read own | Read | Create, Read |
| **Void Requests** | Create, Read | - | - | - |
| **Cash Closes** | Create, Read | - | - | Create, Read |
| **Patients** | CRUD | CRUD own | Read | Create, Read, Update |
| **Medical Records** | Read | CRUD own | Read own assigned | Read |
| **Appointments** | CRUD | Read, Update status | Read, Update status | CRUD |
| **Audit Log** | Read | - | - | - |
| **User Management** | CRUD | - | - | - |

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Application-Level Permission Checks Only

**What:** Checking permissions in JavaScript/TypeScript code without RLS.

**Why bad:** Permissions can be bypassed by direct database access, API manipulation, or code bugs.

**Instead:** Use RLS as the single source of truth. Application checks are secondary.

### Anti-Pattern 2: Soft Delete with UPDATE

**What:** Using `UPDATE payments SET deleted = true` for payment cancellation.

**Why bad:** UPDATE permission enables modifying amounts, dates, and other fields.

**Instead:** No UPDATE permission on payments. Void via separate void_requests table.

### Anti-Pattern 3: Using PostgreSQL SERIAL for Invoice Numbers

**What:** Relying on `SERIAL` or `SEQUENCE` for invoice numbers.

**Why bad:** Sequences have gaps (by design) when transactions rollback. Illegal in Colombia.

**Instead:** Use counter table with row-level locking for gapless sequence.

### Anti-Pattern 4: Storing Photos with Predictable URLs

**What:** Storing receipts at `/receipts/{payment_id}.jpg` directly accessible.

**Why bad:** Anyone can guess URLs and access receipts.

**Instead:** Use Supabase Storage with private bucket + signed URLs.

### Anti-Pattern 5: Admin Service Role in Client Code

**What:** Using `SUPABASE_SERVICE_ROLE_KEY` in client-side JavaScript.

**Why bad:** Service role bypasses all RLS. Exposed key = full database access.

**Instead:** Service role only in Server Actions/API routes, never in client bundles.

---

## Suggested Build Order

Based on component dependencies, here is the recommended build sequence:

### Phase 1: Foundation (No external dependencies)
1. **Database Schema** - Core tables with RLS policies
2. **Authentication** - Supabase Auth setup + custom claims hook
3. **Role Management** - User roles table, admin seeding

*Rationale:* Everything depends on auth and base schema. Get this right first.

### Phase 2: Core Data (Depends on Phase 1)
4. **Patient Management** - CRUD with audit triggers
5. **Service Catalog** - Products/services and pricing

*Rationale:* Payments need patients and services. Medical records need patients.

### Phase 3: Anti-Fraud Core (Depends on Phase 2)
6. **Payment System** - Immutable payments, gapless invoice numbers
7. **Storage Integration** - Receipt photo uploads with RLS
8. **Void Request System** - Admin-only void workflow

*Rationale:* This is the critical path. Build and test thoroughly before adding more features.

### Phase 4: Operations (Depends on Phase 3)
9. **Cash Closing** - Daily reconciliation, post-close locks
10. **Audit Log Queries** - Admin dashboard for audit viewing

*Rationale:* Cash closing depends on payment system being complete.

### Phase 5: Clinical Features (Depends on Phase 2)
11. **Appointment System** - Scheduling with constraints
12. **Medical Records** - Clinical documentation, voice transcription

*Rationale:* Can be built in parallel with Phase 4, independent of payments.

### Phase 6: Intelligence (Depends on all above)
13. **Anomaly Detection** - Alerts for suspicious patterns
14. **Reports & Analytics** - Dashboards, financial reports

*Rationale:* Requires all data to be flowing before meaningful reports.

---

## Security Patterns Summary

| Pattern | Implementation | Purpose |
|---------|---------------|---------|
| **RLS as Source of Truth** | All tables have RLS enabled, policies define access | Prevents bypass via direct DB access |
| **Append-Only Financial Tables** | No UPDATE/DELETE policies on payments | Makes fraud impossible, not just detectable |
| **Audit Triggers** | Before/after snapshots in audit_log | Complete history for investigations |
| **Gapless Invoice Numbers** | Counter table with row lock | Legal compliance, prevents manipulation |
| **Signed URLs for Evidence** | Private bucket + createSignedUrl | Photos accessible only with valid token |
| **JWT Custom Claims** | Role injected into access token | RLS can check role without extra queries |
| **Service Role Isolation** | Only in server-side code | Prevents client from bypassing RLS |
| **Post-Close Lockdown** | Trigger checks cash_closes before insert | Prevents backdating payments |

---

## Sources

### Official Documentation (HIGH confidence)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Custom Claims & RBAC](https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac)
- [Supabase Storage Access Control](https://supabase.com/docs/guides/storage/security/access-control)
- [Supabase PGAudit Extension](https://supabase.com/docs/guides/database/extensions/pgaudit)

### Architecture Patterns (MEDIUM-HIGH confidence)
- [PostgreSQL Sequences vs Invoice Numbers](https://www.cybertec-postgresql.com/en/postgresql-sequences-vs-invoice-numbers/)
- [Immutable Audit Trail Guide](https://www.hubifi.com/blog/immutable-audit-log-basics)
- [Event Sourcing in Financial Systems](https://naya.finance/learn/financial-events-system-architecture)
- [PostgreSQL Audit Log Best Practices](https://severalnines.com/blog/postgresql-audit-logging-best-practices/)

### Domain-Specific (MEDIUM confidence)
- [Hospital Management System Guide](https://topflightapps.com/ideas/how-to-develop-a-hospital-management-system/)
- [POS Reconciliation Best Practices](https://www.highradius.com/resources/Blog/sales-reconciliation-process-point-of-sale-best-practices-guide/)
- [Cash Register Discrepancies Prevention](https://apprissretail.com/blog/getting-to-the-bottom-of-register-discrepancies/)

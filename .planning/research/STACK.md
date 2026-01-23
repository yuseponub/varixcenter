# Technology Stack

**Project:** VarixClinic - Phlebology Clinic Management System
**Researched:** 2026-01-23
**Overall Confidence:** HIGH

---

## Executive Summary

The chosen stack (Next.js 15 + React 19 + TypeScript + Supabase + shadcn/ui + Tailwind) is **validated and excellent** for this use case. This document prescribes specific library versions, alternatives considered, and critical warnings.

**Key constraint:** HIPAA compliance via Supabase requires Team plan ($599/month) + HIPAA add-on, which exceeds the $65-70 budget. For a Colombia-based clinic without US patient data, you can operate on Pro plan ($25/month) with strong security practices, but document this architectural decision.

---

## Recommended Stack

### Core Framework

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **Next.js** | 15.5+ | Full-stack React framework | Industry standard (68% JS devs use it), App Router with React 19 support, SSR for SEO, server actions for secure API routes | HIGH |
| **React** | 19.x | UI library | Latest stable, concurrent features, Suspense improvements, included with Next.js 15 | HIGH |
| **TypeScript** | 5.5+ | Type safety | Required for Zod integration, catches bugs at compile time, improves DX | HIGH |

### Database & Backend

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **Supabase** | Latest | BaaS (PostgreSQL, Auth, Storage) | Managed PostgreSQL with RLS, built-in auth, file storage, real-time - all in one. SOC 2 Type 2 compliant | HIGH |
| **PostgreSQL** | 15+ (via Supabase) | Primary database | ACID compliance, JSONB for flexible data, triggers for audit logs, RLS for row-level security | HIGH |

### UI Framework

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **shadcn/ui** | Latest (CLI) | Component library | Not a dependency - copies code into your project. Accessible (Radix primitives), customizable, v0.dev compatible | HIGH |
| **Tailwind CSS** | 4.1+ | Utility CSS | CSS-first config (no tailwind.config.js needed), 5x faster builds, native cascade layers | HIGH |
| **Radix UI** | Latest | Accessible primitives | Underlying shadcn/ui components, handles keyboard nav, focus management, ARIA | HIGH |

### Form Management

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **React Hook Form** | 7.71+ | Form state | Uncontrolled inputs (minimal re-renders), tiny bundle (~9KB), excellent TypeScript support | HIGH |
| **Zod** | 4.3+ | Schema validation | TypeScript-first, 14x faster parsing than v3, tree-shakable, @zod/mini available (~1.9KB) | HIGH |
| **@hookform/resolvers** | 5.x+ | RHF + Zod bridge | Official integration, supports Standard Schema | HIGH |

### State Management

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **TanStack Query** | 5.90+ | Server state | Caching, background refetch, optimistic updates, Suspense support, React 19 compatible | HIGH |
| **Zustand** | 5.x | Client state | ~1KB, hooks-based, no boilerplate, works with concurrent rendering via useSyncExternalStore | HIGH |

### Charts & Data Visualization

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **Recharts** | 3.6+ | Dashboard charts | React-native (not a wrapper), SVG-based, declarative API, 24.8K GitHub stars | HIGH |

**Note:** Recharts is optimal for <100 data points. For dashboards showing monthly/quarterly data, this is perfect. If you need 5000+ points, consider Unovis or ECharts.

### PDF Generation

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **@react-pdf/renderer** | 4.3+ | Medical reports, invoices | React components for PDF, server or browser rendering, 1.4M weekly downloads | HIGH |

**Alternative:** For simple invoice templates, consider **pdfme** (template-based editor) or **jsPDF** (lighter weight).

### Voice Dictation

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **react-speech-recognition** | Latest | Voice notes for doctors | Wraps Web Speech API, provides consistent cross-browser experience | MEDIUM |
| **Web Speech API** | Browser native | Speech-to-text | Free, no API costs, works in Chrome/Edge/Safari. Requires HTTPS | MEDIUM |

**Caveats:**
- Browser-based speech recognition sends audio to Google/Apple servers (privacy consideration)
- For offline/private transcription, would need Whisper API (~$0.006/min) - adds cost
- Test thoroughly on tablets - microphone permissions vary by device

### Date Handling

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **date-fns** | 4.1+ | Date manipulation | Tree-shakable, immutable, TypeScript native, timezone support via @date-fns/tz | HIGH |

### Image Upload & Storage

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **Supabase Storage** | Included | Photo evidence storage | S3-compatible, RLS policies, signed URLs for private access, image optimization CDN | HIGH |

**Pattern for payment evidence photos:**
- Private bucket with RLS
- Organize by: `payments/{payment_id}/{timestamp}.jpg`
- Generate signed URLs (15-minute expiry) for viewing
- Store URL reference in audit log

### Authentication & Security

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **Supabase Auth** | Included | User authentication | Cookie-based SSR auth, email/password, MFA support, integrates with RLS | HIGH |
| **@supabase/ssr** | Latest | Next.js Auth helpers | Server-side session management, middleware protection, auto token refresh | HIGH |

### Audit Logging

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **supa_audit** | PostgreSQL extension | Table change tracking | Built into Supabase, captures INSERT/UPDATE/DELETE with old/new values | HIGH |
| **pgaudit** | PostgreSQL extension | Statement-level logging | For compliance, logs WHO did WHAT and WHEN | HIGH |
| **Custom audit trigger** | SQL function | Immutable payment log | Append-only table, BEFORE trigger prevents UPDATE/DELETE | HIGH |

---

## Supabase Pricing Reality Check

| Plan | Cost | What You Get | Recommendation |
|------|------|--------------|----------------|
| **Free** | $0/mo | 500MB DB, 1GB storage, pauses after 1 week inactivity | Development only |
| **Pro** | $25/mo | 8GB DB, 100GB storage, daily backups, no pause | **Production choice** |
| **Team** | $599/mo | HIPAA add-on available, SSO, SOC 2 reports | US healthcare with PHI |

**For your $65-70 budget:** Pro plan ($25) + Vercel Hobby (free) or Pro ($20) = ~$25-45/month. This leaves room for domain, email, etc.

**HIPAA Note:** Since you're operating in Colombia (not subject to US HIPAA), Pro plan with strong RLS policies and audit logging provides adequate protection. Document this decision in your compliance documentation.

---

## Security Architecture for Anti-Fraud

### Immutable Payment Records

```sql
-- Append-only audit table for payments
CREATE TABLE payment_audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  payment_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('created', 'photo_added', 'verified')),
  old_data JSONB,
  new_data JSONB,
  performed_by UUID NOT NULL REFERENCES auth.users(id),
  performed_at TIMESTAMPTZ DEFAULT now(),
  ip_address INET,
  user_agent TEXT
);

-- Prevent modifications
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit log is immutable. Modifications not allowed.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_update_audit
  BEFORE UPDATE OR DELETE ON payment_audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

-- RLS: Only admins can SELECT, nobody can modify
ALTER TABLE payment_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit log"
  ON payment_audit_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
```

### Photo Evidence Requirements

1. **Capture timestamp** from device (client-side)
2. **Server timestamp** on upload (cannot be faked)
3. **Hash the image** (SHA-256) and store in audit log
4. **Associate with payment** via foreign key
5. **Signed URLs only** - no public access to evidence photos

### RLS Best Practices

```sql
-- CRITICAL: Always wrap auth.uid() in a subselect for performance
CREATE POLICY "Users see own records"
  ON patients FOR SELECT
  TO authenticated
  USING (
    clinic_id IN (
      SELECT clinic_id FROM user_clinics
      WHERE user_id = (SELECT auth.uid())
    )
  );

-- Index the columns used in RLS policies
CREATE INDEX idx_user_clinics_user_id ON user_clinics(user_id);
CREATE INDEX idx_patients_clinic_id ON patients(clinic_id);
```

---

## What NOT to Use

### Deprecated/Avoid

| Technology | Why NOT | Use Instead |
|------------|---------|-------------|
| **Redux** | Overkill boilerplate for this app size, 80% of use cases covered by TanStack Query | Zustand + TanStack Query |
| **Moment.js** | Deprecated, huge bundle (329KB), mutable | date-fns (17KB, tree-shakable) |
| **Lodash** (full) | ES2023+ covers most use cases natively | Native `Object.groupBy()`, array methods, or lodash-es (tree-shake) |
| **jQuery** | Not needed with React | Native DOM APIs |
| **next lint** (deprecated) | Being removed in Next.js 16 | ESLint or Biome directly |
| **Class components** | Legacy pattern | Functional components + hooks |
| **tailwindcss-animate** | Deprecated as of March 2025 | Native Tailwind animations or CSS |
| **localStorage for auth** | XSS vulnerable | Supabase cookie-based auth |
| **getServerSideProps** | Pages Router pattern | App Router Server Components |

### Anti-Patterns to Avoid

| Pattern | Problem | Solution |
|---------|---------|----------|
| RLS with `auth.uid()` on anon role | Security hole | Always check `to authenticated` in policy |
| Public storage bucket for evidence | Anyone can view photos | Private bucket + signed URLs |
| `git commit` payment status | No audit trail | Immutable append-only log |
| Single "admin" role | No separation of duties | Granular roles: receptionist, doctor, accountant, admin |
| Trust client timestamps | Can be manipulated | Server-side `now()` for all critical timestamps |

---

## Installation Commands

```bash
# Core (Next.js 15 creates these)
npx create-next-app@latest varix-clinic --typescript --tailwind --eslint --app --src-dir

# shadcn/ui setup
npx shadcn@latest init

# Forms
npm install react-hook-form zod @hookform/resolvers

# State Management
npm install @tanstack/react-query zustand

# Supabase
npm install @supabase/supabase-js @supabase/ssr

# Charts
npm install recharts

# PDF Generation
npm install @react-pdf/renderer

# Voice (optional)
npm install react-speech-recognition

# Dates
npm install date-fns @date-fns/tz

# Dev Dependencies
npm install -D @tanstack/react-query-devtools
```

---

## Version Summary Table

| Package | Minimum Version | Notes |
|---------|-----------------|-------|
| next | 15.5.0 | App Router, React 19 |
| react | 19.0.0 | Concurrent features |
| typescript | 5.5.0 | Required for Zod 4 |
| tailwindcss | 4.1.0 | CSS-first config |
| react-hook-form | 7.71.0 | Latest security fixes |
| zod | 4.3.0 | Performance improvements |
| @tanstack/react-query | 5.90.0 | React 19 support |
| zustand | 5.0.0 | useSyncExternalStore |
| recharts | 3.6.0 | React 18+ required |
| @react-pdf/renderer | 4.3.0 | Latest stable |
| date-fns | 4.1.0 | Timezone support |
| @supabase/supabase-js | Latest | Auto-updates |
| @supabase/ssr | Latest | Next.js App Router support |

---

## Sources

### Official Documentation (HIGH confidence)
- [Next.js 15 Release](https://nextjs.org/blog/next-15)
- [shadcn/ui + React 19](https://ui.shadcn.com/docs/react-19)
- [Tailwind CSS v4](https://tailwindcss.com/blog/tailwindcss-v4)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Audit Logs](https://github.com/supabase/supa_audit)
- [Supabase HIPAA Compliance](https://supabase.com/docs/guides/security/hipaa-compliance)
- [React Hook Form](https://react-hook-form.com/docs/useform)
- [TanStack Query v5](https://tanstack.com/query/v5/docs/react/overview)
- [Zod v4](https://zod.dev/)
- [Recharts](https://recharts.org/)

### Community Research (MEDIUM confidence)
- [React State Management 2025](https://www.developerway.com/posts/react-state-management-2025)
- [Next.js Authentication 2025](https://getnextkit.com/blog/next-js-authentication-the-complete-2025-guide-with-code)
- [Supabase RLS Best Practices](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv)

---

## Open Questions for Phase Research

1. **Voice dictation offline capability** - If tablet connectivity is unreliable, research Whisper.cpp for local transcription (adds complexity)
2. **Multi-clinic architecture** - If expanding to multiple locations, research tenant isolation patterns early
3. **Backup strategy** - Pro plan has daily backups, but consider additional off-Supabase backup for payment records
4. **Colombian regulations** - Research Colombian health data regulations (Ley 1581 de 2012) for local compliance requirements

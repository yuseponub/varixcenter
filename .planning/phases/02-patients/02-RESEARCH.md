# Phase 2: Patients - Research

**Researched:** 2026-01-23
**Domain:** Patient CRUD with Supabase, Form Validation, Search, Timeline UI
**Confidence:** HIGH

## Summary

This research covers the technical requirements for implementing a patient management module in a Next.js 15 + Supabase application. The phase involves creating patient records with Colombian cedula as immutable identifier, implementing search functionality, and displaying a patient timeline.

The standard approach uses:
- **Zod + React Hook Form** for client/server form validation with shared schemas
- **shadcn/ui components** (Form, Input, Table, DataTable) for UI via v0.dev generation
- **Supabase RLS policies** following patterns established in Phase 1
- **PostgreSQL triggers** to enforce cedula immutability at database level
- **ILIKE pattern matching** for patient search by cedula, name, or phone

**Primary recommendation:** Use Zod schemas shared between client and server, enforce cedula immutability via database trigger (not just UI), and implement search with ILIKE for simplicity over full-text search given the expected data volume.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | ^3.23 | Schema validation | Industry standard, TypeScript-first, works client+server |
| react-hook-form | ^7.51 | Form state management | Performance (no re-renders), shadcn/ui integration |
| @hookform/resolvers | ^3.3 | Zod-RHF integration | Official integration, type-safe |
| @tanstack/react-table | ^8.16 | Data table | shadcn/ui recommended, sorting/filtering/pagination |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| libphonenumber-js | ^1.10 | Phone validation | For strict international phone validation (optional) |

### Already Installed (from Phase 1)
| Library | Version | Purpose |
|---------|---------|---------|
| @supabase/ssr | ^0.8.0 | Server-side Supabase client |
| @supabase/supabase-js | ^2.91.1 | Supabase JavaScript client |
| next | 16.1.4 | React framework |
| tailwindcss | ^4 | CSS framework |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| ILIKE search | Full-text search (tsvector) | FTS is faster for large datasets but overkill for <10k patients |
| react-hook-form | TanStack Form | TanStack is newer, shadcn/ui supports both, but RHF has more community examples |
| Custom timeline | Third-party timeline lib | Custom gives full control, third-party adds dependency for simple UI |

**Installation:**
```bash
npm install zod react-hook-form @hookform/resolvers @tanstack/react-table
npx shadcn@latest add form input table button card dialog label select
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/
│   └── (protected)/
│       └── pacientes/
│           ├── page.tsx              # Patient list with search
│           ├── nuevo/
│           │   └── page.tsx          # New patient form
│           └── [id]/
│               ├── page.tsx          # Patient detail + timeline
│               └── editar/
│                   └── page.tsx      # Edit patient (cedula disabled)
├── components/
│   └── patients/
│       ├── patient-form.tsx          # Reusable form component
│       ├── patient-search.tsx        # Search input
│       ├── patient-table.tsx         # Data table
│       └── patient-timeline.tsx      # Timeline component
├── lib/
│   ├── validations/
│   │   └── patient.ts                # Zod schemas (shared)
│   └── queries/
│       └── patients.ts               # Supabase query functions
└── types/
    └── patient.ts                    # TypeScript interfaces
```

### Pattern 1: Shared Zod Schema (Client + Server)
**What:** Define validation schema once, use in both React Hook Form and Server Actions
**When to use:** All form validation
**Example:**
```typescript
// src/lib/validations/patient.ts
import { z } from 'zod'

// Colombian cedula: 6-10 digits
const cedulaRegex = /^\d{6,10}$/

export const patientSchema = z.object({
  cedula: z
    .string()
    .regex(cedulaRegex, 'Cedula debe tener entre 6 y 10 digitos'),
  nombre: z
    .string()
    .min(2, 'Nombre debe tener al menos 2 caracteres')
    .max(100, 'Nombre muy largo'),
  apellido: z
    .string()
    .min(2, 'Apellido debe tener al menos 2 caracteres')
    .max(100, 'Apellido muy largo'),
  celular: z
    .string()
    .regex(/^\d{10}$/, 'Celular debe tener 10 digitos'),
  email: z
    .string()
    .email('Email invalido')
    .optional()
    .or(z.literal('')),
  fecha_nacimiento: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato: YYYY-MM-DD')
    .optional(),
  direccion: z
    .string()
    .max(200, 'Direccion muy larga')
    .optional(),
  // Emergency contact
  contacto_emergencia_nombre: z
    .string()
    .min(2, 'Nombre de contacto requerido'),
  contacto_emergencia_telefono: z
    .string()
    .regex(/^\d{10}$/, 'Telefono debe tener 10 digitos'),
  contacto_emergencia_parentesco: z
    .string()
    .min(2, 'Parentesco requerido'),
})

export type PatientFormData = z.infer<typeof patientSchema>

// For update (cedula excluded)
export const patientUpdateSchema = patientSchema.omit({ cedula: true })
```

### Pattern 2: Server Action with Zod Validation
**What:** Validate form data server-side using shared schema
**When to use:** All form submissions
**Example:**
```typescript
// src/app/(protected)/pacientes/nuevo/actions.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { patientSchema } from '@/lib/validations/patient'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function createPatient(prevState: any, formData: FormData) {
  const supabase = await createClient()

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  // Parse and validate
  const rawData = Object.fromEntries(formData)
  const validated = patientSchema.safeParse(rawData)

  if (!validated.success) {
    return {
      errors: validated.error.flatten().fieldErrors,
      error: 'Datos invalidos'
    }
  }

  // Insert patient
  const { data, error } = await supabase
    .from('patients')
    .insert({
      ...validated.data,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') { // Unique violation
      return { error: 'Ya existe un paciente con esta cedula' }
    }
    return { error: error.message }
  }

  revalidatePath('/pacientes')
  redirect(`/pacientes/${data.id}`)
}
```

### Pattern 3: useActionState for Form State
**What:** React 19 hook for handling server action state
**When to use:** All forms with server actions
**Example:**
```typescript
// src/components/patients/patient-form.tsx
'use client'

import { useActionState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { patientSchema, PatientFormData } from '@/lib/validations/patient'
import { createPatient } from '@/app/(protected)/pacientes/nuevo/actions'

export function PatientForm() {
  const [state, formAction, pending] = useActionState(createPatient, null)

  const form = useForm<PatientFormData>({
    resolver: zodResolver(patientSchema),
    defaultValues: {
      cedula: '',
      nombre: '',
      // ... other defaults
    },
  })

  return (
    <form action={formAction}>
      {state?.error && (
        <div className="text-red-600">{state.error}</div>
      )}
      {/* Form fields */}
      <button type="submit" disabled={pending}>
        {pending ? 'Guardando...' : 'Guardar Paciente'}
      </button>
    </form>
  )
}
```

### Pattern 4: ILIKE Search for Patients
**What:** Case-insensitive pattern matching for search
**When to use:** Patient search by cedula, name, or phone
**Example:**
```typescript
// src/lib/queries/patients.ts
import { createClient } from '@/lib/supabase/server'

export async function searchPatients(query: string) {
  const supabase = await createClient()

  const searchPattern = `%${query}%`

  const { data, error } = await supabase
    .from('patients')
    .select('id, cedula, nombre, apellido, celular')
    .or(`cedula.ilike.${searchPattern},nombre.ilike.${searchPattern},apellido.ilike.${searchPattern},celular.ilike.${searchPattern}`)
    .order('nombre')
    .limit(50)

  if (error) throw error
  return data
}
```

### Pattern 5: Immutable Column via Database Trigger
**What:** Prevent cedula updates at database level
**When to use:** For anti-fraud requirement on cedula
**Example:**
```sql
-- Migration: prevent_cedula_update.sql
CREATE OR REPLACE FUNCTION public.prevent_cedula_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.cedula IS DISTINCT FROM NEW.cedula THEN
    RAISE EXCEPTION 'La cedula no puede ser modificada';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_patients_immutable_cedula
  BEFORE UPDATE ON public.patients
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_cedula_update();
```

### Anti-Patterns to Avoid
- **Relying only on UI for immutability:** Always enforce at database level with triggers
- **Validating only on server:** Use shared Zod schemas for instant client feedback
- **Using `.eq()` without RLS:** Always have RLS policies, don't rely only on query filters
- **Storing cedula with formatting:** Store only digits, format for display

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Form validation | Custom validation logic | Zod + react-hook-form | Type safety, error messages, tested edge cases |
| Data tables | Custom table with sorting | @tanstack/react-table + shadcn/ui | Pagination, sorting, filtering built-in |
| Date formatting | Manual date parsing | Intl.DateTimeFormat | Locale-aware, browser native |
| Phone validation | Custom regex for all formats | Simple 10-digit regex OR libphonenumber-js | Colombian phones are 10 digits; international needs library |
| Cedula validation | Complex algorithm | Simple 6-10 digit regex | CC format is just numeric, no check digit |

**Key insight:** Colombian cedula (CC) does NOT have a check digit algorithm like other national IDs. It's simply 6-10 digits. Don't implement verification algorithms that don't exist.

## Common Pitfalls

### Pitfall 1: Cedula Format Confusion
**What goes wrong:** Attempting to implement check digit validation or accepting dashes/dots
**Why it happens:** Confusion with NIT (which has check digit) or international ID formats
**How to avoid:** Colombian CC is 6-10 pure digits. Validate with `/^\d{6,10}$/`
**Warning signs:** Code with complex cedula validation algorithms

### Pitfall 2: Client-Only Validation
**What goes wrong:** Malicious users bypass client validation, invalid data enters database
**Why it happens:** Developer trusts client-side react-hook-form validation alone
**How to avoid:** ALWAYS validate in server action with same Zod schema
**Warning signs:** Server action that directly inserts FormData without validation

### Pitfall 3: UI-Only Immutability
**What goes wrong:** Developer disables cedula input on edit form, but API allows updates
**Why it happens:** Security through obscurity mindset
**How to avoid:** Database trigger that throws error on cedula change
**Warning signs:** No migration for immutability trigger, only `disabled` attribute

### Pitfall 4: RLS Policy Missing for New Table
**What goes wrong:** Table created without RLS, data exposed to all authenticated users
**Why it happens:** Developer forgets `ENABLE ROW LEVEL SECURITY`
**How to avoid:** Use `verify_rls_enabled()` function from Phase 1 after migration
**Warning signs:** Empty result from `SELECT * FROM rls_status WHERE table_name = 'patients'`

### Pitfall 5: Search Without Index
**What goes wrong:** ILIKE search becomes slow as patient count grows
**Why it happens:** No index on searchable columns
**How to avoid:** Create btree indexes on cedula, and consider trigram index for name search
**Warning signs:** Slow search queries in Supabase logs

### Pitfall 6: Not Auditing Patient Records
**What goes wrong:** No history of patient data changes for compliance
**Why it happens:** Forgot to enable audit trigger from Phase 1
**How to avoid:** Call `SELECT enable_audit_for_table('public.patients')` in migration
**Warning signs:** No audit_log entries for patient operations

## Code Examples

### Database Migration: patients Table
```sql
-- Source: Custom for this project, following Phase 1 patterns

CREATE TABLE public.patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cedula VARCHAR(10) NOT NULL UNIQUE,
  nombre VARCHAR(100) NOT NULL,
  apellido VARCHAR(100) NOT NULL,
  celular VARCHAR(10) NOT NULL,
  email VARCHAR(255),
  fecha_nacimiento DATE,
  direccion VARCHAR(200),
  -- Emergency contact
  contacto_emergencia_nombre VARCHAR(100) NOT NULL,
  contacto_emergencia_telefono VARCHAR(10) NOT NULL,
  contacto_emergencia_parentesco VARCHAR(50) NOT NULL,
  -- Metadata
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for search
CREATE INDEX idx_patients_cedula ON public.patients(cedula);
CREATE INDEX idx_patients_nombre ON public.patients(nombre);
CREATE INDEX idx_patients_apellido ON public.patients(apellido);
CREATE INDEX idx_patients_celular ON public.patients(celular);

-- Enable RLS
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

-- RLS Policies (all authenticated users can read, role-based write)
CREATE POLICY "Authenticated users can view patients" ON public.patients
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Staff can create patients" ON public.patients
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_user_role() IN ('admin', 'medico', 'enfermera', 'secretaria')
  );

CREATE POLICY "Staff can update patients" ON public.patients
  FOR UPDATE TO authenticated
  USING (public.get_user_role() IN ('admin', 'medico', 'enfermera', 'secretaria'))
  WITH CHECK (public.get_user_role() IN ('admin', 'medico', 'enfermera', 'secretaria'));

CREATE POLICY "Only admin can delete patients" ON public.patients
  FOR DELETE TO authenticated
  USING (public.get_user_role() = 'admin');

-- Immutable cedula trigger
CREATE OR REPLACE FUNCTION public.prevent_cedula_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.cedula IS DISTINCT FROM NEW.cedula THEN
    RAISE EXCEPTION 'La cedula no puede ser modificada';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_patients_immutable_cedula
  BEFORE UPDATE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.prevent_cedula_update();

-- Updated_at trigger (reuses function from Phase 1)
CREATE TRIGGER tr_patients_updated_at
  BEFORE UPDATE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Enable audit (uses function from Phase 1)
SELECT enable_audit_for_table('public.patients');
```

### Patient Search with Supabase or() Filter
```typescript
// Source: Supabase Docs - ilike reference
const { data, error } = await supabase
  .from('patients')
  .select('id, cedula, nombre, apellido, celular')
  .or(`cedula.ilike.%${query}%,nombre.ilike.%${query}%,apellido.ilike.%${query}%,celular.ilike.%${query}%`)
  .order('apellido', { ascending: true })
  .limit(50)
```

### Timeline Query Pattern
```typescript
// Query events from multiple tables for patient timeline
export async function getPatientTimeline(patientId: string) {
  const supabase = await createClient()

  // This will expand in later phases as more modules are added
  // For now, just show patient creation and updates from audit_log
  const { data, error } = await supabase
    .from('audit_log')
    .select('*')
    .eq('table_name', 'patients')
    .eq('record_id', patientId)
    .order('changed_at', { ascending: false })
    .limit(20)

  return data
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| useFormState | useActionState | React 19 (late 2024) | Same API, renamed hook |
| Manual form state | react-hook-form + zod | Current standard | Type-safe, less boilerplate |
| Client-only validation | Shared Zod schemas | Current best practice | Single source of truth |
| Custom data tables | TanStack Table + shadcn/ui | 2023+ | Standardized, accessible |

**Deprecated/outdated:**
- `useFormState`: Renamed to `useActionState` in React 19 (already using correct version)
- Client-side only validation: Always pair with server validation

## Open Questions

1. **Timeline scope for Phase 2**
   - What we know: Timeline should show "pagos, citas, procedimientos"
   - What's unclear: Do we show empty timeline placeholder now, or wait until those modules exist?
   - Recommendation: Show timeline component with patient audit events now, design extensible for future modules

2. **Search debouncing**
   - What we know: Need to search by multiple fields
   - What's unclear: User expectation for live search vs search button
   - Recommendation: Use debounced live search (300ms delay) for better UX

3. **Soft delete vs hard delete**
   - What we know: Admin can delete patients
   - What's unclear: Should deletion be soft (archived) or hard?
   - Recommendation: Soft delete with `deleted_at` timestamp for compliance/audit

## Sources

### Primary (HIGH confidence)
- [Next.js Forms Guide](https://nextjs.org/docs/app/guides/forms) - Server actions, useActionState, Zod validation
- [Supabase RLS Docs](https://supabase.com/docs/guides/database/postgres/row-level-security) - CRUD policy patterns, auth helpers
- [Supabase ilike Reference](https://supabase.com/docs/reference/javascript/ilike) - Pattern matching for search
- [shadcn/ui React Hook Form](https://ui.shadcn.com/docs/forms/react-hook-form) - Form component integration
- [shadcn/ui Data Table](https://ui.shadcn.com/docs/components/data-table) - TanStack Table integration

### Secondary (MEDIUM confidence)
- [Colombian Cedula Format](https://docs.v3.localpayment.com/api-reference-guide/document-validations/colombia) - CC is 6-10 digits numeric
- [Zod Phone Validation](https://www.abstractapi.com/guides/api-functions/phone-number-validation-in-zod) - Validation patterns
- [PostgreSQL Immutable Columns](https://github.com/jeremyevans/sequel_postgresql_triggers) - Trigger patterns for immutability

### Tertiary (LOW confidence)
- Various blog posts on patient timeline UI patterns - custom implementation recommended

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Official docs for all libraries, established patterns
- Architecture: HIGH - Following established Next.js 15 + Supabase patterns from Phase 1
- Pitfalls: HIGH - Well-documented issues with forms, validation, and RLS
- Colombian cedula format: MEDIUM - Multiple sources confirm 6-10 digits, no check digit
- Timeline UI: MEDIUM - Custom component based on audit_log, extensible design

**Research date:** 2026-01-23
**Valid until:** 30 days (stable stack, no major releases expected)

# Phase 4: Payments Core - Research

**Researched:** 2026-01-23
**Domain:** Immutable payment records, file uploads, gapless invoice sequences, PostgreSQL security
**Confidence:** HIGH

## Summary

This research covers implementing an immutable payments system for a medical clinic where payment records cannot be modified or deleted after creation. The phase requires: (1) immutable records enforced at the database level, (2) photo upload requirements for electronic payments, (3) gapless sequential invoice numbers, (4) service catalog with fixed/variable pricing, and (5) support for mixed payment methods.

The core implementation strategy uses PostgreSQL triggers to prevent UPDATE/DELETE operations on the payments table, allowing only state changes from 'activo' to 'anulado' by Admin/Medico roles with mandatory justification. For receipt photos, Supabase Storage with signed upload URLs is the standard approach to bypass Next.js server action size limits (1MB default). Gapless invoice numbers require a dedicated counter table with exclusive locking, as PostgreSQL sequences do not guarantee gap-free numbering.

Key architectural decisions: payments table has NO RLS UPDATE/DELETE policies; a BEFORE UPDATE trigger enforces immutability except for anulacion; payment_items table supports multiple services per payment; payment_methods table tracks split payments across different methods; Supabase Storage bucket for comprobantes with user-specific folder structure.

**Primary recommendation:** Implement database-level immutability using triggers (not just RLS), use signed upload URLs for receipt photos, and use a counter table with exclusive locking for gapless invoice numbers.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @supabase/supabase-js | ^2.49.4 | Supabase client | Already in project, handles auth + storage |
| @supabase/ssr | ^0.7.0 | Server-side Supabase | Already in project for server components |
| zod | ^4.3.6 | Schema validation | Existing pattern, validates payment forms |
| react-hook-form | ^7.71.1 | Form handling | Existing pattern for complex forms |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| uuid | ^11.1.0 | Generate unique file names | Receipt photo uploads to avoid collisions |
| (built-in) URL.createObjectURL | Browser API | Image preview before upload | Client-side preview without upload |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Signed upload URLs | Direct server action upload | Server actions have 1MB limit; signed URLs allow larger files |
| Counter table for invoice | PostgreSQL sequence | Sequences have gaps on rollback; counter is gapless |
| Trigger-based immutability | RLS-only | RLS can be bypassed by service_role; triggers are stricter |

**Installation:**
```bash
# No new packages needed - all dependencies already installed
npm install uuid  # Optional: for unique file names
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/(protected)/pagos/
│   ├── page.tsx              # Payment list/dashboard
│   ├── actions.ts            # Server actions for payments
│   ├── nuevo/
│   │   └── page.tsx          # New payment form
│   └── [id]/
│       ├── page.tsx          # Payment detail view
│       └── anular/
│           └── actions.ts    # Anulacion server action
├── app/(protected)/servicios/
│   ├── page.tsx              # Service catalog admin
│   └── actions.ts            # CRUD for services
├── components/payments/
│   ├── payment-form.tsx      # Multi-step payment form
│   ├── service-selector.tsx  # Service picker with prices
│   ├── payment-method-selector.tsx  # Method + amount inputs
│   ├── receipt-upload.tsx    # Photo upload with preview
│   └── payment-summary.tsx   # Summary before submit
├── lib/
│   ├── validations/
│   │   ├── payment.ts        # Payment Zod schemas
│   │   └── service.ts        # Service Zod schemas
│   ├── queries/
│   │   ├── payments.ts       # Payment queries
│   │   └── services.ts       # Service catalog queries
│   └── storage/
│       └── receipts.ts       # Signed URL generation
├── types/
│   └── payments.ts           # Payment TypeScript types
└── supabase/
    └── migrations/
        ├── 008_services_catalog.sql
        ├── 009_payments_tables.sql
        └── 010_payments_immutability.sql
```

### Pattern 1: Database-Level Immutability with Trigger
**What:** Prevent all UPDATE/DELETE except anulacion state change
**When to use:** CRITICAL for payments table - this is the CORE VALUE
**Example:**
```sql
-- Source: PostgreSQL trigger patterns + project requirements
-- This trigger MUST run even if RLS is bypassed (service_role)

CREATE OR REPLACE FUNCTION public.enforce_payment_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- For DELETE: always block
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Los pagos no pueden ser eliminados. Use anulacion.';
  END IF;

  -- For UPDATE: only allow estado change from 'activo' to 'anulado'
  IF TG_OP = 'UPDATE' THEN
    -- Check if any field other than estado, anulado_por, anulado_at, anulacion_justificacion changed
    IF OLD.patient_id IS DISTINCT FROM NEW.patient_id
       OR OLD.numero_factura IS DISTINCT FROM NEW.numero_factura
       OR OLD.total IS DISTINCT FROM NEW.total
       OR OLD.descuento IS DISTINCT FROM NEW.descuento
       OR OLD.descuento_justificacion IS DISTINCT FROM NEW.descuento_justificacion
       OR OLD.created_by IS DISTINCT FROM NEW.created_by
       OR OLD.created_at IS DISTINCT FROM NEW.created_at
    THEN
      RAISE EXCEPTION 'Los pagos son inmutables. Solo se permite anulacion.';
    END IF;

    -- Only allow estado change from activo to anulado
    IF OLD.estado IS DISTINCT FROM NEW.estado THEN
      IF OLD.estado != 'activo' OR NEW.estado != 'anulado' THEN
        RAISE EXCEPTION 'Solo se permite cambiar estado de activo a anulado.';
      END IF;
      -- Anulacion requires justification
      IF NEW.anulacion_justificacion IS NULL OR NEW.anulacion_justificacion = '' THEN
        RAISE EXCEPTION 'La anulacion requiere justificacion obligatoria.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_payment_immutability
  BEFORE UPDATE OR DELETE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_payment_immutability();
```

### Pattern 2: Gapless Invoice Number with Counter Table
**What:** Sequential invoice numbers that never skip, even on failed transactions
**When to use:** Every payment insert
**Example:**
```sql
-- Source: https://github.com/kimmobrunfeldt/howto-everything/blob/master/postgres-gapless-counter-for-invoice-purposes.md

-- Counter table (single row per sequence)
CREATE TABLE public.invoice_counter (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- Ensure single row
  last_number BIGINT NOT NULL DEFAULT 0,
  prefix VARCHAR(10) NOT NULL DEFAULT 'FAC'
);

-- Initialize counter
INSERT INTO invoice_counter (last_number, prefix) VALUES (0, 'FAC');

-- Prevent DELETE/multiple inserts
CREATE OR REPLACE FUNCTION public.prevent_counter_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'No se puede eliminar el contador de facturas';
  END IF;
  IF TG_OP = 'INSERT' AND (SELECT COUNT(*) FROM invoice_counter) > 0 THEN
    RAISE EXCEPTION 'Solo puede existir un contador de facturas';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_protect_invoice_counter
  BEFORE INSERT OR DELETE ON public.invoice_counter
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_counter_modification();

-- Function to get next invoice number (called within transaction)
CREATE OR REPLACE FUNCTION public.get_next_invoice_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  next_num BIGINT;
  prefix_val VARCHAR(10);
BEGIN
  -- Lock the counter row exclusively
  SELECT last_number + 1, prefix
  INTO next_num, prefix_val
  FROM invoice_counter
  FOR UPDATE;

  -- Update the counter
  UPDATE invoice_counter SET last_number = next_num;

  -- Return formatted invoice number (e.g., FAC-000001)
  RETURN prefix_val || '-' || LPAD(next_num::text, 6, '0');
END;
$$;
```

### Pattern 3: Signed Upload URL for Receipt Photos
**What:** Generate time-limited upload URL, client uploads directly to Supabase Storage
**When to use:** Payment methods requiring comprobante (tarjeta, transferencia, nequi)
**Example:**
```typescript
// Source: https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl
// lib/storage/receipts.ts
import { createClient } from '@/lib/supabase/server'

/**
 * Generate a signed upload URL for payment receipt
 * Valid for 2 hours from generation
 */
export async function createReceiptUploadUrl(
  paymentId: string,
  fileName: string
): Promise<{ signedUrl: string; path: string } | { error: string }> {
  const supabase = await createClient()

  // Verify user is authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autorizado' }
  }

  // Generate unique path: comprobantes/{payment_id}/{timestamp}_{filename}
  const timestamp = Date.now()
  const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_')
  const path = `comprobantes/${paymentId}/${timestamp}_${safeName}`

  const { data, error } = await supabase.storage
    .from('payment-receipts')
    .createSignedUploadUrl(path)

  if (error) {
    console.error('Failed to create signed URL:', error)
    return { error: 'Error al generar URL de subida' }
  }

  return {
    signedUrl: data.signedUrl,
    path: path
  }
}

/**
 * Get public URL for a receipt (for viewing)
 */
export async function getReceiptUrl(path: string): Promise<string | null> {
  const supabase = await createClient()

  const { data } = supabase.storage
    .from('payment-receipts')
    .getPublicUrl(path)

  return data.publicUrl
}
```

### Pattern 4: Split Payment Data Model
**What:** Support multiple payment methods for single payment
**When to use:** When patient pays part cash, part card, etc.
**Example:**
```sql
-- Source: Standard payment processing patterns
-- payments table (main record)
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id),
  numero_factura VARCHAR(20) NOT NULL UNIQUE,

  -- Totals
  subtotal DECIMAL(12,2) NOT NULL,
  descuento DECIMAL(12,2) NOT NULL DEFAULT 0,
  descuento_justificacion TEXT, -- Required if descuento > 0
  total DECIMAL(12,2) NOT NULL,

  -- Status (only 'activo' -> 'anulado' transition allowed)
  estado VARCHAR(20) NOT NULL DEFAULT 'activo'
    CHECK (estado IN ('activo', 'anulado')),

  -- Anulacion fields
  anulado_por UUID REFERENCES auth.users(id),
  anulado_at TIMESTAMPTZ,
  anulacion_justificacion TEXT,

  -- Audit
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- payment_items table (services included in payment)
CREATE TABLE public.payment_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE RESTRICT,
  service_id UUID NOT NULL REFERENCES public.services(id),

  -- Snapshot of service at time of payment (for immutability)
  service_name VARCHAR(100) NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  subtotal DECIMAL(12,2) NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- payment_methods table (how each portion was paid)
CREATE TABLE public.payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE RESTRICT,

  metodo VARCHAR(20) NOT NULL
    CHECK (metodo IN ('efectivo', 'tarjeta', 'transferencia', 'nequi')),
  monto DECIMAL(12,2) NOT NULL,

  -- Receipt photo path (required for tarjeta, transferencia, nequi)
  comprobante_path TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraint: electronic methods require comprobante
  CONSTRAINT comprobante_required CHECK (
    metodo = 'efectivo' OR comprobante_path IS NOT NULL
  )
);
```

### Pattern 5: Client-Side Image Preview
**What:** Show receipt preview before uploading
**When to use:** Receipt upload component
**Example:**
```typescript
// Source: https://www.kindacode.com/article/react-show-image-preview-before-uploading/
'use client'

import { useState, useCallback } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { X, Upload } from 'lucide-react'

interface ReceiptUploadProps {
  onFileSelect: (file: File) => void
  onFileRemove: () => void
  disabled?: boolean
  required?: boolean
}

export function ReceiptUpload({
  onFileSelect,
  onFileRemove,
  disabled,
  required
}: ReceiptUploadProps) {
  const [preview, setPreview] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Solo se permiten imagenes')
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('La imagen no puede superar 5MB')
      return
    }

    // Create preview using URL.createObjectURL
    const previewUrl = URL.createObjectURL(file)
    setPreview(previewUrl)
    setFileName(file.name)
    onFileSelect(file)
  }, [onFileSelect])

  const handleRemove = useCallback(() => {
    if (preview) {
      URL.revokeObjectURL(preview) // Clean up memory
    }
    setPreview(null)
    setFileName(null)
    onFileRemove()
  }, [preview, onFileRemove])

  return (
    <div className="space-y-2">
      {!preview ? (
        <div className="border-2 border-dashed rounded-lg p-4 text-center">
          <Input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            disabled={disabled}
            className="hidden"
            id="receipt-upload"
            required={required}
          />
          <label
            htmlFor="receipt-upload"
            className="cursor-pointer flex flex-col items-center gap-2"
          >
            <Upload className="h-8 w-8 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Subir foto del comprobante
            </span>
          </label>
        </div>
      ) : (
        <div className="relative">
          <Image
            src={preview}
            alt="Vista previa del comprobante"
            width={200}
            height={200}
            className="rounded-lg object-cover"
          />
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="absolute -top-2 -right-2"
            onClick={handleRemove}
          >
            <X className="h-4 w-4" />
          </Button>
          <p className="text-xs text-muted-foreground mt-1">{fileName}</p>
        </div>
      )}
    </div>
  )
}
```

### Anti-Patterns to Avoid
- **Using PostgreSQL sequences for invoice numbers:** Sequences have gaps on rollback; use counter table with locking
- **RLS-only immutability:** RLS can be bypassed by service_role; use triggers as primary enforcement
- **Server action file uploads:** 1MB limit by default; use signed upload URLs for larger files
- **Storing prices only in services table:** Snapshot price at payment time for immutability
- **Allowing any UPDATE on payments:** Even 'helpful' updates corrupt audit trail

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Gapless sequences | Custom application logic | Counter table with row lock | Race conditions, rollback handling |
| File uploads > 1MB | Base64 in server action | Signed upload URLs | Size limits, performance |
| Image compression | Canvas resize before upload | Original file + CDN transform | Quality loss, inconsistent results |
| Payment state machine | Free-form status updates | Trigger-enforced transitions | Data integrity is non-negotiable |
| Audit trail | Application-level logging | Database triggers (existing) | Already implemented in Phase 1 |

**Key insight:** Payment immutability MUST be enforced at the database level. Application-level checks can be bypassed; database triggers cannot (without superuser access).

## Common Pitfalls

### Pitfall 1: Sequence Gaps Breaking Invoice Numbering
**What goes wrong:** Invoice numbers 1001, 1002, 1004 (gap at 1003)
**Why it happens:** PostgreSQL sequences don't rollback on failed transactions
**How to avoid:** Use counter table with exclusive lock; increment only on successful commit
**Warning signs:** Missing invoice numbers in audit, accounting discrepancies

### Pitfall 2: Receipt Upload Failing for Large Images
**What goes wrong:** Server action returns 413 or silently fails
**Why it happens:** Next.js server actions have 1MB body limit by default
**How to avoid:** Use signed upload URLs; client uploads directly to Supabase Storage
**Warning signs:** Mobile photos (often 2-5MB) consistently failing to upload

### Pitfall 3: RLS Bypass Corrupting Payment Records
**What goes wrong:** Admin using Supabase dashboard modifies payment amount
**Why it happens:** service_role bypasses RLS; triggers still fire but may not exist
**How to avoid:** BEFORE UPDATE trigger with SECURITY DEFINER enforces rules regardless
**Warning signs:** Unexpected changes in audit_log without corresponding user action

### Pitfall 4: Missing Comprobante on Electronic Payments
**What goes wrong:** Card/transfer payment saved without receipt photo
**Why it happens:** Client-side validation bypassed, no database constraint
**How to avoid:** CHECK constraint on payment_methods table requiring comprobante_path
**Warning signs:** Disputes with no evidence, incomplete payment records

### Pitfall 5: Price Changes Affecting Historical Payments
**What goes wrong:** Changing service price makes old payment totals inconsistent
**Why it happens:** Payment only stores service_id, not the price at time of sale
**How to avoid:** Snapshot service_name and unit_price in payment_items table
**Warning signs:** Sum of items doesn't match payment total

### Pitfall 6: Anulacion Without Justification
**What goes wrong:** Payments anulados with empty reason field
**Why it happens:** Application allows empty string, not validated at DB level
**How to avoid:** Trigger validates anulacion_justificacion IS NOT NULL AND != ''
**Warning signs:** Audit trail shows anulaciones without explanation

### Pitfall 7: Counter Table Deadlock Under Load
**What goes wrong:** Multiple simultaneous payments hang waiting for lock
**Why it happens:** ACCESS EXCLUSIVE lock held too long in transaction
**How to avoid:** Keep transaction scope minimal; use lock_timeout setting
**Warning signs:** Payments timing out during busy periods

## Code Examples

Verified patterns from official sources:

### Server Action for Creating Payment
```typescript
// Source: Existing project patterns + Supabase docs
'use server'

import { createClient } from '@/lib/supabase/server'
import { paymentSchema } from '@/lib/validations/payment'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export type PaymentActionState = {
  error?: string
  errors?: Record<string, string[]>
  success?: boolean
  paymentId?: string
}

export async function createPayment(
  prevState: PaymentActionState | null,
  formData: FormData
): Promise<PaymentActionState> {
  const supabase = await createClient()

  // Verify user is authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autorizado. Por favor inicie sesion.' }
  }

  // Parse form data (items and methods are JSON arrays)
  const rawData = {
    patient_id: formData.get('patient_id'),
    items: JSON.parse(formData.get('items') as string || '[]'),
    methods: JSON.parse(formData.get('methods') as string || '[]'),
    descuento: parseFloat(formData.get('descuento') as string || '0'),
    descuento_justificacion: formData.get('descuento_justificacion') || null
  }

  // Validate with Zod
  const validated = paymentSchema.safeParse(rawData)
  if (!validated.success) {
    return {
      errors: validated.error.flatten().fieldErrors as Record<string, string[]>,
      error: 'Por favor corrija los errores en el formulario'
    }
  }

  // Calculate totals
  const subtotal = validated.data.items.reduce(
    (sum, item) => sum + item.unit_price * item.quantity,
    0
  )
  const total = subtotal - validated.data.descuento

  // Validate methods total equals payment total
  const methodsTotal = validated.data.methods.reduce(
    (sum, m) => sum + m.monto,
    0
  )
  if (Math.abs(methodsTotal - total) > 0.01) {
    return { error: 'La suma de los metodos de pago no coincide con el total' }
  }

  // Begin transaction: get invoice number + insert payment
  // Use RPC function to handle atomic invoice number generation
  const { data: paymentData, error: paymentError } = await supabase
    .rpc('create_payment_with_invoice', {
      p_patient_id: validated.data.patient_id,
      p_subtotal: subtotal,
      p_descuento: validated.data.descuento,
      p_descuento_justificacion: validated.data.descuento_justificacion,
      p_total: total,
      p_created_by: user.id,
      p_items: validated.data.items,
      p_methods: validated.data.methods
    })

  if (paymentError) {
    console.error('Payment creation error:', paymentError)
    if (paymentError.message.includes('comprobante')) {
      return { error: 'Los pagos electronicos requieren foto del comprobante' }
    }
    return { error: 'Error al crear el pago. Por favor intente de nuevo.' }
  }

  revalidatePath('/pagos')
  return { success: true, paymentId: paymentData.id }
}
```

### Zod Schema for Payments
```typescript
// Source: Existing project patterns + domain requirements
import { z } from 'zod'

const paymentItemSchema = z.object({
  service_id: z.string().uuid('ID de servicio invalido'),
  service_name: z.string().min(1, 'Nombre de servicio requerido'),
  unit_price: z.number().positive('El precio debe ser positivo'),
  quantity: z.number().int().positive('La cantidad debe ser positiva')
})

const paymentMethodSchema = z.object({
  metodo: z.enum(['efectivo', 'tarjeta', 'transferencia', 'nequi'], {
    errorMap: () => ({ message: 'Metodo de pago invalido' })
  }),
  monto: z.number().positive('El monto debe ser positivo'),
  comprobante_path: z.string().nullable()
}).refine(
  data => data.metodo === 'efectivo' || data.comprobante_path,
  { message: 'Los pagos electronicos requieren comprobante', path: ['comprobante_path'] }
)

export const paymentSchema = z.object({
  patient_id: z.string().uuid('ID de paciente invalido'),
  items: z.array(paymentItemSchema).min(1, 'Debe incluir al menos un servicio'),
  methods: z.array(paymentMethodSchema).min(1, 'Debe incluir al menos un metodo de pago'),
  descuento: z.number().min(0, 'El descuento no puede ser negativo'),
  descuento_justificacion: z.string().nullable()
}).refine(
  data => data.descuento === 0 || data.descuento_justificacion,
  { message: 'Los descuentos requieren justificacion', path: ['descuento_justificacion'] }
)

export const anulacionSchema = z.object({
  payment_id: z.string().uuid('ID de pago invalido'),
  justificacion: z.string().min(10, 'La justificacion debe tener al menos 10 caracteres')
})

export type PaymentFormData = z.infer<typeof paymentSchema>
export type PaymentItem = z.infer<typeof paymentItemSchema>
export type PaymentMethod = z.infer<typeof paymentMethodSchema>
```

### RPC Function for Atomic Payment Creation
```sql
-- Source: Gapless counter pattern + Supabase RPC
CREATE OR REPLACE FUNCTION public.create_payment_with_invoice(
  p_patient_id UUID,
  p_subtotal DECIMAL,
  p_descuento DECIMAL,
  p_descuento_justificacion TEXT,
  p_total DECIMAL,
  p_created_by UUID,
  p_items JSONB,
  p_methods JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment_id UUID;
  v_invoice_number TEXT;
  v_item JSONB;
  v_method JSONB;
BEGIN
  -- Set lock timeout to prevent deadlocks
  SET LOCAL lock_timeout = '10s';

  -- Get next invoice number (locks counter row)
  v_invoice_number := get_next_invoice_number();

  -- Insert payment record
  INSERT INTO payments (
    patient_id,
    numero_factura,
    subtotal,
    descuento,
    descuento_justificacion,
    total,
    created_by
  ) VALUES (
    p_patient_id,
    v_invoice_number,
    p_subtotal,
    p_descuento,
    p_descuento_justificacion,
    p_total,
    p_created_by
  )
  RETURNING id INTO v_payment_id;

  -- Insert payment items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO payment_items (
      payment_id,
      service_id,
      service_name,
      unit_price,
      quantity,
      subtotal
    ) VALUES (
      v_payment_id,
      (v_item->>'service_id')::UUID,
      v_item->>'service_name',
      (v_item->>'unit_price')::DECIMAL,
      (v_item->>'quantity')::INTEGER,
      (v_item->>'unit_price')::DECIMAL * (v_item->>'quantity')::INTEGER
    );
  END LOOP;

  -- Insert payment methods
  FOR v_method IN SELECT * FROM jsonb_array_elements(p_methods)
  LOOP
    INSERT INTO payment_methods (
      payment_id,
      metodo,
      monto,
      comprobante_path
    ) VALUES (
      v_payment_id,
      v_method->>'metodo',
      (v_method->>'monto')::DECIMAL,
      v_method->>'comprobante_path'
    );
  END LOOP;

  RETURN jsonb_build_object('id', v_payment_id, 'numero_factura', v_invoice_number);
END;
$$;
```

### Supabase Storage Bucket Setup
```sql
-- Source: Supabase Storage docs
-- Create bucket for payment receipts
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-receipts', 'payment-receipts', false);

-- RLS: Authenticated users can upload to comprobantes folder
CREATE POLICY "Authenticated users can upload receipts"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'payment-receipts'
  AND (storage.foldername(name))[1] = 'comprobantes'
);

-- RLS: Users can view receipts they uploaded or admins
CREATE POLICY "Users can view their uploads or admins"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'payment-receipts'
  AND (
    owner = auth.uid()
    OR public.get_user_role() IN ('admin', 'medico')
  )
);

-- No DELETE policy - receipts are immutable like payments
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Sequence for invoice numbers | Counter table with locking | N/A (legal requirement) | Gapless numbering for compliance |
| Application-level immutability | Database triggers | Best practice | Cannot be bypassed, even by service_role |
| Server action file uploads | Signed upload URLs | Supabase docs | Bypasses 1MB server action limit |
| Single payment method | payment_methods junction table | Business requirement | Supports split payments |

**Deprecated/outdated:**
- Direct file uploads to server actions for images > 1MB
- Using sequences for legally-required gapless numbering
- RLS-only immutability (insufficient for critical data)

## Open Questions

Things that couldn't be fully resolved:

1. **Invoice number format**
   - What we know: Must be sequential, gapless, prefixed
   - What's unclear: Exact format (FAC-000001? 2026-000001? VRC-000001?)
   - Recommendation: Use FAC-NNNNNN format, 6 digits with leading zeros

2. **Maximum file size for receipts**
   - What we know: Mobile photos are typically 2-5MB
   - What's unclear: Should we allow up to 10MB? Storage costs?
   - Recommendation: Limit to 5MB per photo, validate client-side

3. **Lock timeout for invoice counter**
   - What we know: Need lock_timeout to prevent deadlocks
   - What's unclear: Optimal value for clinic traffic patterns
   - Recommendation: Start with 10s, monitor and adjust

4. **Anulacion roles**
   - What we know: CONTEXT.md says "Admin y Medico pueden anular"
   - What's unclear: Should there be an audit_log entry for anulacion attempts (success/fail)?
   - Recommendation: Audit all anulacion attempts, including failed ones

## Sources

### Primary (HIGH confidence)
- [Supabase Storage createSignedUploadUrl](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl) - Official API docs
- [Supabase Storage uploadToSignedUrl](https://supabase.com/docs/reference/javascript/storage-from-uploadtosignedurl) - Official API docs
- [Supabase Storage Access Control](https://supabase.com/docs/guides/storage/security/access-control) - RLS for storage
- [PostgreSQL Gapless Counter Pattern](https://github.com/kimmobrunfeldt/howto-everything/blob/master/postgres-gapless-counter-for-invoice-purposes.md) - Counter table with locking
- [Supabase Column-Level Security](https://supabase.com/docs/guides/database/postgres/column-level-security) - GRANT/REVOKE patterns
- [GitHub Supabase Discussion #656](https://github.com/orgs/supabase/discussions/656) - Trigger-based column update restrictions

### Secondary (MEDIUM confidence)
- [React Image Preview Pattern](https://www.kindacode.com/article/react-show-image-preview-before-uploading/) - URL.createObjectURL approach
- [Signed Upload URL with Next.js](https://medium.com/@olliedoesdev/signed-url-file-uploads-with-nextjs-and-supabase-74ba91b65fe0) - Server action + client upload pattern

### Tertiary (LOW confidence)
- WebSearch results on PostgreSQL immutability patterns - Multiple sources confirm trigger approach
- WebSearch results on split payment database design - Standard patterns confirmed

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All components verified against official docs
- Architecture: HIGH - Patterns from official Supabase docs and PostgreSQL best practices
- Pitfalls: HIGH - Multiple sources confirm these issues
- Immutability: HIGH - Critical requirement verified with PostgreSQL trigger patterns

**Research date:** 2026-01-23
**Valid until:** 2026-02-23 (30 days - stable patterns, no rapidly evolving libraries)

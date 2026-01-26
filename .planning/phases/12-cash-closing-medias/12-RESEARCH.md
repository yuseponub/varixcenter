# Phase 12: Cash Closing Medias - Research

**Researched:** 2026-01-25
**Domain:** Retail cash closing with zero-tolerance reconciliation and date-based lockdown
**Confidence:** HIGH

## Summary

Phase 12 implements a separate cash closing system for the Varix-Medias retail division, completely independent from the clinic's cash closing (Phase 5). The implementation follows proven patterns from Phase 5's cash_closings system but adapts them for medias_sales instead of payments, with stricter zero-tolerance policies (no allowance for discrepancies without justification).

The standard approach reuses established patterns from the codebase:
- Counter table pattern for CIM-000001 sequential numbering (from venta_counter in 021_medias_sales.sql)
- Date-based lockdown trigger (from block_payments_on_closed_day in 015_cash_closings.sql)
- Immutability enforcement with admin-only reopen RPC (from 015_cash_closings.sql)
- Photo evidence requirement (from cierre_photo_path pattern)

**Primary recommendation:** Clone and adapt Phase 5's cash closing architecture (migrations 015-016, components) for medias domain with zero-tolerance validation (any difference != 0 requires justification).

## Standard Stack

The established libraries/tools for cash closing and date lockdown:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| PostgreSQL Triggers | 14+ | Date-based INSERT lockdown | Database-level enforcement prevents circumvention via API or direct SQL |
| plpgsql RPC Functions | 14+ | Atomic closing creation | SECURITY DEFINER with role validation ensures only authorized users can close |
| Single-row Counter Table | Built-in | Gapless sequential numbering | PostgreSQL sequences have gaps on rollback; counter ensures CIM-000001 never skips |
| Supabase Storage | Built-in | Photo evidence storage | Already used for comprobante_path in medias_sale_methods |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| FOR UPDATE Row Locking | Built-in | Prevent counter race conditions | get_next_cierre_number() locks counter row during increment |
| BEFORE INSERT Trigger | Built-in | Block sales on closed dates | Fires before medias_sales INSERT, checks medias_cierres for estado='cerrado' |
| CHECK Constraints | Built-in | Zero-tolerance enforcement | Database-level validation that diferencia != 0 requires justificacion |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Database trigger | Application-level validation | App validation can be bypassed; trigger is foolproof |
| Single counter table | Per-year counters | Single table simpler, CIM- prefix distinguishes from clinic CIE- |
| Zero tolerance | Tolerance threshold ($5) | Business requirement is zero tolerance for retail (unlike clinic's $10k) |

**Installation:**
No new npm packages required. All functionality uses PostgreSQL built-ins and existing Supabase client.

## Architecture Patterns

### Recommended Project Structure
```
supabase/migrations/
├── 024_medias_cierres.sql          # Counter, table, immutability trigger, lockdown trigger
├── 025_medias_cierre_rpc.sql       # get_summary, create_cierre, reopen_cierre RPCs
src/
├── types/medias/
│   └── cierres.ts                   # TypeScript types matching DB schema
├── lib/queries/medias/
│   └── cierres.ts                   # Query functions (getCierres, getCierreSummary)
├── lib/validations/medias/
│   └── cierre.ts                    # Zod schemas for form validation
├── app/(protected)/medias/cierres/
│   ├── page.tsx                     # List of closings with filters
│   ├── nuevo/page.tsx               # New closing form
│   └── actions.ts                   # Server actions (createCierre, reopenCierre)
├── components/medias/cierres/
│   ├── cierre-form.tsx              # Main closing form with summary
│   ├── cierre-summary-card.tsx      # Expected totals breakdown
│   ├── cierre-photo-upload.tsx      # Photo evidence upload (reuse from clinic)
│   └── reopen-dialog.tsx            # Admin-only reopen with justification
```

### Pattern 1: Independent Counter Table (CIM- vs CIE-)
**What:** Separate counter table for medias closings with prefix 'CIM' (Cierre Medias)
**When to use:** When multiple independent numbering sequences exist (clinic=CIE, medias=CIM)
**Example:**
```sql
-- Source: Adapted from 015_cash_closings.sql closing_counter
CREATE TABLE public.medias_cierre_counter (
  id INTEGER PRIMARY KEY DEFAULT 1,
  last_number BIGINT NOT NULL DEFAULT 0,
  prefix VARCHAR(10) NOT NULL DEFAULT 'CIM',
  CONSTRAINT medias_cierre_single_row CHECK (id = 1)
);

INSERT INTO public.medias_cierre_counter (id, last_number, prefix)
VALUES (1, 0, 'CIM');

-- Protection trigger (same as closing_counter)
CREATE TRIGGER tr_protect_medias_cierre_counter
  BEFORE INSERT OR DELETE ON public.medias_cierre_counter
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_cierre_counter(); -- Reuse existing function
```

### Pattern 2: Zero-Tolerance Constraint (Stricter than Clinic)
**What:** Database CHECK constraint enforces justification for ANY difference (no threshold)
**When to use:** Retail scenarios where every cent must be accounted for
**Example:**
```sql
-- Source: Adapted from 015_cash_closings.sql diferencia_requires_justificacion
-- CLINIC VERSION (Phase 5): Tolerance of $10,000 COP
CONSTRAINT diferencia_requires_justificacion CHECK (
  ABS(diferencia) <= 10000 OR
  (diferencia_justificacion IS NOT NULL AND LENGTH(TRIM(diferencia_justificacion)) >= 10)
)

-- MEDIAS VERSION (Phase 12): ZERO tolerance
CONSTRAINT diferencia_requires_justificacion CHECK (
  diferencia = 0 OR
  (diferencia_justificacion IS NOT NULL AND LENGTH(TRIM(diferencia_justificacion)) >= 10)
)
```

### Pattern 3: Date-Based Sales Lockdown Trigger
**What:** BEFORE INSERT trigger on medias_sales blocks inserts for closed dates
**When to use:** Prevent post-closing data entry that would invalidate closing totals
**Example:**
```sql
-- Source: Adapted from 015_cash_closings.sql block_payments_on_closed_day
CREATE OR REPLACE FUNCTION public.block_medias_sales_on_closed_day()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_sale_date DATE;
  v_closing_exists BOOLEAN;
BEGIN
  -- Get the date of the sale (using created_at)
  v_sale_date := DATE(NEW.created_at);

  -- Check if there's a closed cierre for this date
  SELECT EXISTS (
    SELECT 1 FROM public.medias_cierres
    WHERE fecha_cierre = v_sale_date
    AND estado = 'cerrado'
  ) INTO v_closing_exists;

  IF v_closing_exists THEN
    RAISE EXCEPTION 'No se pueden crear ventas en un dia cerrado (%). El cierre debe reabrirse primero.', v_sale_date;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_block_medias_sales_on_closed_day
  BEFORE INSERT ON public.medias_sales
  FOR EACH ROW
  EXECUTE FUNCTION public.block_medias_sales_on_closed_day();
```

### Pattern 4: Totals Calculation from Sale Methods (Not Sale Header)
**What:** Calculate expected totals by querying medias_sale_methods (payment breakdown)
**When to use:** Sales support split payments (efectivo + tarjeta), must aggregate by method
**Example:**
```sql
-- Source: Adapted from 016_cash_closing_rpc.sql get_closing_summary
-- CRITICAL: Query medias_sale_methods (not medias_sales.total) to get method breakdown
SELECT
  COALESCE(SUM(CASE WHEN msm.metodo = 'efectivo' THEN msm.monto ELSE 0 END), 0) as total_efectivo,
  COALESCE(SUM(CASE WHEN msm.metodo = 'tarjeta' THEN msm.monto ELSE 0 END), 0) as total_tarjeta,
  COALESCE(SUM(CASE WHEN msm.metodo = 'transferencia' THEN msm.monto ELSE 0 END), 0) as total_transferencia,
  COALESCE(SUM(CASE WHEN msm.metodo = 'nequi' THEN msm.monto ELSE 0 END), 0) as total_nequi
FROM public.medias_sales ms
JOIN public.medias_sale_methods msm ON msm.sale_id = ms.id
WHERE DATE(ms.created_at) = p_fecha
AND ms.estado = 'activo';
```

### Pattern 5: Admin-Only Reopen with Audit Trail
**What:** Only admin role can transition estado from 'cerrado' to 'reabierto' via RPC
**When to use:** Reopening closed periods for corrections while maintaining accountability
**Example:**
```sql
-- Source: 016_cash_closing_rpc.sql reopen_cash_closing
CREATE OR REPLACE FUNCTION public.reopen_medias_cierre(
  p_cierre_id UUID,
  p_justificacion TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_role TEXT;
BEGIN
  -- Check user role (only admin can reopen)
  SELECT role INTO v_user_role
  FROM public.user_roles
  WHERE user_id = auth.uid();

  IF v_user_role != 'admin' THEN
    RAISE EXCEPTION 'Solo Admin puede reabrir cierres de caja';
  END IF;

  -- Validate justification (minimum 10 characters)
  IF LENGTH(TRIM(p_justificacion)) < 10 THEN
    RAISE EXCEPTION 'La justificacion debe tener al menos 10 caracteres';
  END IF;

  -- Update estado to 'reabierto' with audit fields
  UPDATE public.medias_cierres
  SET
    estado = 'reabierto',
    reopened_by = auth.uid(),
    reopen_justificacion = TRIM(p_justificacion),
    reopened_at = now()
  WHERE id = p_cierre_id;

  RETURN jsonb_build_object('success', true);
END;
$$;
```

### Anti-Patterns to Avoid
- **Calculating totals from medias_sales.total:** Misses payment method breakdown. Always aggregate from medias_sale_methods.
- **Application-level date lockdown:** Can be bypassed. Use database trigger on medias_sales table.
- **Allowing NULL in conteo_fisico:** Physical count is always required for closing. NOT NULL constraint enforces this.
- **Using UPDATE to change cierre totals:** Core fields are immutable. Trigger blocks UPDATE of totals, fecha, numero.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sequential numbering without gaps | Application-level counter with lastNumber query | Single-row counter table with FOR UPDATE lock | Race conditions cause duplicates; database lock is atomic |
| Date-based operation blocking | Check in RPC before INSERT | BEFORE INSERT trigger on medias_sales | RPC can be bypassed by direct SQL; trigger is foolproof |
| Photo upload for evidence | Custom file handling | Existing ReceiptUpload component + Supabase Storage | Already handles signed URLs, file validation, cleanup |
| Calculating cash totals | Loop through sales in TypeScript | SQL aggregation with SUM(CASE WHEN) | Database does aggregation 100x faster than app code |
| Estado transitions | Manual UPDATE statements | Immutability trigger with allowed transitions | Trigger enforces cerrado->reabierto->cerrado only |

**Key insight:** Cash closing reconciliation has complex race conditions (concurrent sales, counter increments, date boundaries). PostgreSQL's ACID guarantees, row-level locking, and trigger system solve these atomically. Custom application logic cannot match database-level safety.

## Common Pitfalls

### Pitfall 1: Forgetting to Block Future Sales After Closing
**What goes wrong:** User closes cash for Jan 25, then backdates a sale's created_at to Jan 25 in SQL.
**Why it happens:** Lockdown trigger only blocks INSERT after closing exists. Admin editing created_at bypasses this.
**How to avoid:**
- Add immutability trigger on medias_sales.created_at (prevent UPDATE of timestamp)
- Validate fecha_cierre <= CURRENT_DATE in create_cierre RPC (can't close future days)
- Audit log tracks all created_at changes for investigation
**Warning signs:** Closing totals don't match when recalculated from sales after closing.

### Pitfall 2: Counting Anulado Sales in Expected Totals
**What goes wrong:** Closing summary includes cancelled sales, making expected total higher than reality.
**Why it happens:** Query forgets `WHERE estado = 'activo'` filter on medias_sales join.
**How to avoid:**
```sql
-- WRONG: Includes cancelled sales
SELECT SUM(msm.monto) FROM medias_sale_methods msm
JOIN medias_sales ms ON ms.id = msm.sale_id
WHERE DATE(ms.created_at) = p_fecha;

-- CORRECT: Only active sales
SELECT SUM(msm.monto) FROM medias_sale_methods msm
JOIN medias_sales ms ON ms.id = msm.sale_id
WHERE DATE(ms.created_at) = p_fecha
AND ms.estado = 'activo';  -- CRITICAL filter
```
**Warning signs:** Expected total includes sales that are marked as anulado.

### Pitfall 3: Not Handling Timezone Boundaries for "Day"
**What goes wrong:** Sale created at 11:50 PM on Jan 25 appears in Jan 26 closing due to UTC conversion.
**Why it happens:** created_at is TIMESTAMPTZ (UTC), but closing uses DATE(created_at) with server timezone.
**How to avoid:**
- Use `DATE(created_at AT TIME ZONE 'America/Bogota')` for Colombia timezone
- OR ensure application always writes created_at in local time before storing
- Document which timezone is canonical for "closing day"
**Warning signs:** Sales created late at night appear in wrong day's closing.

### Pitfall 4: Zero-Tolerance Policy Without Clear UX Warning
**What goes wrong:** User enters physical count with 1 cent difference, form rejects without clear error.
**Why it happens:** Zero-tolerance constraint is stricter than clinic ($10k tolerance). UI doesn't warn.
**How to avoid:**
- Display expected vs. physical count side-by-side with live difference calculation
- Show red alert when diferencia != 0: "DIFERENCIA DETECTADA: Se requiere justificacion"
- Pre-populate justification field when difference exists to guide user
**Warning signs:** Users repeatedly submit form and get "justificacion requerida" errors.

### Pitfall 5: Reusing Clinic's Tolerance Logic
**What goes wrong:** Copy-paste from Phase 5 includes ABS(diferencia) <= 10000 threshold.
**Why it happens:** Phase 5 allows $10,000 COP variance without justification. Medias requires zero tolerance.
**How to avoid:**
- Review all CHECK constraints from 015_cash_closings.sql before adapting
- Change `ABS(diferencia) <= 10000 OR justificacion` to `diferencia = 0 OR justificacion`
- Add comment in migration explaining zero-tolerance policy difference
**Warning signs:** Small cash differences are accepted without justification.

## Code Examples

Verified patterns from codebase analysis:

### Get Next Cierre Number (Gapless Sequential)
```sql
-- Source: 015_cash_closings.sql get_next_closing_number (adapted for medias)
CREATE OR REPLACE FUNCTION public.get_next_medias_cierre_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  next_num BIGINT;
  prefix_val VARCHAR(10);
BEGIN
  -- Lock the counter row exclusively (FOR UPDATE)
  -- This prevents concurrent transactions from getting the same number
  SELECT last_number + 1, prefix
  INTO next_num, prefix_val
  FROM public.medias_cierre_counter
  WHERE id = 1
  FOR UPDATE;

  -- Update the counter atomically
  UPDATE public.medias_cierre_counter
  SET last_number = next_num
  WHERE id = 1;

  -- Return formatted cierre number: CIM-000001
  RETURN prefix_val || '-' || LPAD(next_num::text, 6, '0');
END;
$$;
```

### Create Cierre RPC (Atomic with Validations)
```sql
-- Source: 016_cash_closing_rpc.sql create_cash_closing (adapted for medias)
CREATE OR REPLACE FUNCTION public.create_medias_cierre(
  p_fecha DATE,
  p_conteo_fisico DECIMAL,
  p_diferencia_justificacion TEXT,
  p_cierre_photo_path TEXT,
  p_notas TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cierre_numero TEXT;
  v_total_efectivo DECIMAL(12,2);
  v_diferencia DECIMAL(12,2);
  -- ... other variables
BEGIN
  -- Validate user role (secretaria or admin)
  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'secretaria')
  ) THEN
    RAISE EXCEPTION 'Solo Secretaria y Admin pueden cerrar caja';
  END IF;

  -- Check if closing already exists
  IF EXISTS (
    SELECT 1 FROM medias_cierres WHERE fecha_cierre = p_fecha
  ) THEN
    RAISE EXCEPTION 'Ya existe un cierre para la fecha %', p_fecha;
  END IF;

  -- Calculate totals from medias_sale_methods (NOT medias_sales.total)
  SELECT COALESCE(SUM(CASE WHEN msm.metodo = 'efectivo' THEN msm.monto ELSE 0 END), 0)
  INTO v_total_efectivo
  FROM medias_sales ms
  JOIN medias_sale_methods msm ON msm.sale_id = ms.id
  WHERE DATE(ms.created_at) = p_fecha
  AND ms.estado = 'activo';

  -- Calculate difference
  v_diferencia := p_conteo_fisico - v_total_efectivo;

  -- ZERO TOLERANCE: Any difference requires justification
  IF v_diferencia != 0 THEN
    IF LENGTH(TRIM(p_diferencia_justificacion)) < 10 THEN
      RAISE EXCEPTION 'Diferencia de %. Justificacion requerida (minimo 10 caracteres)', v_diferencia;
    END IF;
  END IF;

  -- Get next cierre number (locks counter)
  v_cierre_numero := get_next_medias_cierre_number();

  -- Insert cierre record
  INSERT INTO medias_cierres (
    cierre_numero, fecha_cierre, total_efectivo,
    conteo_fisico_efectivo, diferencia, diferencia_justificacion,
    cierre_photo_path, closed_by
  ) VALUES (
    v_cierre_numero, p_fecha, v_total_efectivo,
    p_conteo_fisico, v_diferencia, NULLIF(TRIM(p_diferencia_justificacion), ''),
    p_cierre_photo_path, auth.uid()
  );

  RETURN jsonb_build_object('cierre_numero', v_cierre_numero, 'diferencia', v_diferencia);
END;
$$;
```

### Get Closing Summary (Preview Before Closing)
```typescript
// Source: Adapted from 016_cash_closing_rpc.sql get_closing_summary pattern
export async function getMediasCierreSummary(fecha: string) {
  const supabase = await createClient()

  // Call RPC to get calculated totals
  const { data, error } = await supabase.rpc('get_medias_cierre_summary', {
    p_fecha: fecha,
  })

  if (error) throw error

  return data as {
    fecha: string
    total_efectivo: number
    total_tarjeta: number
    total_transferencia: number
    total_nequi: number
    grand_total: number
    sale_count: number
    has_existing_closing: boolean
  }
}
```

### Cierre Form with Live Difference Calculation
```tsx
// Source: Pattern from src/components/cash-closing/closing-form.tsx (clinic)
'use client'

import { useState, useEffect } from 'react'
import { getMediasCierreSummary } from '@/lib/queries/medias/cierres'

export function MediasCierreForm() {
  const [expected, setExpected] = useState(0)
  const [physical, setPhysical] = useState(0)
  const [difference, setDifference] = useState(0)

  // Fetch expected totals on mount
  useEffect(() => {
    async function loadSummary() {
      const summary = await getMediasCierreSummary(selectedDate)
      setExpected(summary.total_efectivo)
    }
    loadSummary()
  }, [selectedDate])

  // Calculate difference live
  useEffect(() => {
    setDifference(physical - expected)
  }, [physical, expected])

  return (
    <div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label>Esperado (Sistema)</label>
          <input value={expected} disabled />
        </div>
        <div>
          <label>Conteo Físico</label>
          <input
            type="number"
            value={physical}
            onChange={(e) => setPhysical(parseFloat(e.target.value))}
          />
        </div>
        <div>
          <label>Diferencia</label>
          <input
            value={difference}
            disabled
            className={difference !== 0 ? 'border-red-500' : ''}
          />
        </div>
      </div>

      {/* CRITICAL: Show justification field when difference != 0 */}
      {difference !== 0 && (
        <div className="mt-4 p-4 border-red-500 border-2 rounded bg-red-50">
          <p className="text-red-700 font-semibold mb-2">
            ⚠️ DIFERENCIA DETECTADA: Se requiere justificación
          </p>
          <textarea
            name="diferencia_justificacion"
            placeholder="Explique la razón de la diferencia (mínimo 10 caracteres)..."
            minLength={10}
            required
          />
        </div>
      )}
    </div>
  )
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Allow small cash variances | Zero-tolerance for all differences | Retail best practice 2020+ | Forces accountability for every cent |
| Application-level date validation | Database trigger on INSERT | PostgreSQL 9.0+ (2010) | Foolproof lockdown, can't bypass via API |
| Sequences for invoice numbering | Counter table with FOR UPDATE | Invoice law compliance needs | Gapless numbering required by tax authorities |
| Photo uploads optional | Photo evidence mandatory | Anti-fraud standard 2022+ | Creates audit trail for disputes |
| Single cash closing for all revenue | Separate closings per department | Multi-department retail | Isolates variances to responsible department |

**Deprecated/outdated:**
- **Allowing UPDATE on closing totals:** Modern systems make closings immutable once created. Reopen if correction needed.
- **Tolerance thresholds for retail:** Clinic may allow $10k variance, but retail requires exact reconciliation.
- **Manual counter increment:** SELECT MAX(id) + 1 has race conditions. Use locked counter table.

## Open Questions

Things that couldn't be fully resolved:

1. **Should medias closings block clinic payments (and vice versa)?**
   - What we know: CIE-08 states "Cierre de caja de Medias es INDEPENDIENTE del cierre de caja de la clinica"
   - What's unclear: Can clinic register payment on Jan 25 after medias closing for Jan 25 is done?
   - Recommendation: Each trigger only blocks its own table (block_medias_sales_on_closed_day only checks medias_cierres, not cash_closings). They are truly independent.

2. **How to handle timezone for "day" boundaries?**
   - What we know: Colombia is GMT-5 (America/Bogota). Sales use TIMESTAMPTZ (UTC).
   - What's unclear: If sale is created at 11:59 PM COT (4:59 AM UTC next day), which day does it belong to?
   - Recommendation: Use `DATE(created_at AT TIME ZONE 'America/Bogota')` in all queries. Document in migration comments.

3. **Can reopened closings be re-closed?**
   - What we know: Phase 5 allows estado transition from 'reabierto' back to 'cerrado'
   - What's unclear: Should re-closing recalculate totals or keep original snapshot?
   - Recommendation: Keep original totals (immutable). Reopen is for corrections to sales, not recalculation. Add note in reopened_at field.

## Sources

### Primary (HIGH confidence)
- `/mnt/c/Users/Usuario/Proyectos/varix-clinic/supabase/migrations/015_cash_closings.sql` - Clinic cash closing schema with counter, immutability, lockdown trigger
- `/mnt/c/Users/Usuario/Proyectos/varix-clinic/supabase/migrations/016_cash_closing_rpc.sql` - get_closing_summary, create_cash_closing, reopen_cash_closing RPCs
- `/mnt/c/Users/Usuario/Proyectos/varix-clinic/supabase/migrations/021_medias_sales.sql` - Venta counter pattern, medias_sale_methods for payment breakdown
- `/mnt/c/Users/Usuario/Proyectos/varix-clinic/supabase/migrations/022_medias_sales_immutability.sql` - Immutability trigger pattern for sales
- `/mnt/c/Users/Usuario/Proyectos/varix-clinic/.planning/REQUIREMENTS-MEDIAS.md` - Requirements CIE-01 through CIE-08 defining zero-tolerance policy

### Secondary (MEDIUM confidence)
- [PostgreSQL Documentation: Trigger Functions](https://www.postgresql.org/docs/current/plpgsql-trigger.html) - Official docs on BEFORE INSERT triggers and NEW/OLD variables
- [PostgreSQL Gapless Counter Pattern](https://github.com/kimmobrunfeldt/howto-everything/blob/master/postgres-gapless-counter-for-invoice-purposes.md) - Counter table with FOR UPDATE locking
- [Cash Handling Best Practices](https://integratedcashlogistics.com/cash-handling-procedures-retail/) - Retail cash drawer variance policies and reconciliation procedures

### Tertiary (LOW confidence)
- [Cash Drawer Variance Policy](https://infusionsoftware.zendesk.com/hc/en-us/articles/360001488996-Cash-Drawer-with-Variance-Distribution-to-Correct-Accounts) - Many retailers allow $1-$5 variance, but medias requires zero tolerance
- [How to Balance Cash Drawers](https://starmicronics.com/blog/how-to-balance-cash-drawers-quickly-and-accurately/) - General retail guidance on comparing POS against physical count

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Reusing proven patterns from Phase 5 clinic closings (migrations 015-016)
- Architecture: HIGH - Direct adaptation of existing cash_closings system with medias-specific tables
- Pitfalls: HIGH - Identified through codebase analysis and comparison of clinic vs. medias requirements
- Zero-tolerance validation: HIGH - Explicitly stated in CIE-04 requirement
- Date lockdown trigger: HIGH - Pattern exists in 015_cash_closings.sql block_payments_on_closed_day

**Research date:** 2026-01-25
**Valid until:** 60 days (stable domain - cash closing patterns change slowly)

---

## Key Differences: Clinic (Phase 5) vs. Medias (Phase 12)

Critical distinctions when adapting Phase 5 patterns:

| Aspect | Clinic (cash_closings) | Medias (medias_cierres) |
|--------|------------------------|-------------------------|
| **Counter prefix** | CIE-000001 | CIM-000001 |
| **Counter table** | closing_counter | medias_cierre_counter |
| **Main table** | cash_closings | medias_cierres |
| **Lockdown trigger** | Blocks payments table INSERT | Blocks medias_sales table INSERT |
| **Totals source** | payments + payment_methods | medias_sales + medias_sale_methods |
| **Tolerance policy** | $10,000 COP allowed without justification | ZERO tolerance (any difference requires justification) |
| **Photo requirement** | cierre_photo_path NOT NULL | cierre_photo_path NOT NULL (same) |
| **Who can close** | Secretaria, Admin | Secretaria, Admin (same) |
| **Who can reopen** | Admin only | Admin only (same) |
| **Independence** | N/A (only one clinic closing) | CIE-08: Completely separate from clinic closings |

**Migration Naming:**
- Phase 5 uses: 015_cash_closings.sql, 016_cash_closing_rpc.sql
- Phase 12 should use: 024_medias_cierres.sql, 025_medias_cierre_rpc.sql (next available numbers)

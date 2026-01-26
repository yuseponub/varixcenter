# Phase 14: Returns Workflow - Research

**Researched:** 2026-01-26
**Domain:** Returns/Refunds workflow with fraud-prevention approval
**Confidence:** HIGH

## Summary

This research documents the patterns needed to implement a returns workflow for medias de compresion (compression stockings). The workflow requires a two-phase approval process for fraud prevention: employees create return requests, and Admin/Medico must approve before stock is affected.

The key technical insight is that returns affect `stock_devoluciones` (NOT `stock_normal`), maintaining separation between new and returned inventory. Cash refunds reduce expected cash in the medias cash closing calculation.

**Primary recommendation:** Follow existing medias sales patterns exactly - create `medias_returns` table with states (pendiente/aprobada/rechazada), RPC function for approval that increments `stock_devoluciones`, and modify `get_medias_cierre_summary` to subtract approved cash refunds from `total_efectivo`.

## Standard Stack

The phase uses the existing codebase stack - no new libraries required.

### Core (Already in Codebase)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 15.x | App Router with Server Actions | Existing pattern |
| Supabase | Latest | PostgreSQL + Auth + Storage | Existing pattern |
| Zod | 3.x | Schema validation | Existing pattern |
| React Hook Form | N/A | Not used - raw useActionState | Codebase pattern |
| Sonner | Latest | Toast notifications | Existing pattern |
| Shadcn/ui | Latest | UI components | Existing pattern |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | Latest | Icons | UI elements |

**Installation:**
No new packages required - all dependencies already installed.

## Architecture Patterns

### Recommended Database Schema

```sql
-- ENUM for return status (reuse pattern from purchases)
CREATE TYPE public.devolucion_estado AS ENUM (
  'pendiente',    -- Created, awaiting approval
  'aprobada',     -- Approved by Admin/Medico, stock affected
  'rechazada'     -- Rejected, no stock affected
);

-- ENUM for refund method
CREATE TYPE public.reembolso_metodo AS ENUM (
  'efectivo',           -- Cash refund (affects cierre)
  'cambio_producto'     -- Product exchange (no cierre impact)
);

-- Main returns table
CREATE TABLE public.medias_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Gapless numbering: DEV-000001
  numero_devolucion VARCHAR(20) NOT NULL UNIQUE,

  -- Link to original sale (REQUIRED)
  sale_id UUID NOT NULL REFERENCES public.medias_sales(id),

  -- Product being returned (from sale_items)
  sale_item_id UUID NOT NULL REFERENCES public.medias_sale_items(id),

  -- Quantity returned (partial returns allowed)
  cantidad INTEGER NOT NULL,

  -- Snapshot of product at time of return (for audit)
  product_codigo VARCHAR(20) NOT NULL,
  product_tipo VARCHAR(20) NOT NULL,
  product_talla VARCHAR(10) NOT NULL,
  monto_devolucion DECIMAL(12,2) NOT NULL, -- unit_price * cantidad

  -- Return reason (free text per CONTEXT.md)
  motivo TEXT NOT NULL,

  -- Optional photo (per CONTEXT.md - NOT required)
  foto_path TEXT,

  -- Refund method chosen at request creation
  metodo_reembolso public.reembolso_metodo NOT NULL,

  -- Status workflow
  estado public.devolucion_estado NOT NULL DEFAULT 'pendiente',

  -- Who requested
  solicitante_id UUID NOT NULL REFERENCES auth.users(id),

  -- Approval tracking (NULL until approved/rejected)
  aprobador_id UUID REFERENCES auth.users(id),
  aprobado_at TIMESTAMPTZ,
  notas_aprobador TEXT, -- Optional notes (per CONTEXT.md)

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- CONSTRAINTS
  CONSTRAINT cantidad_positive CHECK (cantidad > 0),
  CONSTRAINT monto_positive CHECK (monto_devolucion > 0),
  CONSTRAINT motivo_not_empty CHECK (LENGTH(TRIM(motivo)) > 0),

  -- Cannot return more than was sold (validated in RPC)
  -- Estado transitions enforced via trigger
);
```

### Recommended Project Structure

```
src/
├── app/(protected)/medias/devoluciones/
│   ├── page.tsx                    # List of returns (all states)
│   ├── nueva/
│   │   └── page.tsx                # Create return request form
│   ├── pendientes/
│   │   └── page.tsx                # Pending returns for Admin/Medico
│   ├── [id]/
│   │   └── page.tsx                # Return detail view
│   └── actions.ts                  # Server actions
├── components/medias/returns/
│   ├── returns-table.tsx           # List view component
│   ├── return-form.tsx             # Create return form
│   ├── approve-dialog.tsx          # Approval dialog (Admin/Medico)
│   ├── reject-dialog.tsx           # Rejection dialog
│   └── return-detail.tsx           # Detail view
├── lib/
│   ├── queries/medias/returns.ts   # Query functions
│   └── validations/medias/return.ts # Zod schemas
├── types/medias/returns.ts         # TypeScript types
└── supabase/migrations/
    ├── 026_medias_returns.sql      # Schema + RLS + triggers
    └── 027_medias_returns_rpc.sql  # RPC functions
```

### Pattern 1: Two-Phase Approval State Machine

**What:** Returns follow pendiente -> aprobada/rechazada state transitions
**When to use:** All return requests
**Example:**
```typescript
// Source: Codebase pattern from purchases (cancel-purchase-dialog.tsx)
// States: pendiente -> aprobada (with stock increment)
//         pendiente -> rechazada (no stock change)
// Only Admin/Medico can transition from pendiente

// Trigger enforces:
// - No transitions out of aprobada/rechazada
// - Only forward transitions allowed
```

### Pattern 2: Stock Increment to stock_devoluciones

**What:** Approved returns increment `stock_devoluciones` (NOT `stock_normal`)
**When to use:** On approval only
**Example:**
```sql
-- Source: Codebase pattern from 022_medias_sales_immutability.sql
-- In approval RPC:
UPDATE medias_products
SET stock_devoluciones = stock_devoluciones + v_return.cantidad
WHERE id = v_return.product_id;

-- Log movement with tipo='devolucion'
INSERT INTO medias_stock_movements (
  product_id, tipo, cantidad,
  stock_normal_antes, stock_normal_despues,
  stock_devoluciones_antes, stock_devoluciones_despues,
  referencia_id, referencia_tipo, notas, created_by
) VALUES (
  v_return.product_id, 'devolucion', v_return.cantidad,
  v_product.stock_normal, v_product.stock_normal,  -- unchanged
  v_product.stock_devoluciones, v_product.stock_devoluciones + v_return.cantidad,
  v_return.id, 'devolucion', v_return.motivo, v_aprobador_id
);
```

### Pattern 3: Cash Closing Integration

**What:** Cash refunds reduce expected cash in cierre calculation
**When to use:** When calculating `total_efectivo` in `get_medias_cierre_summary`
**Example:**
```sql
-- Modify get_medias_cierre_summary to subtract refunds:
-- Current: SUM(efectivo from sales)
-- New:     SUM(efectivo from sales) - SUM(efectivo refunds)

SELECT
  -- Sales efectivo (existing)
  COALESCE(SUM(CASE WHEN msm.metodo = 'efectivo' THEN msm.monto ELSE 0 END), 0)
  -- MINUS: Cash refunds approved on this date
  - COALESCE((
    SELECT SUM(monto_devolucion)
    FROM medias_returns
    WHERE DATE(aprobado_at) = p_fecha
    AND estado = 'aprobada'
    AND metodo_reembolso = 'efectivo'
  ), 0)
INTO v_total_efectivo
FROM ...
```

### Anti-Patterns to Avoid

- **Incrementing stock_normal on return:** Returns go to `stock_devoluciones` to maintain audit trail of returned vs new inventory
- **Allowing state changes after approval/rejection:** Terminal states are immutable
- **Creating return without sale link:** All returns MUST reference original sale
- **Returning more than sold:** Validate quantity against original sale item quantity

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Gapless numbering | Manual counter | Copy venta_counter pattern | Race condition handling |
| Photo upload | Custom upload | Existing ReceiptUpload component | Signed URL pattern works |
| State machine | If/else in code | Database trigger + constraint | Fraud prevention at DB level |
| Admin role check | Client-side only | SECURITY DEFINER RPC | Role check inside function |

**Key insight:** All fraud-prevention logic must be at the database level (triggers, constraints, RPC functions). Client-side checks are UI convenience only.

## Common Pitfalls

### Pitfall 1: Partial Return Quantity Validation
**What goes wrong:** User tries to return more units than originally purchased
**Why it happens:** Not checking against original sale_item quantity
**How to avoid:** In RPC, validate `v_return.cantidad <= v_sale_item.quantity - v_already_returned`
**Warning signs:** Returns exceed sale quantities in reports

### Pitfall 2: Multiple Returns on Same Sale Item
**What goes wrong:** User returns 2, then returns 2 more, but original sale was only 3
**Why it happens:** Not tracking cumulative returned quantity
**How to avoid:** Sum existing approved returns for same sale_item before allowing new return
**Warning signs:** `SUM(returns.cantidad) > sale_item.quantity`

### Pitfall 3: Cierre Photo Timing with Returns
**What goes wrong:** Return approved AFTER cierre photo taken, but cierre totals don't reflect it
**Why it happens:** Cierre calculates based on `aprobado_at` date, return approved late
**How to avoid:** Return `aprobado_at` determines which cierre date it affects. Document clearly that late approvals affect the approval date's cierre, not the request date's.
**Warning signs:** Staff confusion about which day's totals are affected

### Pitfall 4: Stock Movement Timing
**What goes wrong:** Stock incremented before approval completes (partial transaction)
**Why it happens:** Not using single atomic RPC
**How to avoid:** All approval logic in single RPC with transaction
**Warning signs:** `stock_devoluciones` changed but return still `pendiente`

## Code Examples

Verified patterns from codebase:

### Server Action Pattern (from ventas/actions.ts)
```typescript
// Source: src/app/(protected)/medias/ventas/actions.ts
export type ReturnActionState = {
  error?: string
  errors?: Record<string, string[]>
  success?: boolean
  data?: { id: string; numero_devolucion: string }
}

export async function createReturn(
  prevState: ReturnActionState | null,
  formData: FormData
): Promise<ReturnActionState> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autorizado' }
  }

  // Parse and validate with Zod
  const validated = returnSchema.safeParse(rawData)
  if (!validated.success) {
    return {
      errors: validated.error.flatten().fieldErrors,
      error: 'Por favor corrija los errores'
    }
  }

  // Call RPC
  const { data, error } = await supabase.rpc('create_medias_return', {...})

  if (error) {
    // Map DB errors to Spanish
    return { error: mapErrorToSpanish(error.message) }
  }

  revalidatePath('/medias/devoluciones')
  return { success: true, data }
}
```

### Approval Dialog Pattern (from delete-sale-dialog.tsx)
```typescript
// Source: src/components/medias/sales/delete-sale-dialog.tsx
// Pattern: Dialog with optional notes textarea, useActionState

export function ApproveReturnDialog({ returnId, numeroDevolucion }: Props) {
  const [open, setOpen] = useState(false)
  const [notas, setNotas] = useState('')

  const [state, formAction, isPending] = useActionState<ReturnActionState | null, FormData>(
    approveReturn,
    null
  )

  useEffect(() => {
    if (state?.success) {
      toast.success('Devolucion aprobada')
      setOpen(false)
    } else if (state?.error) {
      toast.error(state.error)
    }
  }, [state])

  // ... dialog UI
}
```

### RPC Role Validation Pattern (from eliminar_medias_sale)
```sql
-- Source: 022_medias_sales_immutability.sql
-- Check user has required role inside SECURITY DEFINER function

SELECT role INTO v_user_role FROM user_roles WHERE user_id = v_user_id;
IF v_user_role NOT IN ('admin', 'medico') THEN
  RAISE EXCEPTION 'Solo Admin o Medico pueden aprobar devoluciones';
END IF;
```

### Queries Pattern (from medias/sales.ts)
```typescript
// Source: src/lib/queries/medias/sales.ts
// Pattern: Use supabase as any for tables not in generated types

export async function getReturns(filters?: ReturnFilters): Promise<ReturnWithDetails[]> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('medias_returns')
    .select(`
      *,
      sale:medias_sales(numero_venta, patient:patients(nombre, apellido)),
      solicitante:auth.users!solicitante_id(email)
    `)
    .order('created_at', { ascending: false })

  if (filters?.estado) {
    query = query.eq('estado', filters.estado)
  }

  const { data, error } = await query
  if (error) throw error
  return data || []
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Client-side role checks | SECURITY DEFINER RPCs | Existing pattern | Fraud prevention |
| Separate stock columns | Dual stock (normal + devoluciones) | Phase 10 design | Audit clarity |

**Deprecated/outdated:**
- None applicable - this is a new feature

## Integration Points

### 1. Cash Closing Integration
The `get_medias_cierre_summary` and `create_medias_cierre` RPCs must be updated to:
- Subtract approved cash refunds from `total_efectivo`
- OR: Add a new field `total_devoluciones_efectivo` for visibility

**Recommendation:** Add separate field for transparency:
```sql
-- In medias_cierres table (ALTER or new migration)
total_devoluciones_efectivo DECIMAL(12,2) NOT NULL DEFAULT 0

-- In RPC:
v_total_devoluciones := (SELECT SUM(monto_devolucion) FROM medias_returns
  WHERE DATE(aprobado_at) = p_fecha AND estado = 'aprobada' AND metodo_reembolso = 'efectivo');
v_net_efectivo := v_total_efectivo - v_total_devoluciones;
```

### 2. Sale Detail Page Integration
The sale detail page (`/medias/ventas/[id]`) should show:
- Returns associated with this sale
- Remaining returnable quantity per item

### 3. Stock Movement Ledger
Returns create entries in `medias_stock_movements` with:
- `tipo = 'devolucion'`
- `referencia_id = return.id`
- `referencia_tipo = 'devolucion'`

## Open Questions

Things that couldn't be fully resolved:

1. **Should pending returns block cash closing?**
   - What we know: CONTEXT.md doesn't specify
   - What's unclear: If pending returns should prevent closing the day
   - Recommendation: Allow closing even with pending returns. Pending returns don't affect cash or stock until approved.

2. **Return numbering prefix**
   - What we know: Sales use VTA-, Cierres use CIM-
   - What's unclear: User preference for return prefix
   - Recommendation: Use `DEV-` prefix (Devolucion) for consistency

## Sources

### Primary (HIGH confidence)
- `/supabase/migrations/020_medias_foundation.sql` - Dual stock schema
- `/supabase/migrations/021_medias_sales.sql` - Sales schema pattern
- `/supabase/migrations/022_medias_sales_immutability.sql` - Immutability trigger pattern
- `/supabase/migrations/023_create_medias_sale_rpc.sql` - RPC atomic transaction pattern
- `/supabase/migrations/024_medias_cierres.sql` - Cash closing schema
- `/supabase/migrations/025_medias_cierre_rpc.sql` - Cierre RPC pattern
- `/src/app/(protected)/medias/ventas/actions.ts` - Server action pattern
- `/src/components/medias/sales/delete-sale-dialog.tsx` - Dialog pattern
- `/src/lib/queries/medias/sales.ts` - Query pattern
- `/src/lib/validations/medias/sale.ts` - Zod validation pattern

### Secondary (MEDIUM confidence)
- `.planning/phases/14-returns-workflow/14-CONTEXT.md` - User decisions

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Uses existing codebase patterns exclusively
- Architecture: HIGH - Follows established medias domain patterns
- Pitfalls: HIGH - Based on codebase review and domain analysis
- Integration: MEDIUM - Cierre modification requires careful planning

**Research date:** 2026-01-26
**Valid until:** 2026-02-26 (30 days - stable domain)

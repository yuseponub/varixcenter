# Phase 11: Sales Core - Research

**Researched:** 2026-01-25
**Domain:** Immutable sales records with stock decrement and thermal receipt printing
**Confidence:** HIGH

## Summary

Phase 11 builds on Phase 10's medias_products foundation to implement the sales module. The core challenge is creating an immutable sales system that: (1) atomically decrements stock with race condition protection, (2) generates gapless sequential sale numbers (VTA-000001), (3) supports multi-product sales with price snapshots, and (4) generates thermal printer receipts.

**90% of required patterns already exist in VarixClinic.** The payments module (Phase 4) provides the template for immutable records, gapless numbering, anulacion workflow, and receipt photo uploads. The key new element is thermal receipt printing, which can be achieved with CSS print stylesheets (no external library required) or the `react-thermal-printer` library for ESC/POS direct printing.

The architecture follows the payments pattern exactly: `medias_sales` (header), `medias_sale_items` (line items with snapshots), `medias_sale_methods` (payment methods with comprobante), plus RPC functions for atomic creation and admin-only deletion with stock reversal.

**Primary recommendation:** Clone the payments schema structure (009/010 migrations) for medias_sales, add RPC functions with SELECT FOR UPDATE stock locking, and use CSS @media print for thermal receipt generation.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Supabase | Current | Database (PostgreSQL), RLS, triggers, RPC | Already in use |
| PostgreSQL | 15+ | FOR UPDATE locking, CHECK constraints, ENUM types | Already in use |
| Zod | 3.x | Validation schemas | Already in use |
| Next.js App Router | 14.x | Server actions, revalidatePath | Already in use |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| CSS @media print | Native | Thermal receipt print styling | Browser print dialog |
| react-thermal-printer | 0.20+ | ESC/POS direct printing (optional) | If USB/Serial printer access needed |
| @tanstack/react-table | 8.x | Sales history table | Already used for similar tables |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| CSS print | react-thermal-printer | CSS is simpler, works with any printer. ESC/POS gives more control but requires Web Serial API |
| Separate invoice counter | Shared with payments | Keep separate - VTA- prefix vs FAC- prefix, independent sequences |
| Direct stock UPDATE | RPC with FOR UPDATE | RPC required - ensures atomic operation with movement logging |

**Installation:**
```bash
# Only if ESC/POS direct printing is desired (optional)
npm install react-thermal-printer
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── types/
│   └── medias/
│       ├── products.ts          # Existing from Phase 10
│       └── sales.ts             # NEW: MediasSale, MediasSaleItem types
├── lib/
│   ├── validations/
│   │   └── medias/
│   │       ├── product.ts       # Existing
│   │       └── sale.ts          # NEW: Sale form validation
│   └── queries/
│       └── medias/
│           ├── products.ts      # Existing
│           └── sales.ts         # NEW: Sale queries
├── components/
│   └── medias/
│       ├── products/            # Existing
│       └── sales/               # NEW
│           ├── sale-form.tsx       # Multi-product selection form
│           ├── sale-items.tsx      # Product selection with quantity
│           ├── sales-table.tsx     # Sales history
│           ├── receipt-preview.tsx # Thermal receipt component
│           └── delete-sale-dialog.tsx # Admin delete with justification
└── app/
    └── (protected)/
        └── medias/
            ├── productos/       # Existing
            └── ventas/          # NEW
                ├── page.tsx        # Sales list
                ├── nueva/
                │   └── page.tsx    # New sale form
                ├── [id]/
                │   └── page.tsx    # Sale detail with receipt
                └── actions.ts      # Server actions

supabase/migrations/
├── 020_medias_foundation.sql   # Existing
├── 021_medias_sales.sql        # NEW: Sales tables
├── 022_medias_sales_immutability.sql  # NEW: Immutability + delete with stock reversal
└── 023_medias_sale_rpc.sql     # NEW: Atomic creation RPC
```

### Pattern 1: Sales Table Structure (Clone from Payments)
**What:** Three-table structure for sales: header, items, methods
**When to use:** Multi-item sales with split payments
**Example:**
```sql
-- Source: Adapted from 009_payments_tables.sql
CREATE TABLE public.medias_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Sale number (gapless, VTA-000001)
  numero_venta VARCHAR(20) NOT NULL UNIQUE,

  -- Optional patient link
  patient_id UUID REFERENCES public.patients(id),

  -- Totals (immutable)
  subtotal DECIMAL(12,2) NOT NULL,
  total DECIMAL(12,2) NOT NULL,

  -- Status
  estado public.payment_status NOT NULL DEFAULT 'activo',

  -- Deletion fields (admin only)
  eliminado_por UUID REFERENCES auth.users(id),
  eliminado_at TIMESTAMPTZ,
  eliminacion_justificacion TEXT,

  -- Who made the sale vs who received cash
  vendedor_id UUID NOT NULL REFERENCES auth.users(id),
  receptor_efectivo_id UUID REFERENCES auth.users(id),

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT total_positive CHECK (total >= 0)
);
```

### Pattern 2: Atomic Stock Decrement with Locking
**What:** RPC function that locks product rows, verifies stock, decrements, and logs movement
**When to use:** Every sale creation
**Example:**
```sql
-- Source: Pattern from stormatics.tech/blogs/select-for-update-in-postgresql
CREATE FUNCTION public.create_medias_sale(
  p_items JSONB,  -- [{product_id, quantity}, ...]
  p_methods JSONB,
  p_patient_id UUID,
  p_vendedor_id UUID,
  p_receptor_efectivo_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sale_id UUID;
  v_item RECORD;
  v_product RECORD;
  v_numero_venta TEXT;
BEGIN
  -- Get gapless sale number
  v_numero_venta := get_next_venta_number();

  -- Create sale header
  INSERT INTO medias_sales (...) VALUES (...) RETURNING id INTO v_sale_id;

  -- Process each item with row locking
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS (product_id UUID, quantity INTEGER)
  LOOP
    -- Lock product row exclusively
    SELECT * INTO v_product
    FROM medias_products
    WHERE id = v_item.product_id
    FOR UPDATE;

    -- Check stock (VTA-12)
    IF v_product.stock_normal < v_item.quantity THEN
      RAISE EXCEPTION 'Stock insuficiente para %', v_product.codigo;
    END IF;

    -- Decrement stock
    UPDATE medias_products
    SET stock_normal = stock_normal - v_item.quantity
    WHERE id = v_item.product_id;

    -- Log movement with before/after snapshot
    INSERT INTO medias_stock_movements (
      product_id, tipo, cantidad,
      stock_normal_antes, stock_normal_despues,
      stock_devoluciones_antes, stock_devoluciones_despues,
      referencia_id, referencia_tipo, created_by
    ) VALUES (
      v_item.product_id, 'venta', v_item.quantity,
      v_product.stock_normal, v_product.stock_normal - v_item.quantity,
      v_product.stock_devoluciones, v_product.stock_devoluciones,
      v_sale_id, 'venta', p_vendedor_id
    );

    -- Create sale item with price snapshot
    INSERT INTO medias_sale_items (...) VALUES (...);
  END LOOP;

  -- Insert payment methods
  -- ... (similar to payments pattern)

  RETURN jsonb_build_object('id', v_sale_id, 'numero_venta', v_numero_venta);
END;
$$;
```

### Pattern 3: Admin Delete with Stock Reversal
**What:** RPC function that reverses stock changes when admin deletes a sale
**When to use:** Admin deleting an incorrect sale (VTA-09, VTA-13)
**Example:**
```sql
-- Source: Adapted from anular_pago pattern
CREATE FUNCTION public.eliminar_medias_sale(
  p_sale_id UUID,
  p_justificacion TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_user_role TEXT;
  v_item RECORD;
  v_product RECORD;
BEGIN
  -- Verify admin role
  v_user_id := auth.uid();
  SELECT role INTO v_user_role FROM user_roles WHERE user_id = v_user_id;
  IF v_user_role != 'admin' THEN
    RAISE EXCEPTION 'Solo Admin puede eliminar ventas';
  END IF;

  -- Validate justification
  IF LENGTH(TRIM(p_justificacion)) < 10 THEN
    RAISE EXCEPTION 'La justificacion debe tener al menos 10 caracteres';
  END IF;

  -- Reverse stock for each item
  FOR v_item IN SELECT * FROM medias_sale_items WHERE sale_id = p_sale_id
  LOOP
    SELECT * INTO v_product
    FROM medias_products WHERE id = v_item.product_id FOR UPDATE;

    -- Restore stock
    UPDATE medias_products
    SET stock_normal = stock_normal + v_item.quantity
    WHERE id = v_item.product_id;

    -- Log reversal movement
    INSERT INTO medias_stock_movements (...) VALUES (...);
  END LOOP;

  -- Mark sale as deleted (soft delete with justification)
  UPDATE medias_sales
  SET estado = 'anulado',
      eliminado_por = v_user_id,
      eliminado_at = now(),
      eliminacion_justificacion = p_justificacion
  WHERE id = p_sale_id;

  RETURN jsonb_build_object('success', true);
END;
$$;
```

### Pattern 4: CSS Thermal Receipt Printing
**What:** CSS stylesheet optimized for 58mm thermal printers using @media print
**When to use:** Window.print() approach for simple printer integration
**Example:**
```css
/* Source: github.com/parzibyte/print-receipt-thermal-printer */
.receipt {
  width: 58mm;
  max-width: 58mm;
  font-family: 'Courier New', monospace;
  font-size: 12px;
}

.receipt-header {
  text-align: center;
  font-weight: bold;
}

.receipt-items {
  border-top: 1px dashed black;
  border-bottom: 1px dashed black;
}

.receipt-total {
  font-weight: bold;
  font-size: 14px;
}

@media print {
  body * {
    visibility: hidden;
  }
  .receipt, .receipt * {
    visibility: visible;
  }
  .receipt {
    position: absolute;
    left: 0;
    top: 0;
  }
  .no-print {
    display: none !important;
  }
}
```

### Anti-Patterns to Avoid
- **Optimistic stock decrement without locking:** Race conditions will cause overselling. Always use SELECT FOR UPDATE.
- **Allowing stock to go negative:** CHECK constraint must enforce stock_normal >= 0.
- **Direct UPDATE on sales:** Sales are immutable. Only admin delete with reversal is allowed.
- **Storing product_id without price snapshot:** Prices can change; always store unit_price at sale time.
- **Client-side stock validation only:** Database is the source of truth; client validation is convenience, not security.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Gapless numbering | Custom counter logic | invoice_counter pattern from payments | Already proven, handles edge cases |
| Immutability | Application checks | PostgreSQL TRIGGER | Cannot be bypassed |
| Stock validation | App-level checks | CHECK constraint + FOR UPDATE | Race-condition proof |
| Receipt photo upload | Custom upload | ReceiptUpload component | Already handles signed URLs, validation |
| Patient search | Custom search | PatientSearch component | Already has debounce, URL params |
| Currency formatting | Manual formatting | Intl.NumberFormat('es-CO') | Already used throughout app |

**Key insight:** The sales module is essentially the payments module with stock management added. Clone payments patterns and add stock operations via RPC.

## Common Pitfalls

### Pitfall 1: Race Conditions in Concurrent Sales
**What goes wrong:** Two cashiers sell same product simultaneously, both see stock=1, both decrement to 0, actual stock is -1
**Why it happens:** No row locking during read-modify-write
**How to avoid:** RPC function uses `SELECT ... FOR UPDATE` before decrementing
**Warning signs:** CHECK constraint violations, "stock insuficiente" errors after successful sales

### Pitfall 2: Orphaned Stock Movements on Sale Deletion
**What goes wrong:** Sale deleted but original 'venta' movements remain, audit trail is inconsistent
**Why it happens:** Forgot to create reversal movement when deleting
**How to avoid:** Delete RPC creates 'ajuste_entrada' movements for each item being reversed
**Warning signs:** Stock levels don't match sum of movements

### Pitfall 3: Selling From Returns Stock Unintentionally
**What goes wrong:** Sale decrements stock_devoluciones instead of stock_normal
**Why it happens:** Unclear logic about which stock to sell from
**How to avoid:** VTA requirements specify selling from stock_normal only. Decrement logic must be explicit.
**Warning signs:** stock_devoluciones decreasing unexpectedly

### Pitfall 4: Receipt Not Fitting 58mm Paper
**What goes wrong:** Receipt truncates or wraps badly on thermal printer
**Why it happens:** CSS width not constrained, fonts too large
**How to avoid:** Fixed width 58mm, font-size 10-12px, test with actual printer
**Warning signs:** Preview looks fine but print is cut off

### Pitfall 5: Sale Created But Stock Not Decremented
**What goes wrong:** Transaction partially fails; sale record exists but stock unchanged
**Why it happens:** Not using atomic RPC; separate queries without transaction
**How to avoid:** Single RPC function wraps all operations in one transaction
**Warning signs:** Stock counts don't match sales quantity

### Pitfall 6: VTA Number Gaps After Rollback
**What goes wrong:** Sale creation fails after getting number VTA-000005, next sale is VTA-000006
**Why it happens:** Standard PostgreSQL SEQUENCE doesn't guarantee gaplessness on rollback
**How to avoid:** Counter table with FOR UPDATE lock (same as invoice_counter)
**Warning signs:** Gaps in VTA sequence, which may violate accounting requirements

## Code Examples

Verified patterns from existing project code:

### Sales Type Definitions
```typescript
// Source: Pattern from src/types/index.ts
export interface MediasSale {
  id: string
  numero_venta: string
  patient_id: string | null
  subtotal: number
  total: number
  estado: 'activo' | 'anulado'
  eliminado_por: string | null
  eliminado_at: string | null
  eliminacion_justificacion: string | null
  vendedor_id: string
  receptor_efectivo_id: string | null
  created_at: string
}

export interface MediasSaleItem {
  id: string
  sale_id: string
  product_id: string
  product_codigo: string  // Snapshot
  product_tipo: string    // Snapshot
  product_talla: string   // Snapshot
  unit_price: number      // Snapshot
  quantity: number
  subtotal: number
}

export interface MediasSaleMethod {
  id: string
  sale_id: string
  metodo: 'efectivo' | 'tarjeta' | 'transferencia' | 'nequi'
  monto: number
  comprobante_path: string | null
}
```

### Zod Validation Schema
```typescript
// Source: Pattern from src/lib/validations/payment.ts
import { z } from 'zod'

export const mediasSaleItemSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().int().min(1, 'La cantidad debe ser al menos 1'),
})

export const mediasSaleMethodSchema = z.object({
  metodo: z.enum(['efectivo', 'tarjeta', 'transferencia', 'nequi']),
  monto: z.number().min(0.01, 'El monto debe ser mayor a 0'),
  comprobante_path: z.string().nullable(),
}).refine(
  (data) => data.metodo === 'efectivo' || data.comprobante_path,
  { message: 'Los pagos electronicos requieren comprobante', path: ['comprobante_path'] }
)

export const mediasSaleSchema = z.object({
  items: z.array(mediasSaleItemSchema).min(1, 'Debe seleccionar al menos un producto'),
  methods: z.array(mediasSaleMethodSchema).min(1, 'Debe especificar metodo de pago'),
  patient_id: z.string().uuid().nullable(),
  receptor_efectivo_id: z.string().uuid().nullable(),
}).refine(
  (data) => {
    const total = data.items.reduce((sum, item) => sum + item.quantity, 0)
    return total > 0
  },
  { message: 'El total debe ser mayor a 0' }
)
```

### Thermal Receipt Component
```tsx
// Source: Pattern adapted from parzibyte/print-receipt-thermal-printer
interface ReceiptPreviewProps {
  sale: MediasSale
  items: MediasSaleItem[]
  methods: MediasSaleMethod[]
}

export function ReceiptPreview({ sale, items, methods }: ReceiptPreviewProps) {
  const handlePrint = () => {
    window.print()
  }

  return (
    <>
      <div className="receipt" id="receipt-content">
        <div className="receipt-header">
          <h1 className="text-lg font-bold">VARIX MEDIAS</h1>
          <p className="text-xs">NIT: XXX.XXX.XXX-X</p>
          <p className="text-xs">{format(new Date(sale.created_at), 'dd/MM/yyyy HH:mm')}</p>
        </div>

        <p className="text-center font-bold mt-2">{sale.numero_venta}</p>

        <div className="receipt-items mt-2 border-t border-dashed pt-2">
          {items.map(item => (
            <div key={item.id} className="flex justify-between text-xs">
              <span>{item.product_tipo} {item.product_talla} x{item.quantity}</span>
              <span>{formatCurrency(item.subtotal)}</span>
            </div>
          ))}
        </div>

        <div className="receipt-total mt-2 border-t border-dashed pt-2">
          <div className="flex justify-between font-bold">
            <span>TOTAL</span>
            <span>{formatCurrency(sale.total)}</span>
          </div>
        </div>

        <div className="receipt-methods mt-2 text-xs">
          {methods.map(m => (
            <div key={m.id}>{m.metodo}: {formatCurrency(m.monto)}</div>
          ))}
        </div>

        <p className="text-center text-xs mt-4">Gracias por su compra</p>
      </div>

      <Button onClick={handlePrint} className="no-print mt-4">
        <Printer className="mr-2 h-4 w-4" />
        Imprimir Recibo
      </Button>
    </>
  )
}
```

### Server Action Pattern
```typescript
// Source: Pattern from src/app/(protected)/pagos/actions.ts
'use server'

export async function createMediasSale(
  prevState: SaleActionState | null,
  formData: FormData
): Promise<SaleActionState> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autorizado' }
  }

  // Parse and validate
  const rawData = {
    items: JSON.parse(formData.get('items') as string || '[]'),
    methods: JSON.parse(formData.get('methods') as string || '[]'),
    patient_id: formData.get('patient_id') as string || null,
    receptor_efectivo_id: formData.get('receptor_efectivo_id') as string || null,
  }

  const validated = mediasSaleSchema.safeParse(rawData)
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors }
  }

  // Call atomic RPC
  const { data, error } = await supabase.rpc('create_medias_sale', {
    p_items: validated.data.items,
    p_methods: validated.data.methods,
    p_patient_id: validated.data.patient_id,
    p_vendedor_id: user.id,
    p_receptor_efectivo_id: validated.data.receptor_efectivo_id,
  })

  if (error) {
    if (error.message.includes('Stock insuficiente')) {
      return { error: error.message }
    }
    return { error: 'Error al crear la venta' }
  }

  revalidatePath('/medias/ventas')
  revalidatePath('/medias/productos')

  return { success: true, data }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Browser print with dialogs | CSS @media print | Best practice | Clean receipt without dialog (optional) |
| Sequence for numbering | Counter table with FOR UPDATE | PostgreSQL limitation | Guaranteed gapless |
| Soft delete without reversal | Delete with stock reversal RPC | Business requirement | Accurate inventory |

**Deprecated/outdated:**
- ESC/POS libraries requiring native drivers - Web Serial API now available in Chrome
- Manual audit entries - trigger-based audit is standard

## Open Questions

Things that couldn't be fully resolved:

1. **ESC/POS vs CSS Print**
   - What we know: CSS print is simpler, ESC/POS gives more control
   - What's unclear: Does clinic have USB/Serial thermal printer or network printer?
   - Recommendation: Start with CSS print (works everywhere). Add ESC/POS later if needed.

2. **Receiver of Cash UI**
   - What we know: VTA-08 requires specifying who received cash if different from seller
   - What's unclear: Is this a dropdown of users? Free text?
   - Recommendation: Dropdown of active staff users (query user_roles)

3. **Discount on Sales**
   - What we know: Payments have descuento field with justificacion
   - What's unclear: Do sales need discounts too?
   - Recommendation: Not in VTA requirements. Omit for Phase 11; add in future if needed.

## Sources

### Primary (HIGH confidence)
- Existing project: `supabase/migrations/009_payments_tables.sql` - gapless numbering, immutable records
- Existing project: `supabase/migrations/010_payments_immutability.sql` - immutability trigger pattern
- Existing project: `supabase/migrations/020_medias_foundation.sql` - stock movements pattern
- Existing project: `src/app/(protected)/pagos/actions.ts` - server action pattern
- Existing project: `src/components/payments/receipt-upload.tsx` - receipt photo upload
- Existing project: `src/components/patients/patient-search.tsx` - patient search component
- [Stormatics: SELECT FOR UPDATE](https://stormatics.tech/blogs/select-for-update-in-postgresql) - row locking pattern

### Secondary (MEDIUM confidence)
- [react-thermal-printer](https://github.com/seokju-na/react-thermal-printer) - ESC/POS React library
- [parzibyte CSS receipt](https://github.com/parzibyte/print-receipt-thermal-printer) - CSS print stylesheet for 58mm
- [PostgreSQL gapless counter](https://github.com/kimmobrunfeldt/howto-everything/blob/master/postgres-gapless-counter-for-invoice-purposes.md) - counter table pattern

### Tertiary (LOW confidence)
- None; all patterns verified with existing codebase or official PostgreSQL documentation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - 100% reuse of existing project dependencies
- Architecture: HIGH - Direct adaptation of payments module
- Database patterns: HIGH - SELECT FOR UPDATE is documented PostgreSQL pattern
- Thermal printing: MEDIUM - CSS approach verified, ESC/POS optional

**Research date:** 2026-01-25
**Valid until:** 60 days (stable patterns, minimal external dependencies)

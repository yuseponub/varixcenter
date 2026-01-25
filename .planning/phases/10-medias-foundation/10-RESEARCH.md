# Phase 10: Medias Foundation - Research

**Researched:** 2026-01-25
**Domain:** Product catalog with dual inventory tracking and immutable stock movements
**Confidence:** HIGH

## Summary

Phase 10 establishes the database foundation for the Medias retail module: a products catalog with 11 pre-loaded compression stockings, dual inventory tracking (stock_normal for purchases, stock_devoluciones for returns), and an immutable stock_movements log. The research confirms that **90% of required patterns already exist in VarixClinic** (services catalog, immutability triggers, audit logging, RLS policies).

The key technical challenges are: (1) implementing dual stock columns with proper constraints, (2) establishing the immutable stock_movements pattern that captures before/after state for every inventory change, and (3) using `SELECT FOR UPDATE` locking to prevent race conditions during concurrent inventory operations. The existing `services` table serves as the direct template for `medias_products`, and the `payments` immutability trigger pattern applies to `medias_stock_movements`.

**Primary recommendation:** Clone the services catalog pattern for products, add `stock_normal` and `stock_devoluciones` columns with CHECK constraints >= 0, and create an immutable `medias_stock_movements` table that logs all stock changes with before/after snapshots.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Supabase | Current | Database (PostgreSQL), RLS, triggers | Already in use in project |
| PostgreSQL | 15+ | CHECK constraints, FOR UPDATE locking, ENUM types | Already in use, proven patterns |
| Zod | 3.x | Validation schemas | Already in use (see src/lib/validations/) |
| TypeScript | 5.x | Type definitions | Already in use |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @tanstack/react-table | 8.x | Products table display | Already used for services table |
| react-hook-form | 7.x | Product form management | Already in use for service forms |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Dual stock columns | Single stock with type flag | Dual columns are clearer, match requirements exactly, avoid joins |
| PostgreSQL CHECK | Application-level validation | Database constraints are foolproof, cannot be bypassed |
| Audit trigger | Manual logging | Trigger is automatic, cannot be forgotten |

**Installation:**
```bash
# No new packages needed - all dependencies already exist
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── types/
│   └── medias/
│       └── products.ts          # Product and stock movement types
├── lib/
│   ├── validations/
│   │   └── medias/
│   │       └── product.ts       # Zod schemas for products
│   └── queries/
│       └── medias/
│           └── products.ts      # Product queries and mutations
├── components/
│   └── medias/
│       └── products/
│           ├── products-table.tsx
│           └── product-form.tsx
└── app/
    └── (protected)/
        └── medias/
            └── productos/
                ├── page.tsx
                └── actions.ts

supabase/migrations/
└── 020_medias_foundation.sql    # Products + stock movements schema
```

### Pattern 1: Dual Stock Columns
**What:** Store normal and returns stock as separate columns on the product row
**When to use:** When stock types have different business rules and need independent tracking
**Example:**
```sql
-- Source: Project requirement INV-02
CREATE TABLE public.medias_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo VARCHAR(20) NOT NULL,           -- Muslo, Panty, Rodilla
  talla VARCHAR(5) NOT NULL,           -- M, L, XL, XXL
  codigo VARCHAR(20) NOT NULL UNIQUE,  -- 74113, 74114, etc.
  precio DECIMAL(12,2) NOT NULL,

  -- Dual inventory tracking
  stock_normal INTEGER NOT NULL DEFAULT 0,
  stock_devoluciones INTEGER NOT NULL DEFAULT 0,

  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT stock_normal_non_negative CHECK (stock_normal >= 0),
  CONSTRAINT stock_devoluciones_non_negative CHECK (stock_devoluciones >= 0),
  CONSTRAINT precio_positive CHECK (precio > 0)
);
```

### Pattern 2: Immutable Stock Movements
**What:** Append-only table that records every inventory change with before/after state
**When to use:** For audit trail, fraud prevention, and inventory reconciliation
**Example:**
```sql
-- Source: Existing payments immutability pattern (010_payments_immutability.sql)
CREATE TYPE public.medias_movement_type AS ENUM (
  'compra',        -- Purchase increases stock_normal
  'venta',         -- Sale decreases stock_normal or stock_devoluciones
  'devolucion',    -- Return increases stock_devoluciones
  'ajuste_entrada', -- Manual adjustment adding stock
  'ajuste_salida', -- Manual adjustment removing stock
  'transferencia'  -- Move between stock_normal and stock_devoluciones
);

CREATE TABLE public.medias_stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.medias_products(id),
  tipo medias_movement_type NOT NULL,
  cantidad INTEGER NOT NULL,

  -- Before/after snapshot (IMMUTABLE - for audit)
  stock_normal_antes INTEGER NOT NULL,
  stock_normal_despues INTEGER NOT NULL,
  stock_devoluciones_antes INTEGER NOT NULL,
  stock_devoluciones_despues INTEGER NOT NULL,

  -- References (nullable depending on movement type)
  referencia_id UUID,           -- sale_id, purchase_id, return_id, adjustment_id
  referencia_tipo VARCHAR(50),  -- 'venta', 'compra', 'devolucion', 'ajuste'

  -- Audit
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- NO updated_at - movements are IMMUTABLE
  CONSTRAINT cantidad_positive CHECK (cantidad > 0)
);

-- Immutability trigger (same pattern as payments)
CREATE TRIGGER tr_stock_movement_immutability
  BEFORE UPDATE OR DELETE ON public.medias_stock_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_stock_movement_immutability();
```

### Pattern 3: SELECT FOR UPDATE Locking
**What:** Lock inventory row during transaction to prevent concurrent access issues
**When to use:** Any operation that reads then updates stock
**Example:**
```sql
-- Source: PITFALLS-MEDIAS.md, Pitfall #6
-- Within RPC function for stock operations
BEGIN;
  -- Lock the product row exclusively
  SELECT stock_normal, stock_devoluciones
  FROM medias_products
  WHERE id = $product_id
  FOR UPDATE;

  -- Verify stock is sufficient (for sales)
  IF stock_normal < $quantity THEN
    RAISE EXCEPTION 'Stock insuficiente';
  END IF;

  -- Update stock
  UPDATE medias_products
  SET stock_normal = stock_normal - $quantity
  WHERE id = $product_id;

  -- Log movement (immutable)
  INSERT INTO medias_stock_movements (...) VALUES (...);
COMMIT;
```

### Anti-Patterns to Avoid
- **Direct stock updates without movement logging:** Every stock change MUST create a movement record. Never use `UPDATE medias_products SET stock_normal = X` directly; always go through RPC function that logs movement.
- **Optimistic locking without retry:** If using version column, must handle retry on conflict. Pessimistic locking (FOR UPDATE) is simpler for this use case.
- **Single stock column with type attribute:** Makes queries complex, loses separate constraint enforcement.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Immutability enforcement | Application-level checks | PostgreSQL TRIGGER | Cannot be bypassed, works even from SQL console |
| Negative stock prevention | Application validation | CHECK constraint | Database guarantees, race-condition proof |
| Concurrent access | Application mutex | SELECT FOR UPDATE | Database-native, handles edge cases |
| Audit logging | Manual INSERT calls | audit_trigger_func() | Already exists, automatic for all tables |
| Currency formatting | Custom function | Intl.NumberFormat('es-CO') | Already used in services-table.tsx |

**Key insight:** The database is the single source of truth for inventory. All constraints and logging must happen at the database level, not application level. Application code calls RPC functions; it never directly manipulates stock.

## Common Pitfalls

### Pitfall 1: Race Conditions in Stock Updates
**What goes wrong:** Two concurrent sales both read stock=3, both decrement to 2, actual result should be 1
**Why it happens:** No row-level locking during read-modify-write
**How to avoid:** Use `SELECT ... FOR UPDATE` in all stock-modifying operations
**Warning signs:** Stock counts drift from physical over time, occasional overselling

### Pitfall 2: Phantom Inventory
**What goes wrong:** Sales processed before purchases registered; stock shows -3 units
**Why it happens:** Staff sells product before entering incoming shipment
**How to avoid:** `CHECK (stock_normal >= 0)` constraint blocks the sale at database level
**Warning signs:** Frequent "stock insuficiente" errors after clearly receiving shipment

### Pitfall 3: Lost Movement History
**What goes wrong:** Stock adjusted without creating movement record; audit trail has gaps
**Why it happens:** Developer uses direct UPDATE instead of RPC function
**How to avoid:** All stock changes via RPC functions; direct UPDATE blocked by trigger or RLS
**Warning signs:** Stock levels don't match sum of movements

### Pitfall 4: Price Changes Breaking Historical Data
**What goes wrong:** Admin changes product price; historical sales reports show wrong totals
**Why it happens:** Sales reference product.precio instead of storing price at sale time
**How to avoid:** Store `precio_unitario` (snapshot) in sales table, not just product_id
**Warning signs:** Financial reports change retroactively after price updates

### Pitfall 5: Mixing stock_normal and stock_devoluciones Logic
**What goes wrong:** Return goes to stock_normal, or sale decrements from wrong stock type
**Why it happens:** Movement type not properly mapped to stock column
**How to avoid:** RPC function explicitly maps: compra/ajuste_entrada -> stock_normal, devolucion -> stock_devoluciones, venta -> configurable
**Warning signs:** stock_devoluciones never increases, stock_normal randomly jumps

## Code Examples

Verified patterns from official sources (adapted from existing project code):

### Product Type Definition
```typescript
// Source: Pattern from src/types/services.ts
/**
 * Medias product type from database Row
 * Matches medias_products table schema
 */
export interface MediasProduct {
  id: string
  tipo: 'Muslo' | 'Panty' | 'Rodilla'
  talla: 'M' | 'L' | 'XL' | 'XXL'
  codigo: string
  precio: number
  stock_normal: number
  stock_devoluciones: number
  activo: boolean
  created_at: string
  updated_at: string
}

/**
 * Stock movement type (immutable)
 */
export const MOVEMENT_TYPES = [
  'compra',
  'venta',
  'devolucion',
  'ajuste_entrada',
  'ajuste_salida',
  'transferencia'
] as const

export type MediasMovementType = (typeof MOVEMENT_TYPES)[number]

export interface MediasStockMovement {
  id: string
  product_id: string
  tipo: MediasMovementType
  cantidad: number
  stock_normal_antes: number
  stock_normal_despues: number
  stock_devoluciones_antes: number
  stock_devoluciones_despues: number
  referencia_id: string | null
  referencia_tipo: string | null
  created_by: string
  created_at: string
}
```

### Zod Validation Schema
```typescript
// Source: Pattern from src/lib/validations/service.ts
import { z } from 'zod'

export const mediasProductSchema = z.object({
  tipo: z.enum(['Muslo', 'Panty', 'Rodilla'], {
    required_error: 'El tipo es requerido'
  }),
  talla: z.enum(['M', 'L', 'XL', 'XXL'], {
    required_error: 'La talla es requerida'
  }),
  codigo: z
    .string()
    .min(1, 'El codigo es requerido')
    .max(20, 'El codigo es muy largo'),
  precio: z
    .number({ message: 'El precio es requerido' })
    .min(1, 'El precio debe ser mayor a 0')
    .max(10000000, 'El precio es muy alto'),
  activo: z.boolean().default(true),
})

export type MediasProductFormData = z.infer<typeof mediasProductSchema>
```

### Seed Data SQL
```sql
-- Source: Requirement CAT-05
INSERT INTO public.medias_products (tipo, talla, codigo, precio, stock_normal, stock_devoluciones, activo) VALUES
  ('Muslo', 'M',   '74113', 175000, 0, 0, true),
  ('Muslo', 'L',   '74114', 175000, 0, 0, true),
  ('Muslo', 'XL',  '74115', 175000, 0, 0, true),
  ('Muslo', 'XXL', '74116', 175000, 0, 0, true),
  ('Panty', 'M',   '75406', 190000, 0, 0, true),
  ('Panty', 'L',   '75407', 190000, 0, 0, true),
  ('Panty', 'XL',  '75408', 190000, 0, 0, true),
  ('Panty', 'XXL', '75409', 190000, 0, 0, true),
  ('Rodilla', 'M', '79321', 130000, 0, 0, true),
  ('Rodilla', 'L', '79322', 130000, 0, 0, true),
  ('Rodilla', 'XL','79323', 130000, 0, 0, true);
```

### RLS Policy Pattern
```sql
-- Source: Pattern from 008_services_catalog.sql
ALTER TABLE public.medias_products ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view products
CREATE POLICY "Authenticated users can view medias products"
  ON public.medias_products FOR SELECT
  TO authenticated
  USING (true);

-- Only admin can modify products
CREATE POLICY "Admin can manage medias products"
  ON public.medias_products FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
  );
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Application-level stock validation | Database CHECK constraints | Best practice | Cannot oversell even with bugs |
| Manual audit entries | Automatic audit triggers | Best practice | Complete audit trail guaranteed |
| Single stock column | Dual stock columns | Domain requirement | Separate normal vs returns tracking |

**Deprecated/outdated:**
- None for this domain; using established PostgreSQL patterns

## Open Questions

Things that couldn't be fully resolved:

1. **Stock adjustment workflow complexity**
   - What we know: Adjustments need approval (from PITFALLS-MEDIAS.md)
   - What's unclear: Is this Phase 10 scope or Phase 15 (Dashboard & Inventory)?
   - Recommendation: Phase 10 creates the movement type `ajuste_entrada`/`ajuste_salida`; approval workflow is Phase 15

2. **Selling from returns stock**
   - What we know: stock_devoluciones holds returned items
   - What's unclear: Can these be sold? At discounted price?
   - Recommendation: For Phase 10, keep separate. Sales decrement stock_normal only. Phase 14 (Returns) can define rules.

3. **Product editing scope**
   - What we know: CAT-02 says "admin can edit price"
   - What's unclear: Can admin edit tipo/talla/codigo after creation?
   - Recommendation: Only precio and activo are editable. tipo/talla/codigo are immutable after seed.

## Sources

### Primary (HIGH confidence)
- Existing project migrations: `008_services_catalog.sql` - product catalog pattern
- Existing project migrations: `009_payments_tables.sql`, `010_payments_immutability.sql` - immutability pattern
- Existing project code: `src/types/services.ts`, `src/lib/validations/service.ts` - type and validation patterns
- Existing project code: `src/components/services/services-table.tsx` - table UI pattern
- `.planning/research/PITFALLS-MEDIAS.md` - inventory pitfalls with sources

### Secondary (MEDIUM confidence)
- `.planning/research/SUMMARY-MEDIAS.md` - module overview and phase structure

### Tertiary (LOW confidence)
- None; all findings based on existing codebase patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - 100% reuse of existing project dependencies
- Architecture: HIGH - Direct adaptation of existing services/payments patterns
- Pitfalls: HIGH - Documented in PITFALLS-MEDIAS.md with external sources

**Research date:** 2026-01-25
**Valid until:** 60 days (stable patterns, no external dependencies)

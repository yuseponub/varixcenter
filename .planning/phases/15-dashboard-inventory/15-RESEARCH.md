# Phase 15: Dashboard & Inventory - Research

**Researched:** 2026-01-26
**Domain:** Dashboard UI, Stock Management, Inventory Adjustments
**Confidence:** HIGH

## Summary

Phase 15 implements the Medias module dashboard at `/medias` (replacing the current landing, moving products to `/medias/productos`), stock alert system with configurable thresholds, manual inventory adjustments for Admin/Medico, and a global movements history page.

The codebase already has:
- Full database schema for products (`medias_products`) with `stock_normal` and `stock_devoluciones` columns
- Stock movements table (`medias_stock_movements`) that is immutable and tracks all movement types including `ajuste_entrada` and `ajuste_salida`
- Query patterns and action patterns established in the medias module
- Cash closing (`medias_cierres`) RPC with `get_medias_cierre_summary` that calculates efectivo neto
- Returns tracking with pending count available via `getPendingReturnsCount()`
- Sales summary via `getSalesSummary()` function

The phase requires:
1. New dashboard page with metric cards and navigation cards
2. Stock alert system (threshold column on products, query for low stock)
3. Inventory adjustment RPC and UI
4. Movements history page with filters

**Primary recommendation:** Follow existing medias patterns - server components for pages, client components for interactive forms, RPC functions for atomic operations, and query functions for data fetching.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js App Router | 15 | Page structure, server components | Already in use across project |
| Supabase Client | Latest | Database queries and RPC calls | Existing pattern in medias module |
| shadcn/ui Card | Latest | Dashboard cards and metric displays | Already used in cierres, dashboard |
| lucide-react | Latest | Icons for navigation cards and alerts | Already used throughout project |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| date-fns | Latest | Date filtering for movements | Already available in project |
| Zod | Latest | Validation schemas | Existing pattern for forms |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| shadcn Card | Custom div styling | Cards provide consistent design, already used |
| date-fns | Native Date | date-fns already in project, more convenient |

**Installation:**
No new packages required - all dependencies already exist in the project.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/(protected)/medias/
│   ├── page.tsx                    # Dashboard (move productos here)
│   ├── productos/page.tsx          # Products (moved from current /medias location)
│   ├── movimientos/page.tsx        # Global movements history
│   └── movimientos/actions.ts      # Adjustment server actions
├── components/medias/
│   ├── dashboard/
│   │   ├── metric-card.tsx         # Single metric display
│   │   ├── nav-card.tsx            # Navigation card (icon + title)
│   │   ├── stock-alerts-card.tsx   # Critical stock summary + list
│   │   └── dashboard-grid.tsx      # Layout wrapper
│   ├── products/
│   │   └── products-table.tsx      # Update for stock threshold column
│   └── movements/
│       ├── movements-table.tsx     # Movement history table
│       ├── movement-filters.tsx    # Filter form
│       └── adjustment-form.tsx     # Manual adjustment dialog
├── lib/
│   ├── queries/medias/
│   │   ├── dashboard.ts            # Dashboard metrics queries
│   │   └── movements.ts            # Movements query with filters
│   └── validations/medias/
│       └── adjustment.ts           # Adjustment validation schema
└── types/medias/
    └── dashboard.ts                # Dashboard-specific types
```

### Pattern 1: Server Component Page with Client Interactive Parts
**What:** Main page is server component that fetches data, client components handle user interaction
**When to use:** Dashboard and list pages
**Example:**
```typescript
// src/app/(protected)/medias/page.tsx
// Server component - fetches all metrics
export default async function MediasDashboard() {
  const [metrics, lowStockProducts, pendingReturns] = await Promise.all([
    getDashboardMetrics(),
    getLowStockProducts(),
    getPendingReturnsCount()
  ])

  return (
    <div>
      <DashboardGrid metrics={metrics} />
      <StockAlertsCard products={lowStockProducts} />
      <NavigationCards />
    </div>
  )
}
```

### Pattern 2: RPC for Atomic Operations
**What:** Database operations that modify multiple tables or require validation use SECURITY DEFINER RPC
**When to use:** Inventory adjustments that update products and create movements
**Example:**
```sql
-- Pattern from existing codebase (034_medias_returns_rpc.sql)
CREATE OR REPLACE FUNCTION public.create_inventory_adjustment(
  p_product_id UUID,
  p_cantidad INTEGER,
  p_tipo TEXT,  -- 'entrada' or 'salida'
  p_stock_type TEXT,  -- 'normal' or 'devoluciones'
  p_razon TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
-- Lock product row FOR UPDATE, validate, update stock, create movement
$$;
```

### Pattern 3: Query Functions in lib/queries
**What:** Database queries centralized in query functions for reuse
**When to use:** All data fetching
**Example:**
```typescript
// src/lib/queries/medias/dashboard.ts
export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const supabase = await createClient()
  // Query cierres, sales, returns
  return { efectivoEnCaja, ventasHoy, ventasMes, devolucionesPendientes }
}

export async function getLowStockProducts(threshold?: number): Promise<MediasProduct[]> {
  const supabase = await createClient()
  // Query products where stock_normal < umbral_alerta
  return products
}
```

### Anti-Patterns to Avoid
- **Direct database mutations in components:** Always use server actions or RPC
- **Mixing server and client data fetching:** Keep data fetching in server components or query functions
- **Inline SQL strings:** Use parameterized queries via Supabase client

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Dashboard metrics layout | Custom grid with inline styles | shadcn Card with grid layout | Consistent with existing UI |
| Currency formatting | Manual string formatting | `Intl.NumberFormat('es-CO', {...})` | Already used in cierre-summary-card.tsx |
| Date filtering | Custom date logic | date-fns with existing patterns | Consistent with movements RPC |
| Stock movement logging | Manual INSERT | Extend existing movement type pattern | Already has immutability trigger |
| Navigation icons | Custom SVGs | lucide-react icons | Already used throughout |

**Key insight:** The medias module already has established patterns for everything this phase needs - follow them.

## Common Pitfalls

### Pitfall 1: Efectivo en Caja Calculation
**What goes wrong:** Calculating cash from sales without accounting for refunds
**Why it happens:** The cierre system has this complexity, but dashboard might miss it
**How to avoid:** Use `get_medias_cierre_summary` RPC for today's date - it already calculates `efectivo_neto` (efectivo - devoluciones_efectivo)
**Warning signs:** Cash totals don't match cierre preview

### Pitfall 2: Stock Alert Threshold Not Per-Product
**What goes wrong:** Using a global threshold when CONTEXT.md specifies per-product
**Why it happens:** Simpler to implement global, but user decided configurable per product
**How to avoid:** Add `umbral_alerta` column to `medias_products`, default to 3, allow editing
**Warning signs:** Alert logic checks against hardcoded number

### Pitfall 3: Adjustment Without Movement Record
**What goes wrong:** Updating stock_normal/stock_devoluciones without creating medias_stock_movements entry
**Why it happens:** Quick fix mentality
**How to avoid:** ALWAYS use RPC that atomically updates stock AND creates movement
**Warning signs:** Stock numbers change but no movement shows in history

### Pitfall 4: Alert Based on Total Stock
**What goes wrong:** Checking (stock_normal + stock_devoluciones) < threshold
**Why it happens:** Intuitive to check total availability
**How to avoid:** Per CONTEXT.md, alerts based on **stock_normal only** (devoluciones are "segunda calidad")
**Warning signs:** Products show critical when they have returns stock available

### Pitfall 5: Missing Role Check on Adjustments
**What goes wrong:** Any user can make inventory adjustments
**Why it happens:** Forgetting RLS/role validation
**How to avoid:** RPC checks `role IN ('admin', 'medico')` before allowing adjustment
**Warning signs:** Secretaria or Enfermera can adjust stock

## Code Examples

Verified patterns from existing codebase:

### Dashboard Metric Card Pattern
```typescript
// Based on cierre-summary-card.tsx and dashboard/page.tsx patterns
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface MetricCardProps {
  title: string
  value: string | number
  icon: React.ReactNode
  variant?: 'default' | 'primary' | 'warning'
}

export function MetricCard({ title, value, icon, variant = 'default' }: MetricCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  )
}
```

### Currency Formatting (Already in codebase)
```typescript
// Source: src/components/medias/cierres/cierre-summary-card.tsx
const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(amount)
```

### Server Action Pattern
```typescript
// Based on src/app/(protected)/medias/productos/actions.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type AdjustmentActionState = {
  error?: string
  errors?: Record<string, string[]>
  success?: boolean
}

export async function createAdjustment(
  prevState: AdjustmentActionState | null,
  formData: FormData
): Promise<AdjustmentActionState> {
  const supabase = await createClient()

  // Validation...

  const { data, error } = await supabase.rpc('create_inventory_adjustment', {
    p_product_id: formData.get('product_id'),
    // ...params
  })

  if (error) return { error: error.message }

  revalidatePath('/medias')
  revalidatePath('/medias/movimientos')
  return { success: true }
}
```

### Stock Movement Query Pattern
```typescript
// Based on src/lib/queries/medias/sales.ts pattern
export interface MovementFilters {
  product_id?: string
  tipo?: MediasMovementType
  from_date?: string
  to_date?: string
}

export async function getStockMovements(filters?: MovementFilters): Promise<MediasStockMovement[]> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('medias_stock_movements')
    .select(`
      *,
      product:medias_products(id, codigo, tipo, talla)
    `)
    .order('created_at', { ascending: false })

  if (filters?.product_id) {
    query = query.eq('product_id', filters.product_id)
  }
  if (filters?.tipo) {
    query = query.eq('tipo', filters.tipo)
  }
  if (filters?.from_date) {
    query = query.gte('created_at', filters.from_date)
  }
  if (filters?.to_date) {
    query = query.lte('created_at', filters.to_date)
  }

  const { data, error } = await query.limit(200)
  if (error) throw error
  return data || []
}
```

### Navigation Card Pattern (Simple)
```typescript
// Per CONTEXT.md: only title + icon, no counters
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Package, ShoppingCart, Truck, RotateCcw, Lock } from 'lucide-react'

const navItems = [
  { title: 'Productos', href: '/medias/productos', icon: Package },
  { title: 'Ventas', href: '/medias/ventas', icon: ShoppingCart },
  { title: 'Compras', href: '/medias/compras', icon: Truck },
  { title: 'Devoluciones', href: '/medias/devoluciones', icon: RotateCcw },
  { title: 'Cierres', href: '/medias/cierres', icon: Lock },
]

export function NavigationCards() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      {navItems.map(item => (
        <Link key={item.href} href={item.href}>
          <Card className="hover:bg-accent transition-colors cursor-pointer">
            <CardContent className="flex flex-col items-center justify-center py-6">
              <item.icon className="h-8 w-8 mb-2" />
              <span className="font-medium">{item.title}</span>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  )
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Global stock threshold | Per-product configurable | Phase 15 decision | Add umbral_alerta column |
| Products at /medias | Products at /medias/productos | Phase 15 decision | Dashboard becomes /medias |
| Movement filters: basic | Movement filters: product, date, type | Phase 15 requirement | Full filter UI needed |

**Deprecated/outdated:**
- None - this is a new feature building on existing patterns

## Database Schema Changes Required

### 1. Add Alert Threshold to Products
```sql
-- New column for configurable per-product threshold
ALTER TABLE public.medias_products
ADD COLUMN umbral_alerta INTEGER NOT NULL DEFAULT 3;

COMMENT ON COLUMN public.medias_products.umbral_alerta IS
  'Umbral para alertas de stock critico (default 3). Alerta cuando stock_normal < umbral_alerta';
```

### 2. Inventory Adjustment RPC
```sql
-- New RPC for manual adjustments
-- Follows patterns from 034_medias_returns_rpc.sql
CREATE OR REPLACE FUNCTION public.create_inventory_adjustment(
  p_product_id UUID,
  p_cantidad INTEGER,
  p_tipo TEXT,         -- 'entrada' or 'salida'
  p_stock_type TEXT,   -- 'normal' or 'devoluciones'
  p_razon TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
-- 1. Validate user is admin or medico
-- 2. Lock product row FOR UPDATE
-- 3. Validate stock doesn't go negative on salida
-- 4. Update appropriate stock column
-- 5. Create movement record with tipo = ajuste_entrada or ajuste_salida
-- 6. Return success with new stock values
$$;
```

## Open Questions

None - all decisions captured in CONTEXT.md:

1. Dashboard location: `/medias` (confirmed)
2. Stock alerts: per-product threshold on stock_normal only (confirmed)
3. Adjustments: Admin/Medico only, free text reason, choose stock type (confirmed)
4. Navigation: title + icon only, no counters (confirmed)

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `/supabase/migrations/020_medias_foundation.sql` - product and movement schema
- Codebase analysis: `/supabase/migrations/035_medias_cierre_refunds.sql` - efectivo_neto calculation
- Codebase analysis: `/src/lib/queries/medias/` - query patterns
- Codebase analysis: `/src/app/(protected)/medias/` - action patterns
- Codebase analysis: `/src/components/medias/cierres/cierre-summary-card.tsx` - card patterns

### Secondary (MEDIUM confidence)
- CONTEXT.md decisions captured from `/gsd:discuss-phase`

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All tools already in codebase
- Architecture: HIGH - Following existing medias module patterns exactly
- Pitfalls: HIGH - Based on codebase analysis and CONTEXT.md decisions

**Research date:** 2026-01-26
**Valid until:** 2026-02-26 (30 days - stable internal patterns)

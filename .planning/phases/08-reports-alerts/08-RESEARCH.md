# Phase 8: Reports & Alerts - Research

**Researched:** 2026-01-26
**Domain:** Financial reporting, data visualization, anomaly alerting
**Confidence:** HIGH

## Summary

This phase adds financial reporting dashboards and an automated alert system for Admin/Medico users. The research focused on three areas: (1) chart libraries compatible with the existing React 19 + Next.js 16 + shadcn/ui stack, (2) database design for persisting alerts triggered by payment annulations and cash closing discrepancies, and (3) patterns for building the alert notification UI.

The project already has chart color CSS variables defined (`--chart-1` through `--chart-5`) and uses Sonner for toast notifications. The existing audit_log infrastructure captures all data changes, including payment annulations. The recommended approach is to use Recharts via shadcn/ui's chart component for visualizations, create a dedicated `alerts` table with database triggers to auto-generate alerts, and add an alert widget to the existing dashboard.

**Primary recommendation:** Use shadcn/ui chart components (Recharts wrapper) with a react-is override for React 19 compatibility, create alerts via PostgreSQL triggers on payment annulations and cash closing inserts with diferencia != 0, and display alerts as a card widget on the dashboard with a badge counter in the navigation.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| recharts | ^3.6.0 | Charts (bar, pie) | Official shadcn/ui recommendation, React-native SVG rendering, works with existing CSS variables |
| @/components/ui/chart | N/A (shadcn) | Chart wrapper | Type-safe ChartConfig, built-in tooltips/legends, consistent styling |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| date-fns | ^4.1.0 (existing) | Date manipulation | Date range calculations, formatting for reports |
| sonner | ^2.0.7 (existing) | Toast notifications | Real-time alert toast when new alert created |
| lucide-react | ^0.563.0 (existing) | Icons | Alert severity icons, chart legends |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Recharts | Chart.js / react-chartjs-2 | Chart.js is canvas-based, better for real-time; Recharts is SVG, better for static dashboards and easier React integration |
| Recharts | @nivo/pie, @nivo/bar | More sophisticated animations; heavier bundle, overkill for simple bar/pie charts |
| Custom alerts table | Audit log queries | Using audit_log directly is complex; dedicated alerts table is simpler, queryable, supports resolution tracking |

**Installation:**
```bash
npx shadcn@latest add chart
```

**Required package.json override for React 19:**
```json
{
  "overrides": {
    "react-is": "^19.0.0"
  }
}
```

Then run: `npm install --legacy-peer-deps`

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/(protected)/
│   ├── dashboard/
│   │   └── page.tsx              # Add alerts widget here
│   └── reportes/
│       ├── page.tsx              # Reports page (daily/monthly/range)
│       └── actions.ts            # Server actions for report data
├── components/
│   ├── reports/
│   │   ├── income-bar-chart.tsx  # Bar chart by payment method
│   │   ├── income-pie-chart.tsx  # Pie chart by payment method (optional)
│   │   ├── date-range-picker.tsx # Date selector for custom range
│   │   └── report-summary-card.tsx # Total cards with numbers
│   └── alerts/
│       ├── alerts-widget.tsx     # Dashboard widget showing recent alerts
│       ├── alert-badge.tsx       # Badge with unread count for nav
│       └── alert-item.tsx        # Individual alert row
├── lib/
│   └── queries/
│       ├── reports.ts            # Report aggregation queries
│       └── alerts.ts             # Alerts CRUD queries
└── types/
    └── reports.ts                # Report and Alert types
```

### Pattern 1: shadcn/ui Chart with ChartConfig
**What:** Type-safe chart configuration using shadcn's ChartContainer
**When to use:** All charts in this project
**Example:**
```typescript
// Source: https://ui.shadcn.com/docs/components/chart
"use client"

import { Bar, BarChart, CartesianGrid, XAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from "@/components/ui/chart"
import type { ChartConfig } from "@/components/ui/chart"

const chartConfig = {
  efectivo: {
    label: "Efectivo",
    color: "hsl(var(--chart-1))",
  },
  tarjeta: {
    label: "Tarjeta",
    color: "hsl(var(--chart-2))",
  },
  transferencia: {
    label: "Transferencia",
    color: "hsl(var(--chart-3))",
  },
  nequi: {
    label: "Nequi",
    color: "hsl(var(--chart-4))",
  },
} satisfies ChartConfig

export function IncomeBarChart({ data }: { data: ReportData[] }) {
  return (
    <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
      <BarChart data={data}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="efectivo" fill="var(--color-efectivo)" />
        <Bar dataKey="tarjeta" fill="var(--color-tarjeta)" />
        <Bar dataKey="transferencia" fill="var(--color-transferencia)" />
        <Bar dataKey="nequi" fill="var(--color-nequi)" />
      </BarChart>
    </ChartContainer>
  )
}
```

### Pattern 2: Database Trigger for Alert Generation
**What:** PostgreSQL trigger that automatically creates alerts when anomalies occur
**When to use:** Payment annulation, cash closing with difference
**Example:**
```sql
-- Source: Supabase Docs - https://supabase.com/docs/guides/database/postgres/triggers
-- Alert generation trigger for payment annulation
CREATE OR REPLACE FUNCTION generate_payment_anulacion_alert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only trigger when estado changes to 'anulado'
  IF OLD.estado = 'activo' AND NEW.estado = 'anulado' THEN
    INSERT INTO alerts (
      tipo,
      severidad,
      titulo,
      descripcion,
      referencia_tipo,
      referencia_id,
      created_at
    ) VALUES (
      'pago_anulado',
      'advertencia',
      'Pago Anulado',
      format('Pago %s anulado. Monto: $%s. Motivo: %s',
             NEW.numero_factura,
             NEW.total::text,
             COALESCE(NEW.anulacion_justificacion, 'Sin motivo')),
      'payment',
      NEW.id,
      now()
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_alert_payment_anulacion
  AFTER UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION generate_payment_anulacion_alert();
```

### Pattern 3: Server-Side Report Aggregation
**What:** Aggregate payment data in database for report views
**When to use:** Daily, monthly, and custom range reports
**Example:**
```typescript
// src/lib/queries/reports.ts
import { createClient } from '@/lib/supabase/server'

interface ReportFilters {
  startDate: string  // YYYY-MM-DD
  endDate: string    // YYYY-MM-DD
}

interface IncomeReport {
  total_efectivo: number
  total_tarjeta: number
  total_transferencia: number
  total_nequi: number
  total_descuentos: number
  total_anulaciones: number
  grand_total: number
  payment_count: number
  citas_atendidas: number
}

export async function getIncomeReport(filters: ReportFilters): Promise<IncomeReport> {
  const supabase = await createClient()

  // Use RPC for complex aggregation or build query
  const { data, error } = await supabase.rpc('get_income_report', {
    p_start_date: filters.startDate,
    p_end_date: filters.endDate
  })

  if (error) throw error
  return data
}
```

### Anti-Patterns to Avoid
- **Client-side aggregation:** Never fetch all payments and aggregate in the browser. Use database RPC functions for aggregation.
- **Polling for alerts:** Don't poll the database for new alerts. Use Supabase Realtime subscriptions if real-time is truly needed, otherwise just fetch on page load.
- **Mixing chart libraries:** Don't mix Recharts with other chart libraries. Stick to one for consistency.
- **Recharts without "use client":** Recharts uses browser APIs and must be in client components with the "use client" directive.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Date range picker | Custom input fields | shadcn date picker / popover | Edge cases with date validation, accessibility |
| Chart tooltips | Custom div positioning | ChartTooltipContent from shadcn | Positioning logic, overflow handling |
| Alert severity badges | Custom styled spans | Existing Badge component with variants | Already has info/warning/destructive variants |
| Report date grouping | Manual JS date loops | PostgreSQL date_trunc + GROUP BY | Database is far more efficient for aggregations |
| Alert count badge | Separate state management | Server component with count query | Simpler, always fresh on navigation |

**Key insight:** The existing codebase already has shadcn/ui components (Badge, Card, Table) and Supabase patterns. Reports and alerts should follow the same established patterns, not introduce new paradigms.

## Common Pitfalls

### Pitfall 1: Recharts Not Rendering in React 19
**What goes wrong:** Charts appear blank with no console errors after upgrading to React 19.2.3
**Why it happens:** `react-is` dependency mismatch between Recharts and React 19
**How to avoid:** Add the `overrides` entry in package.json and reinstall with `--legacy-peer-deps`
**Warning signs:** Blank chart containers, no SVG elements in DOM inspection

### Pitfall 2: "use client" Directive Missing
**What goes wrong:** "window is not defined" or hydration errors
**Why it happens:** Recharts uses browser-only APIs (SVG, DOM measurements)
**How to avoid:** Always add `"use client"` at the top of chart components
**Warning signs:** Server-side rendering errors, hydration mismatches

### Pitfall 3: Large Data Sets in Charts
**What goes wrong:** Slow rendering, browser freezes
**Why it happens:** Recharts is SVG-based; thousands of data points create thousands of DOM elements
**How to avoid:** Aggregate data at database level (daily totals, not individual payments), limit visible data points to ~30 for bar charts
**Warning signs:** Lag when rendering, memory warnings

### Pitfall 4: Alert Table Without Indexes
**What goes wrong:** Slow queries as alerts accumulate
**Why it happens:** Missing indexes on commonly queried fields
**How to avoid:** Index on (resuelta, created_at DESC) for unread alerts query, index on (referencia_tipo, referencia_id) for lookups
**Warning signs:** Query times increasing over months

### Pitfall 5: Timezone Issues in Reports
**What goes wrong:** Payments appear on wrong day in reports
**Why it happens:** Mixing server timezone (UTC) with user timezone for date boundaries
**How to avoid:** Store payments with `created_at` in UTC, convert to local timezone (`America/Bogota`) when calculating day boundaries for reports
**Warning signs:** Payments near midnight showing on adjacent days

### Pitfall 6: Alert Generation Race Conditions
**What goes wrong:** Multiple alerts for same event, or missing alerts
**Why it happens:** Trigger fires but alert insert fails silently
**How to avoid:** Use SECURITY DEFINER on trigger function, wrap in exception handling that logs errors
**Warning signs:** Gaps in alert sequence, duplicate alerts

## Code Examples

Verified patterns from official sources:

### Alerts Table Schema
```sql
-- Migration: xxx_alerts_table.sql
CREATE TYPE alert_tipo AS ENUM ('pago_anulado', 'diferencia_cierre');
CREATE TYPE alert_severidad AS ENUM ('info', 'advertencia', 'critico');

CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo alert_tipo NOT NULL,
  severidad alert_severidad NOT NULL,
  titulo VARCHAR(100) NOT NULL,
  descripcion TEXT NOT NULL,
  referencia_tipo VARCHAR(50),  -- 'payment', 'cash_closing'
  referencia_id UUID,           -- ID of related record
  resuelta BOOLEAN NOT NULL DEFAULT false,
  resuelta_por UUID REFERENCES auth.users(id),
  resuelta_at TIMESTAMPTZ,
  resuelta_notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Index for unread alerts query (most common)
  CONSTRAINT idx_alerts_unread UNIQUE (resuelta, created_at)
);

-- Indexes
CREATE INDEX idx_alerts_created_at ON alerts(created_at DESC);
CREATE INDEX idx_alerts_referencia ON alerts(referencia_tipo, referencia_id);
CREATE INDEX idx_alerts_unread_first ON alerts(resuelta, created_at DESC);

-- RLS
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

-- Only admin/medico can see and resolve alerts
CREATE POLICY "Admin and medico can view alerts"
  ON alerts FOR SELECT TO authenticated
  USING (public.get_user_role() IN ('admin', 'medico'));

CREATE POLICY "Admin and medico can update alerts"
  ON alerts FOR UPDATE TO authenticated
  USING (public.get_user_role() IN ('admin', 'medico'))
  WITH CHECK (public.get_user_role() IN ('admin', 'medico'));
```

### Cash Closing Alert Trigger
```sql
-- Alert generation for cash closing with difference
CREATE OR REPLACE FUNCTION generate_cierre_diferencia_alert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only trigger when there's a difference
  IF NEW.diferencia != 0 THEN
    INSERT INTO alerts (
      tipo,
      severidad,
      titulo,
      descripcion,
      referencia_tipo,
      referencia_id,
      created_at
    ) VALUES (
      'diferencia_cierre',
      CASE
        WHEN NEW.diferencia < 0 THEN 'critico'  -- Faltante
        ELSE 'advertencia'                       -- Sobrante
      END,
      CASE
        WHEN NEW.diferencia < 0 THEN 'Faltante en Cierre'
        ELSE 'Sobrante en Cierre'
      END,
      format('Cierre %s del %s. Diferencia: $%s. Justificacion: %s',
             NEW.cierre_numero,
             NEW.fecha_cierre::text,
             ABS(NEW.diferencia)::text,
             COALESCE(NEW.diferencia_justificacion, 'Sin justificacion')),
      'cash_closing',
      NEW.id,
      now()
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_alert_cierre_diferencia
  AFTER INSERT ON cash_closings
  FOR EACH ROW
  EXECUTE FUNCTION generate_cierre_diferencia_alert();
```

### Report RPC Function
```sql
-- Get income report for date range
CREATE OR REPLACE FUNCTION get_income_report(
  p_start_date DATE,
  p_end_date DATE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'total_efectivo', COALESCE(SUM(
      CASE WHEN pm.metodo = 'efectivo' THEN pm.monto ELSE 0 END
    ), 0),
    'total_tarjeta', COALESCE(SUM(
      CASE WHEN pm.metodo = 'tarjeta' THEN pm.monto ELSE 0 END
    ), 0),
    'total_transferencia', COALESCE(SUM(
      CASE WHEN pm.metodo = 'transferencia' THEN pm.monto ELSE 0 END
    ), 0),
    'total_nequi', COALESCE(SUM(
      CASE WHEN pm.metodo = 'nequi' THEN pm.monto ELSE 0 END
    ), 0),
    'total_descuentos', COALESCE(SUM(p.descuento), 0),
    'total_anulaciones', COALESCE(SUM(
      CASE WHEN p.estado = 'anulado' THEN p.total ELSE 0 END
    ), 0),
    'grand_total', COALESCE(SUM(
      CASE WHEN p.estado = 'activo' THEN p.total ELSE 0 END
    ), 0),
    'payment_count', COUNT(DISTINCT p.id),
    'citas_atendidas', (
      SELECT COUNT(*) FROM appointments a
      WHERE DATE(a.fecha_hora_inicio) BETWEEN p_start_date AND p_end_date
      AND a.estado = 'completada'
    )
  ) INTO v_result
  FROM payments p
  LEFT JOIN payment_methods pm ON pm.payment_id = p.id
  WHERE DATE(p.created_at) BETWEEN p_start_date AND p_end_date;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_income_report(DATE, DATE) TO authenticated;
```

### Alert Badge Component
```typescript
// src/components/alerts/alert-badge.tsx
import { Badge } from "@/components/ui/badge"
import { Bell } from "lucide-react"
import { createClient } from "@/lib/supabase/server"

export async function AlertBadge() {
  const supabase = await createClient()

  // Get unread alert count
  const { count } = await supabase
    .from('alerts')
    .select('*', { count: 'exact', head: true })
    .eq('resuelta', false)

  const unreadCount = count ?? 0

  return (
    <div className="relative">
      <Bell className="h-5 w-5" />
      {unreadCount > 0 && (
        <Badge
          variant="destructive"
          className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-xs"
        >
          {unreadCount > 9 ? '9+' : unreadCount}
        </Badge>
      )}
    </div>
  )
}
```

### Alert Severity Mapping
```typescript
// src/types/alerts.ts
export const ALERT_SEVERIDADES = ['info', 'advertencia', 'critico'] as const
export type AlertSeveridad = (typeof ALERT_SEVERIDADES)[number]

export const ALERT_TIPOS = ['pago_anulado', 'diferencia_cierre'] as const
export type AlertTipo = (typeof ALERT_TIPOS)[number]

export const ALERT_SEVERIDAD_CONFIG: Record<AlertSeveridad, {
  label: string
  variant: 'secondary' | 'outline' | 'destructive'
  icon: string  // lucide icon name
  bgColor: string
}> = {
  info: {
    label: 'Informativo',
    variant: 'secondary',
    icon: 'Info',
    bgColor: 'bg-blue-50',
  },
  advertencia: {
    label: 'Advertencia',
    variant: 'outline',
    icon: 'AlertTriangle',
    bgColor: 'bg-yellow-50',
  },
  critico: {
    label: 'Critico',
    variant: 'destructive',
    icon: 'AlertCircle',
    bgColor: 'bg-red-50',
  },
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| react-chartjs-2 | Recharts via shadcn/ui | 2024 | Better React integration, type-safe config, consistent styling |
| Custom polling for alerts | Supabase Realtime or page-load fetch | 2023 | Less server load, simpler code |
| Client-side date aggregation | Database RPC functions | Always | Performance, accuracy |

**Deprecated/outdated:**
- Recharts 2.x: Use 3.x for React 19 compatibility
- Manual ResponsiveContainer sizing: shadcn ChartContainer handles this

## Open Questions

Things that couldn't be fully resolved:

1. **Real-time alert updates**
   - What we know: Supabase Realtime can push database changes to client
   - What's unclear: Whether real-time is needed or if page-load refresh is sufficient
   - Recommendation: Start with page-load fetch (simpler); add Realtime subscription later if users request it

2. **Bar vs Pie chart preference**
   - What we know: Context says "barras o pie" - Claude's discretion
   - Recommendation: Use **bar chart** for daily breakdown (shows trend over time), **pie chart** is optional for showing proportion of total in single view

3. **Alert notification toast**
   - What we know: Sonner is available for toasts
   - What's unclear: Should new alerts trigger a toast when user is on dashboard?
   - Recommendation: No toast on initial load; consider Realtime + toast only if real-time alerts are added later

## Sources

### Primary (HIGH confidence)
- shadcn/ui chart documentation - https://ui.shadcn.com/docs/components/chart (installation, ChartConfig pattern)
- shadcn/ui React 19 guide - https://ui.shadcn.com/docs/react-19 (react-is override requirement)
- Supabase Triggers documentation - https://supabase.com/docs/guides/database/postgres/triggers (trigger syntax, AFTER triggers)
- Existing codebase: supabase/migrations/002_audit_infrastructure.sql (trigger pattern)
- Existing codebase: supabase/migrations/010_payments_immutability.sql (anulacion pattern)
- Existing codebase: src/app/globals.css (chart CSS variables already defined)

### Secondary (MEDIUM confidence)
- Recharts GitHub releases - https://github.com/recharts/recharts/releases (version 3.6.0)
- Recharts React 19 issue - https://github.com/recharts/recharts/issues/6857 (known rendering issue with 19.2.3)

### Tertiary (LOW confidence)
- WebSearch results for "react chart libraries 2026" - ecosystem landscape
- WebSearch results for "postgresql anomaly detection" - general patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - shadcn/ui official docs verify Recharts integration and React 19 workaround
- Architecture: HIGH - follows established patterns in codebase (triggers, RPC functions, server components)
- Pitfalls: MEDIUM - some pitfalls (React 19 rendering) are from recent GitHub issues, may be resolved

**Research date:** 2026-01-26
**Valid until:** 2026-02-26 (30 days - Recharts/React 19 compatibility may stabilize)

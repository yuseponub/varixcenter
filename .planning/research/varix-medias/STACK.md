# Technology Stack: Varix-Medias Module

**Project:** VarixClinic v1.1 - Compression Stockings Retail Module
**Researched:** 2026-01-25
**Confidence:** HIGH (existing patterns validated, new additions researched with current sources)

---

## Executive Summary

The Varix-Medias module requires minimal stack additions. The existing VarixClinic infrastructure (Next.js 15, Supabase, shadcn/ui) handles 90% of requirements. The only genuinely new capability needed is **OCR for purchase invoice processing**, which is best solved with **Tesseract.js 7.x** running client-side.

**Key insight:** This is a feature module, not a new application. Leverage existing patterns ruthlessly.

---

## Core Stack (Existing - DO NOT CHANGE)

These technologies are already validated in VarixClinic. Continue using them as-is.

| Technology | Version | Purpose | Status |
|------------|---------|---------|--------|
| Next.js | 16.1.4 | Framework with App Router | Validated |
| React | 19.2.3 | UI library | Validated |
| TypeScript | ^5 | Type safety | Validated |
| Supabase | ^2.91.1 | Database, Auth, Storage, RLS | Validated |
| @supabase/ssr | ^0.8.0 | Server-side Supabase client | Validated |
| shadcn/ui | (Radix) | Component library | Validated |
| Tailwind CSS | ^4 | Styling | Validated |
| React Hook Form | ^7.71.1 | Form handling | Validated |
| Zod | ^4.3.6 | Schema validation | Validated |
| @tanstack/react-table | ^8.21.3 | Data tables | Validated |
| lucide-react | ^0.563.0 | Icons | Validated |
| sonner | ^2.0.7 | Toast notifications | Validated |

**Existing patterns to reuse:**
- Immutable payment patterns (triggers, RLS, gapless invoice numbering)
- Receipt photo upload with signed URLs
- Cash closing workflow (summary RPC, photo, block after close)
- Audit logging infrastructure
- Role-based access control (user_roles table + JWT claims)

---

## New Additions

### 1. OCR for Purchase Invoice Processing

**Problem:** Manually entering supplier invoice data is tedious and error-prone. Users want to photograph invoices and extract key fields automatically.

**Recommended:** Tesseract.js 7.0.0 (client-side)

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Library | tesseract.js ^7.0.0 | Pure JS, WASM-based, no server dependency |
| Execution | Client-side (browser) | No Edge Function limits, no API costs |
| Language | Spanish ('spa') | Colombian invoices |
| Fallback | Manual entry form | OCR assists, doesn't block |

**Why Tesseract.js over alternatives:**

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **Tesseract.js** | Free, client-side, 100+ languages, no API calls | ~2-3MB WASM download, "good enough" accuracy | **RECOMMENDED** |
| Scribe.js | Better accuracy, PDF support | Larger bundle, newer/less proven | Overkill for simple invoices |
| OCR.space API | Cloud-based, accurate | API dependency, per-request cost, latency | Unnecessary complexity |
| Google Vision / AWS Textract | Enterprise-grade accuracy | Significant cost, API integration | Way overkill |
| Supabase Edge Function + OCR | Server-side processing | WASM memory limits (5MB images), Edge Function cold starts | Doesn't work well |

**Implementation pattern:**
```typescript
// Client-side OCR component
import { createWorker } from 'tesseract.js';

async function extractInvoiceData(imageFile: File) {
  const worker = await createWorker('spa');
  const { data: { text } } = await worker.recognize(imageFile);
  await worker.terminate();

  // Parse text for: fecha, numero_factura, proveedor, total
  return parseInvoiceText(text);
}
```

**Installation:**
```bash
npm install tesseract.js@^7.0.0
```

**Bundle impact:** ~150KB JS + ~2-3MB WASM (lazy loaded on first use)

---

### 2. Inventory Management

**Problem:** Track stock levels, movements, and separate normal vs. returns inventory.

**Recommended:** No new libraries needed. Use existing Supabase + PostgreSQL patterns.

**Why no new libraries:**
- 11 fixed products (not thousands) - simple queries suffice
- Stock movements are immutable (like payments) - reuse trigger pattern
- Inventory tracking is CRUD + aggregation - Supabase handles this natively

**Database pattern (PostgreSQL):**
```sql
-- Products table (static catalog)
CREATE TABLE medias_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT UNIQUE NOT NULL,  -- 'ML-PN-S', 'ML-PN-M', etc.
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('Muslo', 'Panty', 'Rodilla')),
  talla TEXT NOT NULL CHECK (talla IN ('S', 'M', 'L', 'XL', 'XXL')),
  precio DECIMAL(12,2) NOT NULL,
  activo BOOLEAN DEFAULT true
);

-- Inventory tracking
CREATE TABLE medias_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES medias_products(id),
  stock_normal INTEGER NOT NULL DEFAULT 0,
  stock_devoluciones INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(product_id)
);

-- Movement log (immutable, like payments)
CREATE TABLE medias_stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES medias_products(id),
  tipo TEXT NOT NULL CHECK (tipo IN (
    'compra',           -- supplier purchase
    'venta',            -- sale (decrements stock_normal)
    'devolucion_cliente', -- customer return (increments stock_devoluciones)
    'devolucion_proveedor', -- return to supplier
    'ajuste_positivo',  -- inventory correction +
    'ajuste_negativo',  -- inventory correction -
    'transferencia'     -- move from devoluciones to normal
  )),
  cantidad INTEGER NOT NULL,
  stock_antes INTEGER NOT NULL,
  stock_despues INTEGER NOT NULL,
  referencia_id UUID,   -- points to sale_id, purchase_id, etc.
  notas TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Immutability trigger (reuse pattern from payments)
CREATE TRIGGER tr_stock_movements_immutable
  BEFORE UPDATE OR DELETE ON medias_stock_movements
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();
```

---

### 3. Point of Sale (Sales)

**Problem:** Quick product selection, multiple payment methods, receipt photos.

**Recommended:** No new libraries needed. Reuse existing payment patterns.

**Why no new libraries:**
- Sale creation is identical to clinic payments (atomic RPC with gapless numbering)
- Product selection is a simple form (not a barcode scanner)
- Receipt upload uses existing signed URL pattern
- shadcn/ui components suffice for POS interface

**Reusable patterns from VarixClinic:**
| Pattern | Original | Varix-Medias Use |
|---------|----------|------------------|
| `create_payment_with_invoice` RPC | Clinic payments | `create_medias_sale` RPC |
| Gapless invoice numbering | `invoice_counter` table | `medias_invoice_counter` table |
| Immutability trigger | `tr_payment_immutability` | `tr_medias_sale_immutability` |
| Receipt upload | `createReceiptUploadUrl()` | Same function, different subfolder |
| Payment methods | `payment_method_type` enum | Reuse same enum |

**UI components to build (shadcn/ui based):**
- Product selector grid (simple button grid, not complex POS)
- Quantity input
- Payment method selector (reuse from clinic)
- Receipt photo upload (reuse component)

---

### 4. Returns/Refunds Workflow

**Problem:** Two-phase returns (request -> approval) with inventory impact.

**Recommended:** No new libraries needed. State machine pattern in PostgreSQL.

**Pattern:**
```sql
CREATE TABLE medias_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID REFERENCES medias_sales(id),
  product_id UUID REFERENCES medias_products(id),
  cantidad INTEGER NOT NULL,
  estado TEXT NOT NULL DEFAULT 'solicitada'
    CHECK (estado IN ('solicitada', 'aprobada', 'rechazada')),
  motivo TEXT NOT NULL,

  -- Request phase (enfermera)
  solicitada_por UUID REFERENCES auth.users(id),
  solicitada_at TIMESTAMPTZ DEFAULT now(),

  -- Approval phase (admin)
  resuelta_por UUID REFERENCES auth.users(id),
  resuelta_at TIMESTAMPTZ,
  resolucion_notas TEXT,

  -- Immutability
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Trigger: When estado -> 'aprobada', create stock movement
CREATE FUNCTION process_return_approval() RETURNS TRIGGER ...
```

---

### 5. Separate Cash Drawer

**Problem:** Medias cash closing must be independent from clinic cash closing.

**Recommended:** No new libraries. Clone cash closing pattern with separate tables.

**Pattern:**
```sql
-- Separate invoice counter for medias
CREATE TABLE medias_invoice_counter (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_number INTEGER NOT NULL DEFAULT 0,
  prefix TEXT NOT NULL DEFAULT 'M'
);

-- Separate cash closing table
CREATE TABLE medias_cash_closings (
  -- Same structure as clinic cash_closings
  -- Different table = different cash drawer
);

-- Separate closing summary RPC
CREATE FUNCTION get_medias_closing_summary(p_fecha DATE) ...
```

---

## What NOT to Add (and Why)

| Technology | Why NOT |
|------------|---------|
| **Redux / Zustand** | React 19 + Server Components handles state. Form state via React Hook Form. |
| **Prisma** | Already using Supabase client. Adding ORM increases complexity for no benefit. |
| **Sharp / Jimp** | Image processing not needed. Supabase Storage handles image serving. |
| **Scribe.js** | Tesseract.js is sufficient for invoice OCR. Scribe.js is larger and overkill. |
| **Barcode scanner library** | 11 fixed products don't need barcode scanning. Button grid suffices. |
| **PDF generation library** | Not in scope. Receipts are photos, not generated PDFs. |
| **Separate auth system** | Reuse existing Supabase Auth + user_roles. Same users, same roles. |
| **External OCR API** | API costs and latency unnecessary. Tesseract.js is free and fast enough. |
| **Inventory management SaaS** | 11 products with simple tracking. Building custom is faster than integrating. |
| **Analytics library** | Supabase queries + simple aggregations suffice for MVP metrics. |

---

## Integration Points

### With Existing VarixClinic

| Integration | How |
|-------------|-----|
| **Authentication** | Same `auth.users` + `user_roles` table. No changes needed. |
| **Authorization** | Same role checks (admin, medico, enfermera). Add medias-specific RLS policies. |
| **Navigation** | Add "Medias" section to existing sidebar. Route: `/medias/*` |
| **Storage** | Same `payment-receipts` bucket, new subfolder: `medias/ventas/`, `medias/cierres/` |
| **Audit log** | Same `audit_log` table. Medias tables get same `audit_trigger_func()`. |
| **UI patterns** | Same shadcn/ui components, same form patterns, same table patterns. |

### Database Schema Isolation

Medias tables are prefixed with `medias_` for clear separation:
- `medias_products`
- `medias_inventory`
- `medias_sales`
- `medias_sale_items`
- `medias_sale_methods`
- `medias_returns`
- `medias_purchases`
- `medias_purchase_items`
- `medias_stock_movements`
- `medias_cash_closings`
- `medias_invoice_counter`

This keeps the clinic and medias data logically separated while sharing infrastructure.

---

## Installation Summary

**Single new dependency:**
```bash
npm install tesseract.js@^7.0.0
```

**That's it.** Everything else uses existing stack.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Tesseract.js OCR accuracy insufficient | Medium | Low | OCR is assistive, not required. Manual entry always available. |
| WASM bundle size affects load time | Low | Low | Lazy load on first purchase entry. Most users won't need it daily. |
| Inventory race conditions | Low | Medium | Use PostgreSQL transactions + row locks (same pattern as invoice counter). |

---

## Sources

### Verified (HIGH confidence)
- [Tesseract.js GitHub](https://github.com/naptha/tesseract.js) - v7.0.0 confirmed, Node.js 16+ required
- Existing VarixClinic codebase (`package.json`, migrations, queries)

### Research (MEDIUM confidence)
- [Tesseract.js npm](https://www.npmjs.com/package/tesseract.js) - Usage patterns
- [Supabase Storage Next.js Guide](https://github.com/devpayoub/Supabase-Storage-Guide) - Signed URL patterns
- [Inventory Management Best Practices](https://www.fishbowlinventory.com/blog/inventory-database) - Schema design
- [Returns Management Patterns](https://www.agilescs.com/blog/what-is-returns-management) - Workflow design

### Considered but not recommended
- [Scribe.js OCR](https://github.com/scribeocr/scribe.js) - Better accuracy but larger bundle, overkill for this use case
- [OCR.space API](https://ocr.space/ocrapi) - Unnecessary API dependency and cost

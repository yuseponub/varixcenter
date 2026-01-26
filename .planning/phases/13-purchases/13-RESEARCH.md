# Phase 13: Purchases - Research

**Researched:** 2026-01-26
**Domain:** Purchase registration with OCR invoice parsing, two-step reception flow, stock management
**Confidence:** MEDIUM (OCR recommendations verified with official docs, patterns from existing codebase)

## Summary

This phase implements a purchase registration system with OCR-based invoice parsing. The two-step flow (register purchase -> confirm reception -> stock increment) requires careful state management and atomic stock operations. The primary technical challenge is OCR integration for invoice parsing.

Research identified that OpenAI's GPT-4o vision API with structured outputs is the optimal choice for invoice OCR. The project already uses OpenAI for audio transcription (Whisper), making this a natural extension. GPT-4o provides excellent accuracy for printed invoices, handles Spanish text well, and supports structured JSON output via response_format. Alternative specialized services (Mindee, Veryfi) offer higher accuracy for complex invoices but add dependency and cost complexity.

For PDF handling, `pdfjs-dist` (Mozilla's PDF.js) is the standard for converting PDF pages to images in browser/Node.js. The project's existing storage patterns with Supabase signed URLs can be extended for purchase invoices. The database design should follow the established patterns from `medias_sales` (header + items), with additional status tracking for the two-step reception flow.

**Primary recommendation:** Use OpenAI GPT-4o vision API with structured outputs for OCR, following the existing transcription API pattern. Implement PDF-to-image conversion with pdfjs-dist on the server side.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| OpenAI API | v4.x | Invoice OCR via GPT-4o vision | Already in project for transcription, excellent Spanish support, structured outputs |
| pdfjs-dist | v5.x | PDF to image conversion | Mozilla's official PDF.js, works in Node.js, mature and stable |
| zod | v4.3+ | Schema validation for OCR output | Already in project, integrates with structured outputs |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @supabase/supabase-js | v2.91+ | Storage for invoice files | Already in project, use existing signed URL pattern |
| canvas / @napi-rs/canvas | latest | PDF page rendering in Node.js | Required for pdfjs-dist server-side rendering |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| OpenAI GPT-4o | Mindee SDK | Mindee: higher accuracy for complex invoices, but adds vendor dependency and monthly costs |
| OpenAI GPT-4o | Google Cloud Vision + GPT-4 | More complex setup, requires two API calls, slightly better OCR for poor quality images |
| OpenAI GPT-4o | Tesseract.js | Free and local, but significantly lower accuracy, requires extensive post-processing |

**Installation:**
```bash
# pdfjs-dist for PDF handling (if not already installed)
npm install pdfjs-dist @napi-rs/canvas
```

Note: OpenAI is already configured via OPENAI_API_KEY environment variable for transcription.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/api/ocr/
│   └── route.ts                    # OCR API endpoint (Next.js API route)
├── app/(protected)/compras/
│   ├── page.tsx                    # Purchase list with filters
│   ├── nueva/page.tsx              # New purchase flow
│   └── actions.ts                  # Server actions for purchases
├── components/purchases/
│   ├── invoice-upload.tsx          # Invoice file upload with preview
│   ├── ocr-product-review.tsx      # Review/edit parsed products
│   ├── purchase-form.tsx           # Purchase header form
│   ├── purchases-table.tsx         # Purchase list with filters
│   └── confirm-reception-dialog.tsx # Reception confirmation
├── lib/
│   ├── ocr/
│   │   ├── pdf-to-image.ts         # PDF page conversion
│   │   └── invoice-parser.ts       # GPT-4o structured extraction
│   ├── queries/purchases.ts        # Database queries
│   ├── storage/purchases.ts        # Storage helpers
│   └── validations/purchase.ts     # Zod schemas
├── types/
│   └── purchases.ts                # TypeScript types
supabase/
└── migrations/
    ├── 030_purchases_tables.sql    # Schema, RLS, indexes
    └── 031_create_purchase_rpc.sql # Atomic RPC for stock increment
```

### Pattern 1: Two-Step State Machine
**What:** Purchases have explicit states: `pendiente_recepcion` -> `recibido`
**When to use:** Any multi-step workflow with status transitions
**Example:**
```typescript
// Source: Existing project pattern from appointments state machine
export const PURCHASE_STATES = ['pendiente_recepcion', 'recibido', 'anulado'] as const
export type PurchaseState = typeof PURCHASE_STATES[number]

// Valid transitions
const VALID_TRANSITIONS: Record<PurchaseState, PurchaseState[]> = {
  'pendiente_recepcion': ['recibido', 'anulado'],
  'recibido': ['anulado'], // Only admin with justification
  'anulado': []            // Terminal state
}

export function canTransition(from: PurchaseState, to: PurchaseState): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}
```

### Pattern 2: OCR with User Confirmation Flow
**What:** Parse invoice -> Show results -> User edits/confirms -> Save
**When to use:** Any AI/OCR extraction requiring human verification
**Example:**
```typescript
// Step 1: Upload returns parsed products
interface OCRResult {
  productos: ParsedProduct[]
  proveedor?: string
  fecha_factura?: string
  total?: number
  confidence: number // 0-1 overall confidence
}

// Step 2: User reviews/edits in form
// Step 3: Submit creates purchase with confirmed data

// UI state machine
type OCRFlowState =
  | { step: 'upload' }
  | { step: 'processing' }
  | { step: 'review', data: OCRResult }
  | { step: 'error', message: string }
  | { step: 'saving' }
```

### Pattern 3: Header + Items with Atomic Stock Increment
**What:** Purchase header + line items, RPC for atomic stock changes
**When to use:** Any transactional operation with related records and stock changes
**Example:**
```sql
-- Source: Existing pattern from 023_create_medias_sale_rpc.sql
CREATE OR REPLACE FUNCTION public.confirm_purchase_reception(
  p_purchase_id UUID,
  p_confirmed_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
-- Lock purchase row
-- Lock all product rows with FOR UPDATE
-- Increment stock_normal for each item
-- Log stock movements with referencia_tipo = 'compra'
-- Update purchase estado to 'recibido'
-- Return success
$$;
```

### Anti-Patterns to Avoid
- **Stock increment on registration:** Stock should ONLY increase on confirmed reception, not on initial registration. This prevents counting inventory that hasn't physically arrived.
- **OCR without confirmation:** Never trust OCR output directly. Always show parsed data to user for review before saving.
- **Client-side PDF processing:** PDF rendering with canvas requires significant resources. Do it server-side in the API route.
- **Non-atomic stock updates:** Always use RPC with FOR UPDATE row locking to prevent race conditions when multiple users confirm receptions simultaneously.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PDF to image | Custom PDF parser | pdfjs-dist | Complex rendering, edge cases, font handling |
| Invoice text extraction | Tesseract patterns | GPT-4o vision | Multi-language, layout understanding, structured output |
| Structured JSON from LLM | String parsing | OpenAI structured outputs with Zod schema | Guaranteed valid JSON, type safety |
| Gapless purchase numbers | PostgreSQL SEQUENCE | Counter table pattern (like venta_counter) | Sequences have gaps on rollback |
| File upload with progress | XHR/fetch manual | Existing ReceiptUpload component pattern | Already handles signed URLs, preview, errors |
| Approval workflow for enfermera | Custom implementation | Extend alerts system | Already has resolution tracking, role-based visibility |

**Key insight:** The project already has established patterns for storage (receipts.ts), atomic operations (sale RPC), state machines (appointments), and alerts. Extend these rather than creating new patterns.

## Common Pitfalls

### Pitfall 1: OCR Confidence Misinterpretation
**What goes wrong:** Treating low-confidence OCR results as reliable, leading to incorrect stock entries
**Why it happens:** OCR for handwritten or poor-quality invoices often fails silently
**How to avoid:**
- Always show confidence indicator in UI
- Require manual product matching for low-confidence results
- Provide "fallback to manual entry" when OCR fails completely
**Warning signs:** Products in database don't match invoice totals, users complaining about wrong quantities

### Pitfall 2: Stock Increment Before Physical Receipt
**What goes wrong:** Stock shows available inventory that hasn't arrived
**Why it happens:** Developers increment stock at registration instead of reception confirmation
**How to avoid:**
- Explicit two-table approach: `purchases` (header) and `purchase_items` (with product snapshot)
- Stock increment ONLY in `confirm_purchase_reception` RPC
- Clear UI distinction between "registered" and "received"
**Warning signs:** Stock counts don't match physical inventory

### Pitfall 3: Missing Product Matching
**What goes wrong:** OCR extracts product names that don't match existing product codes
**Why it happens:** Invoice uses different naming/coding than internal system
**How to avoid:**
- OCR should extract raw text
- Show dropdown/autocomplete to match to existing products
- Allow "not found" products to be skipped or flagged
**Warning signs:** Users creating duplicate products, complaints about manual re-entry

### Pitfall 4: PDF Page Handling
**What goes wrong:** Only processing first page of multi-page invoices
**Why it happens:** Code assumes single-page PDFs
**How to avoid:**
- Always iterate through ALL pages with pdfjs
- Consider combining pages or processing each separately
- Set reasonable page limit (e.g., max 10 pages) to prevent abuse
**Warning signs:** Missing products from invoices, totals don't match

### Pitfall 5: Enfermera Edit/Delete Without Approval
**What goes wrong:** Enfermera modifies purchases without admin review
**Why it happens:** RLS policies allow modification, forgetting role-based approval requirement
**How to avoid:**
- Enfermera creates "solicitud_modificacion" alert
- Admin/Medico approves, then modification happens
- RLS + application logic both enforce this
**Warning signs:** Audit log shows enfermera directly modifying purchases

## Code Examples

Verified patterns from official sources and existing codebase:

### OpenAI Vision API for Invoice OCR
```typescript
// Source: OpenAI docs + existing transcribe/route.ts pattern
// Location: src/app/api/ocr/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

// Zod schema for structured output
const InvoiceSchema = z.object({
  proveedor: z.string().optional(),
  fecha_factura: z.string().optional(),
  numero_factura: z.string().optional(),
  productos: z.array(z.object({
    descripcion: z.string(),
    cantidad: z.number(),
    costo_unitario: z.number().optional(),
    codigo_producto: z.string().optional(),
  })),
  total: z.number().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 })
    }

    // Convert file to base64
    const bytes = await file.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')
    const mimeType = file.type

    // Call OpenAI with structured output
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `Eres un experto en extraer datos de facturas de compra.
            Extrae los productos, cantidades, precios y datos del proveedor.
            Si no puedes leer un campo, omitelo del resultado.
            Los montos estan en pesos colombianos.`
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extrae los datos de esta factura de compra.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64}`,
                  detail: 'high'
                }
              }
            ]
          }
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'invoice_data',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                proveedor: { type: 'string' },
                fecha_factura: { type: 'string' },
                numero_factura: { type: 'string' },
                productos: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      descripcion: { type: 'string' },
                      cantidad: { type: 'number' },
                      costo_unitario: { type: 'number' },
                      codigo_producto: { type: 'string' }
                    },
                    required: ['descripcion', 'cantidad']
                  }
                },
                total: { type: 'number' }
              },
              required: ['productos']
            }
          }
        },
        max_tokens: 4096
      })
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('OpenAI API error:', error)
      return NextResponse.json({ error: 'OCR processing failed' }, { status: 500 })
    }

    const result = await response.json()
    const content = result.choices[0]?.message?.content

    if (!content) {
      return NextResponse.json({ error: 'No content in response' }, { status: 500 })
    }

    const parsed = JSON.parse(content)
    return NextResponse.json(parsed)

  } catch (error) {
    console.error('OCR error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

### PDF to Image Conversion
```typescript
// Source: pdfjs-dist documentation
// Location: src/lib/ocr/pdf-to-image.ts

import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import { createCanvas } from '@napi-rs/canvas'

// Set worker path for Node.js
GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/build/pdf.worker.mjs')

export async function pdfToImages(
  pdfBuffer: ArrayBuffer,
  options: { scale?: number; maxPages?: number } = {}
): Promise<Buffer[]> {
  const { scale = 2.0, maxPages = 10 } = options

  const pdf = await getDocument({ data: pdfBuffer }).promise
  const pageCount = Math.min(pdf.numPages, maxPages)
  const images: Buffer[] = []

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale })

    const canvas = createCanvas(viewport.width, viewport.height)
    const context = canvas.getContext('2d')

    await page.render({
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport
    }).promise

    // Convert to PNG buffer
    const buffer = canvas.toBuffer('image/png')
    images.push(buffer)
  }

  return images
}
```

### Atomic Stock Increment RPC
```sql
-- Source: Existing pattern from 023_create_medias_sale_rpc.sql
-- Location: supabase/migrations/031_confirm_purchase_reception_rpc.sql

CREATE OR REPLACE FUNCTION public.confirm_purchase_reception(
  p_purchase_id UUID,
  p_confirmed_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchase RECORD;
  v_item RECORD;
  v_product RECORD;
BEGIN
  -- Lock purchase row
  SELECT * INTO v_purchase
  FROM purchases
  WHERE id = p_purchase_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compra no encontrada';
  END IF;

  IF v_purchase.estado != 'pendiente_recepcion' THEN
    RAISE EXCEPTION 'Compra ya fue procesada (estado: %)', v_purchase.estado;
  END IF;

  -- Process each item
  FOR v_item IN
    SELECT * FROM purchase_items
    WHERE purchase_id = p_purchase_id
  LOOP
    -- Lock product row
    SELECT * INTO v_product
    FROM medias_products
    WHERE id = v_item.product_id
    FOR UPDATE;

    -- Increment stock_normal
    UPDATE medias_products
    SET stock_normal = stock_normal + v_item.cantidad
    WHERE id = v_item.product_id;

    -- Log stock movement
    INSERT INTO medias_stock_movements (
      product_id, tipo, cantidad,
      stock_normal_antes, stock_normal_despues,
      stock_devoluciones_antes, stock_devoluciones_despues,
      referencia_id, referencia_tipo, created_by
    ) VALUES (
      v_item.product_id, 'compra', v_item.cantidad,
      v_product.stock_normal, v_product.stock_normal + v_item.cantidad,
      v_product.stock_devoluciones, v_product.stock_devoluciones,
      p_purchase_id, 'compra', p_confirmed_by
    );
  END LOOP;

  -- Update purchase status
  UPDATE purchases
  SET
    estado = 'recibido',
    recibido_por = p_confirmed_by,
    recibido_at = now()
  WHERE id = p_purchase_id;

  RETURN jsonb_build_object(
    'success', true,
    'purchase_id', p_purchase_id
  );
END;
$$;
```

### Invoice Upload Component (Extend Existing Pattern)
```typescript
// Source: Existing pattern from src/components/payments/receipt-upload.tsx
// Location: src/components/purchases/invoice-upload.tsx

// Extend to support PDF in addition to images
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB for PDFs
const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/heic',
  'application/pdf'
]

// Same pattern as ReceiptUpload but:
// 1. Add PDF to allowed types
// 2. Show PDF preview differently (thumbnail or icon)
// 3. After upload, trigger OCR processing
// 4. Show loading state during OCR
// 5. On success, call onOCRComplete with parsed data
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Tesseract.js client-side | GPT-4o vision API | 2023-2024 | 10x accuracy improvement for complex documents |
| OCR then NLP parsing | Vision + structured outputs | 2024 | Single API call, guaranteed JSON format |
| Manual invoice entry | AI-assisted with confirmation | 2024-2025 | Faster data entry, fewer errors |
| pdfjs-dist v2 | pdfjs-dist v5 | 2025 | Better memory management, serverless support |

**Deprecated/outdated:**
- Tesseract.js for invoice OCR: Still works but accuracy is much lower than cloud vision APIs
- gpt-4-vision-preview model: Deprecated in favor of gpt-4o which has vision built-in
- Client-side PDF processing: Resource-intensive, use server-side for better UX

## Open Questions

Things that couldn't be fully resolved:

1. **Product Matching Strategy**
   - What we know: OCR extracts product descriptions that may not match product codes
   - What's unclear: Best UX for matching extracted products to existing medias_products
   - Recommendation: Show dropdown with existing products, allow fuzzy search, user manually selects match

2. **Multi-page Invoice Handling**
   - What we know: pdfjs-dist supports multi-page, GPT-4o accepts multiple images
   - What's unclear: Cost-effective approach for invoices with many pages
   - Recommendation: Process first 3 pages, warn user if more exist, allow manual "continue" for additional pages

3. **OCR Failure Rate**
   - What we know: GPT-4o performs well on printed invoices
   - What's unclear: Actual failure rate for this specific vendor's invoice formats
   - Recommendation: Build fallback manual entry flow, track OCR success rate in logs

4. **Enfermera Approval Request Flow**
   - What we know: Alerts system exists for notifications
   - What's unclear: Should this create a new alert type or use existing pattern
   - Recommendation: Add new alert types 'solicitud_edicion_compra', 'solicitud_eliminacion_compra'

## Sources

### Primary (HIGH confidence)
- Existing codebase: `src/app/api/transcribe/route.ts` - OpenAI API pattern
- Existing codebase: `src/components/payments/receipt-upload.tsx` - File upload pattern
- Existing codebase: `supabase/migrations/023_create_medias_sale_rpc.sql` - Atomic RPC pattern
- Existing codebase: `supabase/migrations/020_medias_foundation.sql` - Stock movement pattern
- OpenAI Platform Docs: Images and Vision API, Structured Outputs

### Secondary (MEDIUM confidence)
- [OpenAI Structured Outputs](https://platform.openai.com/docs/guides/structured-outputs) - JSON schema response format
- [pdfjs-dist GitHub](https://github.com/mozilla/pdf.js) - PDF rendering in Node.js
- [unpdf](https://github.com/unjs/unpdf) - Serverless PDF.js wrapper

### Tertiary (LOW confidence)
- [Mindee Invoice OCR](https://developers.mindee.com/docs/nodejs-invoice-ocr) - Alternative if GPT-4o proves insufficient
- [Veryfi SDK](https://www.veryfi.com/nodejs/) - Alternative specialized invoice API
- Community discussions on OCR accuracy for Spanish invoices

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM - OpenAI for OCR is sensible extension of existing pattern, but invoice-specific accuracy needs validation
- Architecture: HIGH - Follows established project patterns exactly
- Pitfalls: HIGH - Based on actual existing patterns and common OCR implementation issues

**Research date:** 2026-01-26
**Valid until:** 2026-02-26 (30 days - stable domain, OpenAI API unlikely to change significantly)

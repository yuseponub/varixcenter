# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-25)

**Core value:** Pagos inmutables con evidencia obligatoria — hacer el fraude imposible
**Current milestone:** v1.1 Varix-Medias
**Current focus:** Phase 15 - Dashboard & Inventory (IN PROGRESS)

## Current Position

Phase: 15 of 15 (Dashboard & Inventory)
Plan: 04 of 6 (Dashboard UI components)
Status: In progress
Last activity: 2026-01-27 — Completed 15-04-PLAN.md

Progress: [####################] v1.0 complete (simulated) | [####################] v1.1 99%

## Performance Metrics

**Velocity:**
- Total plans completed: 65
- Average duration: 3.4 min
- Total execution time: 219 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-security-foundation | 4 | 27 min | 7 min |
| 02-patients | 7 | 27 min | 4 min |
| 03-appointments | 6 | 22 min | 4 min |
| 04-payments-core | 5 | 20 min | 4 min |
| 08-reports-alerts | 4 | 15 min | 3.8 min |
| 10-medias-foundation | 4 | 9 min | 2.3 min |
| 11-sales-core | 8 | 13 min | 1.6 min |
| 12-cash-closing-medias | 6 | 24 min | 4 min |

**Recent Trend:**
- Last 5 plans: 15-04 (2 min), 15-03 (2 min), 15-02 (3 min), 15-01 (2 min), 14-06 (3 min)
- Trend: Database migrations ~1-2 min, types/validations ~3 min, queries ~2 min, API/services ~2-4 min, UI components ~2-5 min, pages ~3 min

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting v1.1 Varix-Medias:

- [Roadmap v1.1]: Phases 10-15 continue from v1.0 numbering (no restart)
- [Roadmap v1.1]: Medias uses separate cash closing from clinic (CIM- prefix vs CIE-)
- [Roadmap v1.1]: Dual stock tracking (stock_normal + stock_devoluciones) for audit clarity
- [Roadmap v1.1]: Two-phase returns approval for fraud prevention
- [Roadmap v1.1]: Zero tolerance for cash differences (stricter than clinic's $10k threshold)
- [Research]: 90% pattern reuse from existing VarixClinic codebase
- [Research]: Only new dependency is thermal printer support (no Tesseract.js in v1.1)
- [10-01]: Stock movements are fully immutable with before/after snapshots for audit trail
- [10-02]: Separate medias types/validations directories for module isolation
- [10-02]: Zod v4 API syntax ({ error: } instead of { required_error: })
- [10-03]: Dual stock display shows stock_normal/stock_devoluciones separately with total
- [10-03]: Only precio and activo are editable after product creation (tipo, talla, codigo immutable)
- [10-04]: Button shows "Actualizar Precio" when editing (only price changes allowed)
- [10-04]: Products ordered by tipo then talla for logical grouping
- [11-04]: Reused PaymentMethodType pattern from clinic payments for medias sales
- [11-04]: Product snapshots stored as strings for immutability
- [11-02]: Sales fully immutable (no estado transition like payments - simpler model)
- [11-02]: Stock reversal goes to stock_normal via ajuste_entrada movement type
- [11-03]: Two-pass validation pattern for atomic stock operations (validate all, then execute all)
- [11-03]: FOR UPDATE row locking prevents race conditions on concurrent sales
- [11-05]: Explicit any cast for Supabase client on untyped tables (pending migration)
- [11-06]: Cart state managed via parent-controlled callbacks pattern
- [11-06]: SaleMethodForm reuses ReceiptUpload from payments for VTA-05 compliance
- [11-07]: Patient selection via searchable Select dropdown (matching appointment-form pattern)
- [11-07]: date-fns added for date formatting in SalesTable
- [11-08]: window.print() with CSS @media print for thermal receipt (VTA-14)
- [11-08]: 58mm width with monospace font for thermal printer compatibility
- [11-08]: Delete button only visible to admin users for active sales
- [12-01]: CIM prefix for medias cierre (independent from clinic CIE prefix)
- [12-01]: Zero tolerance constraint: ANY difference requires justification (no threshold)
- [12-01]: Reuses cierre_estado ENUM from clinic migration 015
- [12-02]: RPC zero-tolerance check: IF v_diferencia != 0 (not ABS > threshold)
- [12-02]: sale_count used for medias (not payment_count like clinic)
- [12-03]: Medias types not added to barrel export (conflicts with clinic PAYMENT_METHODS, CierreEstado)
- [12-03]: Import medias cierres from @/types/medias/cierres directly
- [12-03]: cierre_photo_path required in medias (vs optional in clinic)
- [12-04]: Direct type imports from @/types/medias/cierres (not barrel export)
- [12-04]: Auth check in server actions before RPC calls for explicit error handling
- [12-05]: Photo upload REQUIRED for medias cierre (vs optional in clinic)
- [12-05]: Reuse CierrePhotoUpload from clinic components (no duplication)
- [12-06]: Two-step new cierre flow: date picker then form
- [12-06]: DatePickerForm accepts basePath prop for reusability
- [12-06]: Zero-tolerance messaging on both list and new cierre pages
- [08-01]: react-is ^19.0.0 override for React 19 compatibility with Recharts
- [08-01]: Faltante (negative diferencia) triggers critico severity, sobrante triggers advertencia
- [08-01]: SECURITY DEFINER functions bypass RLS for automatic alert insertion
- [08-02]: formatCurrency uses es-CO locale for Colombian Peso formatting
- [08-02]: ALERT_SEVERIDAD_CONFIG includes variant, icon, bgColor for consistent UI
- [08-03]: RPC functions use DATE() BETWEEN for date range filtering
- [08-03]: citas_atendidas counts appointments with estado='completada'
- [08-03]: Server action role guard extracts from JWT app_metadata
- [08-04]: AlertBadge is server component calling getUnreadAlertCount directly
- [08-04]: AlertItem uses severity icon mapping (Info/AlertTriangle/AlertCircle)
- [08-04]: AlertsWidget uses router.refresh() after resolution for data update
- [08-06]: Split reports page into server (page.tsx) + client (reports-page-client.tsx) components
- [08-06]: AlertsWidget wrapped in Card with Panel de Seguridad header
- [08-06]: Mobile navigation uses flex-wrap for smaller screens
- [08-06]: Alert badge links to /dashboard where alerts widget is visible
- [09-01]: Four notification states (pendiente, enviado, fallido, reintentando) - no 'entregado' without webhook
- [09-01]: Partial index on siguiente_reintento_at WHERE estado='reintentando' for retry queue optimization
- [09-01]: Service role full access policy for cron job notification operations
- [09-02]: E.164 phone format for Colombia: +57 followed by 10 digits
- [09-02]: SMS message limit 160 chars (single segment)
- [09-02]: Status config uses string icon names for flexible rendering
- [09-03]: Graceful degradation: null client in dev when credentials missing
- [09-03]: PERMANENT_ERROR_CODES list for retry logic (21211, 21212, 21214, 21217, 21608)
- [09-03]: GSM-7 encoding: uses 'manana' instead of special char to avoid UCS-2
- [09-03]: Spanish message template with es-CO locale for date formatting
- [09-04]: 1-hour time window (+-30min) for reminder queries handles Vercel cron variance
- [09-04]: E.164 formatting adds +57 for 10-digit Colombian numbers starting with 3
- [09-04]: 30 minute retry delay with max 2 attempts (initial + 1 retry)
- [09-04]: Cron auth via CRON_SECRET Bearer token in Authorization header
- [13-01]: Migration numbered 031 (030 already taken by notifications)
- [13-01]: factura_path NOT NULL enforces required invoice evidence
- [13-01]: Follows venta_counter pattern for gapless COM-000001 numbering
- [13-01]: Two-step reception flow: pendiente_recepcion -> recibido triggers stock increment
- [13-02]: Purchase types follow existing medias pattern (products.ts, sales.ts)
- [13-02]: PURCHASE_STATES const array for type inference and runtime checks
- [13-02]: cancelPurchaseSchema requires 10+ char justification (COM-06)
- [13-03]: create_purchase RPC validates items and creates with gapless COM- numbering
- [13-03]: confirm_purchase_reception atomically increments stock_normal for all items
- [13-03]: cancel_purchase checks admin/medico role via JWT app_metadata.user_role
- [13-03]: Stock reversal on cancellation uses ajuste_salida with referencia_tipo=compra_anulada
- [13-04]: Client-side sort ensures pendiente_recepcion always first regardless of DB collation
- [13-04]: PurchaseFilters uses ilike for case-insensitive proveedor search
- [13-05]: GPT-4o vision API with structured outputs for guaranteed JSON response
- [13-05]: Confidence threshold 0.7 for needs_review flag on invoice items
- [13-05]: Temperature 0.1 for consistent, deterministic OCR extraction
- [13-06]: parseInvoice wraps OCR service as server action for authenticated access
- [13-06]: Zod v4 uses issues[0].message instead of errors[0].message
- [09-05]: sms_reminder uses cyan color (bg-cyan-500) for timeline differentiation
- [09-05]: Stats cards count pendiente+reintentando together as 'Pendientes'
- [09-05]: Timeline merges audit events and notifications sorted by timestamp
- [13-07]: OCR failure doesn't block upload - graceful degradation to manual entry
- [13-07]: 10MB file limit for invoices (larger than 5MB receipts)
- [13-07]: Multi-stage upload state machine (idle/uploading/processing/success/error)
- [13-08]: Controlled form pattern: PurchaseForm uses external state for OCR integration
- [13-08]: calculatePurchaseTotal exported as utility for parent component use
- [13-08]: Table filters use onFilterChange callback for parent control
- [13-09]: Pages under /medias/compras (not /compras) following existing medias module structure
- [13-09]: countPurchasesByEstado added to queries for stats badges
- [13-09]: getProductsForMatching added for OCR product matching
- [13-09]: Multi-step purchase flow: upload -> OCR review (optional) -> form confirmation
- [14-01]: DEV- prefix for return numbering (consistent with VTA-, CIM-, COM-)
- [14-01]: foto_path OPTIONAL per CONTEXT.md decision
- [14-01]: motivo minimum 10 chars for meaningful explanations
- [14-01]: Terminal states (aprobada/rechazada) are completely immutable
- [14-02]: Quantity validation counts pendiente + aprobada returns (rechazada excluded)
- [14-02]: Approved returns increment stock_devoluciones, NOT stock_normal
- [14-02]: Stock movement uses tipo='devolucion' and referencia_tipo='devolucion'
- [14-02]: reject_medias_return does NOT create stock movement (estado change only)
- [14-03]: Direct type imports from @/types/medias/returns (not barrel export)
- [14-03]: Zod v4 z.number() without options (invalid_type_error not supported)
- [14-04]: Cash refunds tracked by aprobado_at for correct cierre attribution
- [14-04]: efectivo_neto = total_efectivo - total_devoluciones_efectivo for reconciliation
- [14-04]: return_count in cierre summary includes all approved returns (not just efectivo)
- [14-05]: ReturnForm receives returnableQuantities as prop (server-calculated validation limits)
- [14-05]: Approve/reject buttons only visible for admin/medico and pendiente returns
- [14-05]: Refund amount preview shown in form before submission
- [14-06]: Inline getUserRole pattern in each page file (follows ventas/[id], cierres/[id])
- [14-06]: Two-step return flow: select sale first via searchParams, then show form
- [14-06]: SaleSearchSelect filters client-side from server-fetched 50-sale list
- [15-01]: umbral_alerta default 3 applies to all 11 existing products automatically
- [15-01]: create_inventory_adjustment RPC checks JWT app_metadata.user_role first, fallback to user_roles table
- [15-01]: Adjustment RPC supports both stock_normal and stock_devoluciones modifications
- [15-01]: Movement referencia_tipo = 'ajuste' for all manual adjustments
- [15-02]: ADJUSTMENT_TYPES and STOCK_TYPES as const arrays for dual use (type inference + enum validation)
- [15-02]: Zod coerce.number() for cantidad to handle form string input
- [15-02]: Error messages in Spanish matching existing validation patterns
- [15-03]: Client-side filter for stock_normal < umbral_alerta (Supabase PostgREST limitation)
- [15-03]: efectivo_en_caja from get_medias_cierre_summary RPC efectivo_neto
- [15-03]: Movements include product relation (codigo, tipo, talla) for display
- [15-04]: MetricCard primary variant uses bg-primary/10 and text-3xl for emphasis
- [15-04]: NavigationCards statically defined with icon + title only (no counters)
- [15-04]: StockAlertsCard shows empty state when no critical products

### Pending Todos

- [ ] Enable Custom Access Token Hook in Supabase Dashboard after migrations applied
- [ ] Bootstrap first admin user via `SELECT public.bootstrap_first_admin();`
- [ ] Create test user in Supabase Auth to verify login flow
- [ ] Apply pending migrations (007-029) to Supabase

### Blockers/Concerns

None yet for v1.1 Varix-Medias.

## Session Continuity

Last session: 2026-01-27
Stopped at: Completed 15-04-PLAN.md
Resume file: None

---
*v1.1 Varix-Medias: Modulo de medias de compresion con ventas inmutables, inventario dual, y cierre de caja independiente.*

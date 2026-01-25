# Feature Landscape: Varix-Medias Module

**Domain:** Medical supplies retail (compression stockings) for phlebology clinic
**Researched:** 2026-01-25
**Confidence:** HIGH (patterns well-documented, domain-specific adaptation clear)

## Executive Summary

Retail POS and inventory systems for small medical supply stores follow well-established patterns. For Varix-Medias, the critical insight is that this is NOT a general retail system but a highly constrained module: 11 fixed products, single location, known sales staff, and existing anti-fraud patterns from VarixClinic to leverage.

The feature landscape divides into:
- **Table stakes:** Core POS (product selection, payment, receipt), inventory tracking (stock in/out), and cash reconciliation
- **Differentiators:** Two-phase return approval workflow and separation of stock_normal vs stock_devoluciones
- **Anti-features:** Complex SKU management, barcode scanning, multi-location inventory, customer-facing features

The existing cash closing, payments, and audit patterns from VarixClinic provide the foundation. This module extends rather than reimplements.

---

## Table Stakes

Features users expect. Missing = product feels incomplete.

### 1. Product Catalog (Fixed)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| View all 11 products with prices | Users need to see what's available | Low | Static catalog, no CRUD needed |
| Product details (type, size, price) | Standard catalog information | Low | Muslo/Panty/Rodilla + M/L/XL/XXL |
| Current stock visibility | Can't sell what's not in stock | Low | Show stock level on product card |
| Price display in COP | Colombian context | Low | $130k, $175k, $190k formats |

**Products (fixed catalog):**
| Tipo | Talla | Precio |
|------|-------|--------|
| Muslo | M | $175,000 |
| Muslo | L | $175,000 |
| Muslo | XL | $175,000 |
| Muslo | XXL | $175,000 |
| Panty | M | $190,000 |
| Panty | L | $190,000 |
| Panty | XL | $190,000 |
| Panty | XXL | $190,000 |
| Rodilla | M | $130,000 |
| Rodilla | L | $130,000 |
| Rodilla | XL | $130,000 |

**Recommendation:** Since the catalog is fixed (11 products), implement as seed data in database, NOT as admin-managed CRUD. Simplifies everything.

### 2. Sales Registration (Core POS)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Select product(s) for sale | Basic POS function | Low | Click to add, quantity selector |
| Calculate total automatically | Standard POS | Low | Sum of selected items |
| Register payment method | Must track cash flow | Low | Efectivo, Tarjeta, Transferencia, Nequi |
| Receipt photo for electronic payments | Anti-fraud (existing pattern) | Low | Reuse existing receipt upload component |
| Link sale to patient (optional) | Medical context - patients have profile | Medium | Optional dropdown with patient search |
| Link sale to seller (enfermera) | Audit trail, accountability | Low | Auto-capture from logged-in user |
| Link to who received cash | May differ from seller | Low | Optional, defaults to seller |
| Sale timestamp | Audit trail | Low | Auto-capture |
| Decrement stock automatically | Inventory integrity | Low | Transaction with sale record |
| Block sale if insufficient stock | Prevent overselling | Low | Check stock before confirming |

**Recommendation:** Reuse payment patterns from VarixClinic. Sales are essentially "payments without appointments" - similar immutability requirements.

### 3. Inventory Tracking (In/Out/Adjust)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Stock-in from purchases | Inventory increases | Medium | Manual entry when goods arrive |
| Stock-out from sales | Inventory decreases | Low | Automatic on sale |
| Manual adjustments | Shrinkage, damage, corrections | Medium | Requires reason code and justification |
| Current stock view (all products) | Operational visibility | Low | Dashboard/list view |
| Low stock alerts | Prevent stockouts | Low | Threshold per product |
| Stock history/movements | Audit trail | Medium | Log of all changes |

**Adjustment reason codes needed:**
| Codigo | Uso |
|--------|-----|
| inventario_inicial | Initial count on system setup |
| dano | Damaged product (write-off) |
| perdida | Lost/theft (shrinkage) |
| correccion_conteo | Count correction after physical inventory |
| devolucion_aprobada | Customer return (links to return workflow) |
| vencido | Product expired/unusable |

**Industry context:** According to NRF, retail inventory accuracy averages only 63%. Regular stock adjustments are normal and expected.

### 4. Cash Closing (Medias-specific)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Daily cash reconciliation | Anti-fraud requirement | Medium | Identical to clinic pattern |
| Calculate totals by payment method | Comparison base | Low | Sum from daily sales |
| Physical count input | Reconciliation | Low | Single total (not denominations) |
| Difference justification | Zero tolerance policy | Low | Required if any difference |
| Photo of closing report | Evidence | Low | Reuse existing pattern |
| Lock day after close | Immutability | Medium | Same as clinic |
| Separate from clinic cash | Contabilidad separada | Medium | Different table, different totals |

**Recommendation:** Clone clinic cash closing with minimal changes. Key difference: pulls from medias_ventas table instead of payments table. Cash drawer for medias is SEPARATE from clinic's cash drawer.

### 5. Basic Reporting

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Daily sales summary | Operational visibility | Low | Today's sales, total revenue |
| Inventory status | What's in stock | Low | All products with current levels |
| Cash position | Pre-closing check | Low | Expected cash based on sales |
| Sales by product | What's selling | Low | Units and revenue per product |

---

## Differentiators

Features that set product apart. Not expected, but valued for this specific context.

### 1. Two-Phase Return Approval

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Enfermera initiates return request | Separation of duties | Medium | Request with reason, photo of product |
| Admin approves/rejects return | Control over refunds | Medium | Queue of pending returns |
| Automatic inventory adjustment on approval | Integrity | Medium | Only moves stock when approved |
| Return audit trail | Fraud prevention | Low | Who requested, who approved, when |
| Refund generation on approval | Complete workflow | Medium | Creates negative cash movement |

**Why this matters:** Returns are a common fraud vector. Two-phase workflow prevents staff from processing fake returns to pocket cash. Admin oversight required.

**Implementation pattern:**
```
1. SOLICITUD (Enfermera)
   - Creates return_request (status: pendiente)
   - Links to original sale (required)
   - Reason for return (required)
   - Photo of returned product condition (required)
   - Does NOT refund money yet
   - Does NOT adjust inventory yet

2. APROBACION (Admin)
   - Reviews queue of pending returns
   - Can view original sale details
   - Approves:
     * System generates refund record
     * Inventory moves to stock_devoluciones (not stock_normal)
     * Return status: aprobada
   - Rejects:
     * Return status: rechazada
     * Requires rejection reason
     * No inventory/money movement
```

**Rejection reasons:**
- Producto no corresponde a venta original
- Producto danado por uso indebido
- Fuera de politica de devolucion
- Informacion incompleta

### 2. Dual Stock Tracking (Normal vs Devoluciones)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| stock_normal field | Sellable inventory from purchases | Low | Primary stock |
| stock_devoluciones field | Returned items | Low | Separate tracking |
| Total stock = normal + devoluciones | Operational view | Low | For stock alerts |
| Separate visibility in reports | Audit/accounting | Low | Know how much is returned goods |
| Option to write-off from devoluciones | Handle damaged returns | Low | Adjustment with reason |

**Why this matters:** Returned compression stockings may have quality concerns. Tracking separately allows:
- Admin to inspect returned goods before resale decision
- Accounting clarity on inventory composition
- Fraud detection (unusually high devoluciones = investigate)

**Inventory flow:**
```
Purchase received     --> stock_normal++
Sale from normal     --> stock_normal--
Sale from devoluciones --> stock_devoluciones-- (if allowed)
Return approved      --> stock_devoluciones++ (NOT stock_normal)
Write-off            --> stock_devoluciones-- (reason: dano, vencido)
Transfer to normal   --> stock_devoluciones--, stock_normal++ (admin only, after inspection)
```

### 3. Purchase Tracking

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Record purchase with date, items, total | Know what was bought | Medium | Manual entry |
| Link to supplier (text field) | Audit trail | Low | Simple text, not supplier CRUD |
| Photo of invoice/factura | Evidence | Low | Reuse receipt upload |
| Auto-increment stock_normal | Inventory integrity | Low | On purchase save |
| Purchase history view | Reference | Low | List of past purchases |

**Note on OCR:** PROJECT.md "Out of Scope" section explicitly states "OCR para ventas de medias - Ventas se registran directamente en plataforma". This applies to purchases too. Manual entry is the design.

### 4. Seller and Cash Handler Accountability

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Track vendedor (who made sale) | Accountability | Low | Auto from auth |
| Track recibio_efectivo (who got cash) | Cash handling | Low | May differ from seller |
| Sales by user report | Performance visibility | Low | Who sold what |
| Cash by handler report | Reconciliation aid | Low | Who collected what |

**Special case from PROJECT.md:** "Cash also received by doctors" - meaning a nurse might process a sale but the doctor receives the cash. Both need to be tracked for accountability.

---

## Anti-Features

Features to explicitly NOT build. Common mistakes or scope creep.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **SKU/Barcode management** | Only 11 fixed products | Fixed catalog seeded in database |
| **Barcode scanning** | Overkill for 11 products | Click-to-select interface |
| **Customer-initiated returns** | Fraud risk, staff handles all | Staff-initiated with approval workflow |
| **Multi-location inventory** | Single clinic | Single stock per product |
| **Supplier CRUD** | Only one or two suppliers | Text field for supplier name |
| **Complex pricing rules** | Fixed prices | Hard-coded prices in catalog |
| **Discounts on medias** | No discounting policy mentioned | No discount field in sales |
| **Partial payments** | Low-cost items ($130k-190k) | Full payment required |
| **Layaway/credit sales** | No credit policy | Payment required to complete |
| **Customer accounts** | Optional patient link | Patient dropdown (nullable) |
| **E-commerce/online** | Physical retail only | POS-only interface |
| **Automatic reordering** | Manual process fine for 11 SKUs | Low stock alerts only |
| **Lot/batch tracking** | Not medical devices | Simple quantity |
| **Expiration date tracking** | Compression stockings don't expire meaningfully | Skip |
| **Mixed payment (split tender)** | Unnecessary complexity | Single payment method per sale |
| **Product variants CRUD** | Fixed 11 products | Seed data, no admin interface |
| **Integrated clinic+medias cash** | "Contabilidad separada" | Completely separate cash systems |

**Important distinction from VarixClinic:** The clinic allows mixed payments for services (which can be $2M+). Medias items are $130k-$190k max. Single payment method per sale is sufficient and simpler.

---

## Feature Dependencies

### Dependencies on Existing VarixClinic Features

| Existing Feature | How Medias Uses It |
|------------------|-------------------|
| Auth & Roles | medias_ventas linked to users, role-based permissions |
| Patient lookup | Optional patient linking on sales |
| Receipt upload component | Photos for purchases and electronic payments |
| Cash closing UI patterns | Medias cash closing (separate cash) |
| Audit logging patterns | Extends audit_log to medias tables |
| Immutable record patterns | medias_ventas follows same principles |
| UI components (shadcn) | Consistent look and feel |

### New Feature Internal Dependencies

```
medias_productos (catalog)
    |
    v
medias_inventario (stock tracking)
    |
    +---> medias_ventas (sales) - decrements stock
    |         |
    |         +---> medias_devoluciones (returns) - references sale
    |                   |
    |                   +---> [On approval] increments stock_devoluciones
    |
    +---> medias_compras (purchases) - increments stock_normal
    |
    +---> medias_ajustes (adjustments) - any stock changes

medias_ventas + medias_devoluciones --> medias_cierre_caja (cash closing)
```

### Build Order Implications

| Order | Feature | Rationale |
|-------|---------|-----------|
| 1 | Product catalog (seed) | Foundation for everything |
| 2 | Inventory table | Must exist before sales |
| 3 | Sales registration | Core functionality |
| 4 | Cash closing | Anti-fraud requirement, needs sales |
| 5 | Purchase tracking | Can build after sales work |
| 6 | Returns workflow | Depends on sales existing |
| 7 | Reporting | Needs all data sources |

---

## MVP vs Post-MVP Recommendation

### MVP (Phase 1)

| Feature | Rationale |
|---------|-----------|
| Fixed product catalog | Foundation, required |
| Sales registration | Core POS, required |
| Basic inventory (single stock field) | Required for sales |
| Cash closing | Anti-fraud, core requirement |
| Manual stock adjustments | Basic inventory management |

**MVP simplification:** Start with single `stock` field instead of `stock_normal` + `stock_devoluciones`. Add dual tracking in Phase 2 when returns are implemented.

### Post-MVP (Phase 2)

| Feature | Rationale |
|---------|-----------|
| Two-phase returns | Can handle manually initially |
| Dual stock tracking | Needed when returns are automated |
| Purchase tracking with photos | Manual adjustments work initially |
| Reporting beyond basics | Nice to have |
| Seller/handler accountability fields | Can add to sales later |

**Rationale:** Get sales and cash closing working first. The clinic's main concern is anti-fraud. Returns and purchases are lower frequency operations that can be manual (phone call to admin) while core system is validated.

---

## Complexity Assessment

| Feature Area | Complexity | Rationale |
|--------------|------------|-----------|
| Product catalog | Low | Fixed data, seed script |
| Sales registration | Low-Medium | Extends existing payment patterns |
| Inventory tracking | Medium | Stock movements, adjustments, history |
| Cash closing | Low | Clone existing pattern |
| Returns workflow | Medium | Two-phase approval, status machine |
| Purchase tracking | Low-Medium | Simple form + inventory update |
| Reporting | Low | Basic aggregations |

**Total estimate:** This is a focused module. The patterns exist, the scope is constrained. Main work is database schema + UI, not complex business logic.

---

## Sources

### POS and Retail Inventory (HIGH confidence - multiple sources agree)
- [Shopify - Retail Receipts Guide](https://www.shopify.com/retail/retail-receipts)
- [Shopify - Inventory Tracking Guide](https://www.shopify.com/blog/inventory-tracking)
- [Magestore - Retail Inventory Management 2026](https://www.magestore.com/blog/retail-inventory-management/)
- [NetSuite - Retail Inventory Management](https://www.netsuite.com/portal/resource/articles/inventory-management/retail-inventory-management.shtml)
- [POS Nation - Retail Store Stock Management](https://www.posnation.com/blog/retail-store-stock-management)

### Cash Drawer and Reconciliation (HIGH confidence - industry standard)
- [Shopify - Balancing Cash Drawer](https://www.shopify.com/retail/balancing-a-cash-drawer)
- [POS Highway - Cash Drawer Management](https://www.poshighway.com/blog/cash-drawer-management-cycle-counts-reconcilation-activation-and-closing/)
- [Microsoft Dynamics - Shift and Drawer Management](https://learn.microsoft.com/en-us/dynamics365/commerce/shift-drawer-management)
- [Lightspeed - Balance Cash Register](https://www.lightspeedhq.com/blog/balance-cash-register/)

### Returns and Refunds Workflow (HIGH confidence - well-documented)
- [Microsoft Dynamics - POS Returns](https://learn.microsoft.com/en-us/dynamics365/commerce/pos-returns)
- [Microsoft Dynamics - Returns and Refunds Policy](https://learn.microsoft.com/en-us/dynamics365/commerce/refund_policy_returns)
- [Lightspeed - Returns and Exchanges](https://onsite-support.lightspeedhq.com/hc/en-us/articles/226834568-Doing-POS-returns-exchanges-and-refunds)
- [How Much POS - Managing Returns](https://www.howmuchpos.com/blogs/managing-returns-and-refunds-with-pos-software)

### Inventory Shrinkage and Adjustments (HIGH confidence - accounting standard)
- [Corporate Finance Institute - Inventory Shrinkage](https://corporatefinanceinstitute.com/resources/accounting/inventory-shrinkage/)
- [NetSuite - Shrinkage](https://www.netsuite.com/portal/resource/articles/inventory-management/shrinkage.shtml)
- [Fishbowl - Inventory Write-off](https://www.fishbowlinventory.com/blog/how-to-account-for-damaged-inventory)
- [Patriot Software - Inventory Shrinkage](https://www.patriotsoftware.com/blog/accounting/what-is-inventory-shrinkage/)

### Purchase Order Receiving (MEDIUM confidence - adapted for small retail)
- [Shopify - Receiving Inventory](https://www.shopify.com/retail/receiving-inventory)
- [Bellwether - PO Management Best Practices](https://www.bellwethercorp.com/blog/best-practices-for-purchase-order-inventory-management/)
- [PackageX - Purchase Order Receiving Guide](https://packagex.io/blog/blog-purchase-order-receiving-guide)

### Product Catalog and SKU Management (MEDIUM confidence - simplified for context)
- [Helcim - Product Catalog with SKUs](https://www.helcim.com/guides/how-to-create-an-easy-to-use-product-catalog-with-skus/)
- [ShipBob - SKU Variations](https://www.shipbob.com/blog/sku-variations/)
- [Lightspeed - Product Variants](https://x-series-support.lightspeedhq.com/hc/en-us/articles/25534074031899-Adding-standard-variant-and-composite-products)

### Small Retail POS Context (MEDIUM confidence - regional context)
- [SoftwareSuggest - POS Software Colombia](https://www.softwaresuggest.com/point-of-sale-pos-software/colombia)
- [Loyverse POS - Free POS System](https://loyverse.com/)
- [Nex POS - Free POS for Small Business](https://www.nextar.com/)

### Existing VarixClinic Patterns (HIGH confidence - internal documentation)
- `/mnt/c/Users/Usuario/Proyectos/varix-clinic/.planning/phases/04-payments-core/04-CONTEXT.md`
- `/mnt/c/Users/Usuario/Proyectos/varix-clinic/.planning/phases/05-cash-closing/05-CONTEXT.md`
- `/mnt/c/Users/Usuario/Proyectos/varix-clinic/.planning/PROJECT.md`

---

*Research completed: 2026-01-25*
*Module: Varix-Medias (v1.1)*

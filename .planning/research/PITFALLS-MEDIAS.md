# Domain Pitfalls: Varix-Medias Retail/Inventory Module

**Domain:** Retail inventory and POS module added to existing healthcare management system
**Researched:** 2026-01-25
**Confidence:** HIGH (verified with multiple industry sources)

---

## Executive Summary

Adding a retail/inventory module to an existing clinic management system introduces pitfalls distinct from the core clinic system. This document focuses on pitfalls specific to:

1. **Inventory accuracy** (phantom stock, negative inventory, concurrent access)
2. **Returns fraud** (abuse patterns, approval workflow bypass)
3. **Cash isolation** (mixing clinic and retail cash flows)
4. **OCR reliability** (invoice extraction errors)
5. **Stock movement auditing** (gaps in trail, unauthorized adjustments)
6. **Multi-user conflicts** (race conditions in inventory updates)

These pitfalls compound with the existing anti-fraud requirements in VarixClinic. The same staff (nurses) who sell stockings also close the cash drawer, creating dual fraud vectors.

---

## Critical Pitfalls

Mistakes that cause financial loss, inventory inaccuracy, or fraud exposure.

---

### Pitfall 1: Phantom Inventory from Delayed Stock Entry

**What goes wrong:** Sales are processed before purchase invoices are entered into the system. OCR processing is slow, manual entry is backlogged, or staff forgets to register incoming stock. Result: items are sold that "don't exist" in the system, creating negative stock or forcing manual corrections.

**Why it happens:**
- OCR extraction takes time; staff sells while waiting for processing
- Weekend purchases aren't entered until Monday
- Invoice photos taken but never processed
- No enforcement that stock must exist before sale

**Consequences:**
- Inventory shows -3 units (impossible in reality)
- Financial reports are inaccurate (COGS miscalculated)
- Staff loses trust in system, starts keeping parallel paper records
- Creates opportunity for theft: "the system is always wrong anyway"
- [Research shows poor inventory systems cost retailers $818 billion annually](https://koronapos.com/blog/inventory-management-challenges/)

**Warning signs:**
- Negative stock quantities appearing in any SKU
- Sales registered before any purchase for that SKU
- Frequent "adjustment" entries to correct stock levels
- Staff complaints that "system doesn't match reality"

**Prevention:**
1. **Block sales when stock = 0**: Cannot sell what doesn't exist
2. **Require purchase entry before sale**: If stock is 0 and nurse tries to sell, prompt to register incoming stock first
3. **Daily reconciliation alert**: Highlight any SKU with negative stock
4. **Purchase entry SLA**: Alert admin if invoice photo is >24h old without processing
5. **Consider holding stock**: Register "incoming" stock that's visible but not sellable until confirmed

**Phase to address:** Inventory foundation (Phase 1), Purchase flow (Phase 3)

---

### Pitfall 2: Returns Fraud via Approval Workflow Bypass

**What goes wrong:** Returns require admin approval, but staff finds ways to bypass:
- Processes multiple small refunds under threshold
- Colludes with admin for quick approvals without verification
- Creates "pending return" then sells stock from return pile at discounted price
- Returns items that weren't sold through the system (phantom returns)

**Why it happens:**
- Approval workflow has exploitable gaps
- No verification that returned item matches original sale
- Approval doesn't require physical inspection
- Admin approves from notifications without seeing actual product

**Consequences:**
- [Returns fraud costs US retailers $103 billion annually, 15% of all returns](https://www.loopreturns.com/blog/state-returns-fraud-abuse-trends-2024-2025/)
- Staff pockets money from "refunded" sales that were actually completed
- Inventory inflated with items that don't exist
- Legitimate customers receive used/damaged items sold as new

**Warning signs:**
- Returns spiking after certain staff members' shifts
- Return rate significantly above industry average (normal: 15-20%)
- Approvals happening within seconds of request (rubber-stamping)
- Patterns of returns for specific SKUs or similar amounts
- Returns without original sales records

**Prevention:**
1. **Require sale reference**: Every return MUST link to original sale_id; no "orphan" returns
2. **Physical verification workflow**:
   - Nurse requests return (photo of item + reason)
   - Item placed in separate "pending returns" area
   - Admin approves AND nurse confirms item received in returns stock
   - Two-step: approve + confirm_received
3. **Returns limits**: Flag when same customer returns >2 items in 30 days
4. **Approval delay**: Admin cannot approve return made in last 30 minutes (prevents pressure/collusion)
5. **Returns audit**: Weekly report of all returns by staff member, by SKU, by customer
6. **Separate returns inventory**: `stock_devoluciones` cannot be sold as new; requires explicit "refurbish" action

**Phase to address:** Returns workflow (Phase 4)

---

### Pitfall 3: Cash Drawer Mixing Between Clinic and Retail

**What goes wrong:** Same nurses handle both clinic payments and stocking sales. Without strict isolation:
- Cash from stocking sale goes into clinic drawer
- Clinic cash drawer discrepancy blamed on "stocking error"
- End-of-day reconciliation impossible; which cash is which?
- Fraud hidden by pointing to "the other cash flow"

**Why it happens:**
- Physical proximity: same reception area
- Same staff, same tablet, easy to confuse
- UI doesn't enforce drawer selection
- "I'll fix it at end of day" mentality

**Consequences:**
- Two independent accounting streams become hopelessly tangled
- Auditors cannot verify either stream accurately
- Creates perfect cover for theft: "it was a mix-up"
- [Separation of duties is critical to prevent internal fraud](https://www.accountingdepartment.com/blog/deter-employee-theft-in-cash-business)

**Warning signs:**
- Cash drawer balances that are exactly off by stocking sale amounts
- "Transfer" entries between clinic and medias cash
- End-of-day corrections moving money between accounts
- Staff confusion about which drawer to use

**Prevention:**
1. **Separate cash drawers physically**: If possible, different physical drawers for each business unit
2. **UI context lock**: When in Medias module, only Medias drawer is accessible
3. **Mandatory drawer selection at session start**: Staff declares which drawer they're using
4. **No cross-drawer transfers in app**: If money moved physically, require admin approval + photo evidence
5. **Independent closing times**: Clinic and Medias close separately, even if same person does both
6. **Double verification for shared staff**: If nurse closes both, second person must verify each independently

**Phase to address:** Cash drawer architecture (Phase 2), Cierre flow (Phase 5)

---

### Pitfall 4: OCR Extraction Errors Causing Wrong Inventory or Prices

**What goes wrong:** OCR extracts purchase invoice data incorrectly:
- Quantity: 12 read as 2 (leading digit missed)
- Unit price: $52,389 read as $2,389 (symbol confused with digit)
- SKU: "Panty M" read as "Panty N" (letter confusion)
- Date: 01/25/2026 read as 01/25/2020 (year digits)

**Why it happens:**
- Photo quality issues (blur, shadow, angle)
- Invoice format varies by supplier
- Handwritten annotations on printed invoices
- [Single character errors can cause $50,000 discrepancies](https://research.aimultiple.com/invoice-ocr/)

**Consequences:**
- Wrong quantity entered: inventory permanently off
- Wrong price: profit margins miscalculated
- Wrong product: misattributed stock
- Staff stops trusting OCR, does manual entry, errors increase
- [Even 99% OCR accuracy means 1% of data is wrong](https://www.mineraltree.com/blog/3-reasons-why-ocr-alone-is-insufficient-for-invoice-capture/)

**Warning signs:**
- Frequent manual corrections after OCR processing
- Staff skipping OCR verification step
- Inventory counts not matching system after restocking
- Unusual prices appearing in purchase records

**Prevention:**
1. **Mandatory human verification**: OCR suggests values, human confirms each field
2. **Highlight low-confidence extractions**: Visual indicator for fields OCR is unsure about
3. **Validation rules**: Reject impossible values (quantity > 100, price > $1M, date in past >30 days)
4. **Reference data matching**: Compare extracted product names against known catalog; flag mismatches
5. **Photo quality gate**: Check image resolution/blur before OCR; prompt retake if poor
6. **Audit OCR accuracy weekly**: Compare OCR suggestions vs final values; tune or retrain
7. **Fallback to manual**: If invoice format is unusual, allow skipping OCR entirely

**Phase to address:** Purchase/OCR flow (Phase 3)

---

### Pitfall 5: Unauthorized Stock Adjustments Without Audit Trail

**What goes wrong:** Staff needs to "fix" inventory discrepancies, system allows arbitrary adjustments:
- Add +10 units: masks theft of 10 units
- Remove -5 units: covers unrecorded sale
- Transfer between stock_normal and stock_devoluciones: moves items around
- No clear reason required, or reasons are freeform text

**Why it happens:**
- "We need to match physical count" scenario
- Legitimate corrections conflated with fraud cover-ups
- Too easy to adjust; no friction
- [Unauthorized manual adjustments are a key red flag for inventory fraud](https://www.bonadio.com/article/understanding-preventing-inventory-fraud/)

**Consequences:**
- Impossible to distinguish honest correction from fraud
- Shrinkage increases but auditors can't pinpoint cause
- Creates "adjustment culture" where numbers are always fudged
- Staff learn they can make inventory say anything

**Warning signs:**
- Adjustments happening frequently (daily or more)
- Adjustments always positive (adding stock) or always negative (removing)
- Adjustments by same staff member repeatedly
- Adjustment reasons that are vague ("error", "correction", "fix")

**Prevention:**
1. **Adjustment requires admin approval**: Like returns, adjustments are two-step
2. **Predefined reason codes**: Dropdown with specific reasons (physical count, damage, supplier error, theft discovered)
3. **Photo evidence for physical adjustments**: If adjusting due to count, photo of counted items
4. **Adjustment limits**: Adjustments > 5 units or > $200,000 COP require double approval
5. **Adjustment report**: Weekly summary of all adjustments, automatically flagged patterns
6. **Zero-adjustment goal**: Track "adjustment rate" as KPI; investigate if > 1% of transactions

**Phase to address:** Inventory adjustments (Phase 2)

---

### Pitfall 6: Race Conditions in Concurrent Inventory Updates

**What goes wrong:** Two tablets processing transactions simultaneously:
- Both read stock = 3
- Both sell 1 unit
- Both write stock = 2
- Actual stock should be 1, system shows 2
- "Lost update" problem

**Why it happens:**
- Multiple nurses on tablets during busy times
- No locking mechanism on inventory updates
- Optimistic updates without conflict detection
- [Race conditions cause overselling and incorrect stock counts](https://leapcell.io/blog/preventing-race-conditions-with-select-for-update-in-web-applications)

**Consequences:**
- Overselling: Customer buys item that doesn't exist
- Inventory permanently off until next physical count
- Creates phantom inventory that shows as available but isn't
- Staff can exploit: "the system allowed it"

**Warning signs:**
- Stock counts that drift from physical over time
- Occasional overselling of last item
- Database constraint violations on stock = 0 check
- Staff complaints about "sold out" items appearing as available

**Prevention:**
1. **Pessimistic locking**: `SELECT ... FOR UPDATE` on inventory row during sale
2. **Database-level constraints**: `CHECK (stock >= 0)` prevents negative
3. **Optimistic locking with version**: Each inventory row has `version` column; update fails if version changed
4. **Serializable transactions**: For inventory operations, use highest isolation level
5. **Test under load**: Simulate concurrent sales; verify correct behavior
6. **Queue high-volume**: If >5 concurrent tablets common, consider queue-based inventory updates

**Implementation note (Supabase/PostgreSQL):**
```sql
-- Within transaction
SELECT stock FROM products WHERE id = $1 FOR UPDATE;
-- Check stock > 0
UPDATE products SET stock = stock - 1 WHERE id = $1 AND stock > 0;
-- If no row updated, sale fails
```

**Phase to address:** Inventory data layer (Phase 1)

---

## Moderate Pitfalls

Mistakes that cause operational issues, technical debt, or reduced visibility.

---

### Pitfall 7: Selling from Returns Stock Without Differentiation

**What goes wrong:** Returned items go into `stock_devoluciones` but then get sold as regular inventory:
- No discount applied for "open box"
- Customer receives item that was previously worn/used
- No tracking that this specific item was a return
- Complaints when packaging is missing or item shows wear

**Prevention:**
1. **Separate stock pools**: `stock_normal` and `stock_devoluciones` are independently sellable but at different prices
2. **Return reason affects resaleability**: "Defective" returns cannot be resold; "wrong size" can
3. **Clearance flag**: Returned items marked; customer informed at sale
4. **Refurbish workflow**: Admin must explicitly move item from `stock_devoluciones` to `stock_normal` with reason

**Phase to address:** Returns workflow (Phase 4)

---

### Pitfall 8: Missing Correlation Between Prescription and Sale

**What goes wrong:** Doctor prescribes stockings in VarixClinic, but:
- No automatic notification to Medias module
- Staff sells without checking if prescription exists
- Patient buys wrong size/type (not what was prescribed)
- No audit of "prescription fill rate"

**Why it happens:**
- Clinic and Medias are "separate accounting" but serve same patients
- No data sharing mechanism implemented
- Staff busy, doesn't check clinic system before selling

**Consequences:**
- Patients get wrong products
- No metric for treatment compliance
- Doctor doesn't know if patient followed recommendation

**Prevention:**
1. **Optional prescription lookup**: When selling, nurse can search patient's prescriptions
2. **Prescription match indicator**: If patient has active prescription, show recommended product
3. **Not blocking**: Don't force prescription match (patient may buy gift, different preference)
4. **Prescription fill report**: Track prescriptions vs sales by patient

**Phase to address:** Integration consideration (later milestone or v1.2)

---

### Pitfall 9: End-of-Day Cutoff Ambiguity

**What goes wrong:** When exactly does the "day" end for cash closing?
- Sale at 7:58 PM, drawer closed at 8:00 PM
- Sale at 8:02 PM, after close - where does it go?
- Staff deliberately delays close to process late sales into next day
- Different tablets have slight clock drift

**Prevention:**
1. **Cutoff time is configurable**: Admin sets official closing time (e.g., 8 PM)
2. **Soft lock at cutoff**: After cutoff, sales require manager override
3. **Clock sync**: All tablets sync to server time, not device time
4. **Transaction timestamp is server-side**: `created_at DEFAULT NOW()` is database server time

**Phase to address:** Cierre implementation (Phase 5)

---

### Pitfall 10: Supplier Invoice Fraud Detection Gap

**What goes wrong:** Purchases registered but never physically received:
- Staff creates fake invoice photo
- OCR extracts fake data
- Inventory shows +50 units that don't exist
- Staff sells 50 units, pockets cash, inventory appears correct

**Prevention:**
1. **Two-step purchase verification**:
   - Step 1: Invoice photo + OCR extraction (anyone)
   - Step 2: Physical receipt confirmation (different person)
2. **Supplier contact verification**: For first-time or unusual suppliers, verify invoice is real
3. **Purchase pattern analysis**: Flag unusual order sizes, frequencies, or suppliers
4. **Periodic spot checks**: Admin randomly selects purchases to verify against physical stock

**Phase to address:** Purchase verification (Phase 3)

---

### Pitfall 11: No Low Stock Alerts for Fixed Catalog

**What goes wrong:** With only 11 products, each stockout is significant:
- Staff doesn't realize product is low until customer asks
- Patient can't get prescribed stockings; goes to competitor
- Reordering is reactive, not proactive

**Prevention:**
1. **Minimum stock thresholds per product**: Alert when stock < 3 units
2. **Dashboard visibility**: Current stock levels always visible
3. **Reorder suggestions**: "Product X has 2 units, average daily sales is 1, reorder now"
4. **Weekly inventory email**: Auto-generated summary to admin

**Phase to address:** Dashboard and alerts (Phase 5)

---

## Minor Pitfalls

Mistakes that cause frustration but are fixable without major refactoring.

---

### Pitfall 12: Price Changes Not Versioned

**What goes wrong:** Admin updates product price, but:
- Historical sales reports show new price, not price at time of sale
- Cannot verify if staff gave unauthorized discounts
- Financial analysis is inaccurate

**Prevention:**
1. **Store price on sale record**: Each `sale` row includes `unit_price_at_sale`
2. **Price history table**: Track when prices changed and by whom
3. **Reports use sale record price**: Not current catalog price

**Phase to address:** Sales data model (Phase 1)

---

### Pitfall 13: Photo Compression Losing Evidence Quality

**What goes wrong:** Photos compressed too much:
- Receipt numbers unreadable
- Invoice details blurred
- Photos useless as evidence

**Prevention:**
1. **Minimum resolution requirements**: Photo must be at least 1024x768
2. **Reasonable compression**: JPEG quality 80%+
3. **Original storage**: Keep original for specified retention period
4. **Verification prompt**: After photo, show preview "Can you read the receipt number?"

**Phase to address:** Photo handling (Phase 2)

---

### Pitfall 14: Reports Mixing Clinic and Medias Data

**What goes wrong:** Financial reports aggregate across both systems:
- "Total revenue today" includes clinic + medias
- Tax filings require separation
- Different profit margins, different analysis

**Prevention:**
1. **Explicit source filtering**: All reports have mandatory business_unit filter
2. **Separate dashboards**: Clinic dashboard vs Medias dashboard
3. **Combined view only for owner**: Admin can see both, but clearly labeled

**Phase to address:** Reports (Phase 5)

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Inventory Foundation | Race conditions (#6) | Use `SELECT FOR UPDATE` and database constraints |
| Inventory Foundation | Phantom stock (#1) | Block sales at stock = 0 |
| Inventory Adjustments | Unauthorized adjustments (#5) | Two-step approval, reason codes |
| Cash Drawer Setup | Mixing clinic/medias cash (#3) | UI context lock, separate drawers |
| Purchase/OCR | OCR errors (#4) | Mandatory human verification, validation rules |
| Purchase/OCR | Invoice fraud (#10) | Two-step physical receipt confirmation |
| Returns Workflow | Returns abuse (#2) | Sale reference required, physical verification |
| Returns Workflow | Selling returns as new (#7) | Separate stock pools, clearance flag |
| Cierre Flow | Cutoff ambiguity (#9) | Server-side timestamps, configurable cutoff |
| Sales Recording | Price not versioned (#12) | Store unit_price_at_sale |
| Reports | Data mixing (#14) | Mandatory business_unit filter |

---

## Prevention Checklist

Before each phase, verify:

### Inventory (Phase 1-2)
- [ ] Database constraint: `stock >= 0` on all stock columns
- [ ] Locking strategy implemented: `SELECT FOR UPDATE` or equivalent
- [ ] Adjustment workflow requires approval
- [ ] Adjustment reasons are predefined dropdown
- [ ] Photo evidence required for adjustments > threshold

### Sales (Phase 2)
- [ ] Cannot sell when stock = 0
- [ ] Price at sale stored in transaction record
- [ ] Sale must link to valid product_id
- [ ] Photo evidence required for non-cash payments

### Cash Drawer (Phase 2)
- [ ] Separate drawer_id for clinic vs medias
- [ ] UI enforces drawer context
- [ ] No cross-drawer transfers without admin
- [ ] Closing is independent per drawer

### Purchases/OCR (Phase 3)
- [ ] OCR outputs are suggestions, human confirms
- [ ] Low-confidence fields highlighted
- [ ] Validation rejects impossible values
- [ ] Physical receipt confirmation step exists

### Returns (Phase 4)
- [ ] Every return links to original sale_id
- [ ] Two-step: request + approve + confirm_received
- [ ] Returns stock is separate from normal stock
- [ ] Approval delay prevents immediate processing

### Cierre/Reports (Phase 5)
- [ ] Server-side timestamps only
- [ ] Business_unit filter mandatory
- [ ] Stock alerts configured per product
- [ ] Audit logs capture all movements

---

## Relationship to Existing Pitfalls

This document extends `.planning/research/PITFALLS.md` (core VarixClinic pitfalls) with retail-specific concerns. Key overlaps:

| Core Pitfall | Medias Extension |
|--------------|------------------|
| RLS on all tables (#1) | Medias tables also need RLS |
| Immutable payments (#3) | Medias sales also immutable |
| Single person control (#4) | Same nurses do sales AND close; need separation |
| Photo evidence integrity (#9) | Medias photos for receipts, invoices, adjustments |
| Receipt numbers (#7) | Sale numbers must also be sequential |

The same anti-fraud principles apply, but Medias adds:
- Inventory as a new fraud vector (phantom stock, adjustments)
- Returns as a new fraud vector (approval bypass, collusion)
- OCR as a new error vector (extraction mistakes)
- Cash isolation as a new accounting challenge

---

## Sources

### Inventory Management
- [20 Common Inventory Management Challenges in 2025](https://koronapos.com/blog/inventory-management-challenges/)
- [How to prevent stock losses from phantom inventory | QuickBooks](https://quickbooks.intuit.com/r/midsize-business/phantom-inventory/)
- [Negative Stock: How to Find Discrepancies Fast | POS Solutions](https://www.possolutions.com.au/blog/negative-stock-inventory-how-to-find-your-stock-discrepancies-fast)
- [Phantom Inventory: Everything Retailers Need to Know | Shopify](https://www.shopify.com/retail/phantom-inventory)

### Returns Fraud
- [The State of Return Fraud & Abuse: Trends for 2024-2025 | Loop Returns](https://www.loopreturns.com/blog/state-returns-fraud-abuse-trends-2024-2025/)
- [Return Fraud in 2025: How Retailers Can Fight Back | Chargeflow](https://www.chargeflow.io/blog/return-fraud-exposed)
- [8 Common Types of Return Fraud | Appriss Retail](https://apprissretail.com/blog/8-common-types-of-return-fraud/)

### Cash Handling & Internal Theft
- [How To Catch A Thief At Work: Cash Register Stealing](https://getsafeandsound.com/2022/01/how-catch-employees-stealing-register/)
- [How to Deter Employee Theft in Cash Business | The Accounting Department](https://www.accountingdepartment.com/blog/deter-employee-theft-in-cash-business)
- [Cash Larceny: How To Prevent Cash Theft | Corporate Finance Institute](https://corporatefinanceinstitute.com/resources/career-map/sell-side/risk-management/cash-larceny/)
- [Point-of-Sale Best Practices: Cash Management](https://insightfulaccountant.com/accounting-tech/payroll-merchant-services/point-of-sale-best-practices:-cash-management/)

### OCR & Invoice Processing
- [Invoice OCR Benchmark: Extraction Accuracy of LLMs vs OCRs](https://research.aimultiple.com/invoice-ocr/)
- [Why OCR Invoice Capture is Not Enough | MineralTree](https://www.mineraltree.com/blog/3-reasons-why-ocr-alone-is-insufficient-for-invoice-capture/)
- [10 Common Challenges in Invoice Processing | OCR Solutions](https://ocrsolutions.com/blog/10-common-challenges-in-invoice-processing-and-how-ocr-software-solves-them)

### Concurrent Access & Race Conditions
- [Preventing Race Conditions with SELECT FOR UPDATE | Leapcell](https://leapcell.io/blog/preventing-race-conditions-with-select-for-update-in-web-applications)
- [The Lost Update Problem in Concurrency Control | Baeldung](https://www.baeldung.com/cs/concurrency-control-lost-update-problem)
- [Concurrency and Consistency: Juggling Multiple Users | Dev.to](https://dev.to/isaactony/concurrency-and-consistency-juggling-multiple-users-without-missing-a-beat-2np5)

### Inventory Fraud & Audit
- [Understanding & Preventing Inventory Fraud | Bonadio Group](https://www.bonadio.com/article/understanding-preventing-inventory-fraud/)
- [Inventory Management Risk and Controls | Internal Auditing Textbook](https://ecampusontario.pressbooks.pub/internalauditing/chapter/5a-5-inventory-management-risk-and-controls/)
- [Inventory Audit: Procedures and Best Practices 2026 | Magestore](https://www.magestore.com/blog/inventory-audit/)

### Approval Workflow Fraud
- [Internal Collusion: How to Detect and Prevent Fraud | ArayaPRO](https://arayapro.com/internal-collusion-how-to-detect-and-prevent-fraud-from-within/)
- [Protecting Business from Invoice Fraud: Approval Workflow | Corpay One](https://www.corpayone.co.uk/post/protecting-your-business-from-invoice-fraud-the-importance-of-a-strong-approval-workflow)

---

*This document complements `.planning/research/PITFALLS.md` which covers core VarixClinic anti-fraud pitfalls (RLS, triggers, immutability, etc.)*

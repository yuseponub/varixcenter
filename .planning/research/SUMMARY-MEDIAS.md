# Research Summary: Varix-Medias Module

**Project:** VarixClinic v1.1 - Compression Stockings Retail Module
**Domain:** Medical supplies retail with inventory management
**Researched:** 2026-01-25
**Confidence:** HIGH

## Executive Summary

Varix-Medias is a retail module for selling compression stockings within the existing VarixClinic application. The key insight from research is that **90% of required patterns already exist** in VarixClinic (immutable payments, cash closing, audit logging, receipt photos). Only one new dependency is needed: **Tesseract.js** for OCR extraction of purchase invoices.

The module requires strict isolation of financial data (separate cash drawer, separate invoice numbers) while sharing infrastructure (auth, roles, audit log, UI components). The primary risks are inventory fraud (phantom stock, unauthorized adjustments) and returns fraud (approval workflow bypass).

---

## Key Findings

### Stack Additions
- **Only 1 new dependency**: Tesseract.js 7.0.0 for client-side OCR
- **No state management library needed**: React 19 + Server Components suffices
- **Database prefix isolation**: All medias tables use `medias_` prefix
- **Reuse existing patterns**: Immutable payments, cash closing, storage upload

### Feature Table Stakes
| Feature | Complexity | Notes |
|---------|------------|-------|
| Fixed product catalog (11 items) | Low | Seed data, no CRUD |
| Sales registration (POS) | Low-Medium | Clone payment patterns |
| Inventory tracking | Medium | stock_normal + stock_devoluciones |
| Cash closing | Low | Clone clinic pattern, separate table |
| Purchase tracking | Low-Medium | Manual entry + optional OCR |

### Feature Differentiators
| Feature | Value | Complexity |
|---------|-------|------------|
| Two-phase returns approval | Fraud prevention | Medium |
| Dual stock tracking | Audit clarity | Low |
| Seller/cash handler accountability | Anti-fraud | Low |

### Critical Pitfalls to Avoid
| # | Pitfall | Prevention | Phase |
|---|---------|------------|-------|
| 1 | Phantom inventory (sales before stock entry) | Block sales at stock=0 | 1 |
| 2 | Returns fraud (approval bypass) | Two-step + sale reference required | 4 |
| 3 | Cash drawer mixing (clinic/medias) | UI context lock, separate drawers | 2 |
| 4 | OCR extraction errors | Mandatory human verification | 3 |
| 5 | Unauthorized stock adjustments | Two-step approval, reason codes | 2 |
| 6 | Race conditions in inventory | SELECT FOR UPDATE + CHECK constraint | 1 |

### Architecture Integration
| Component | Strategy |
|-----------|----------|
| Authentication | SHARED - no changes |
| Authorization | SHARED - same roles |
| Audit Log | SHARED - filter by `table_name LIKE 'medias_%'` |
| Storage | SEPARATE - new `medias-receipts` bucket |
| Invoice Numbers | SEPARATE - new counter with VTA- prefix |
| Cash Closing | SEPARATE - new table with CIM- prefix |
| Navigation | EXTEND - add `/medias/*` routes |

---

## Recommended Phase Structure

Based on research, the suggested build order:

### Phase 10: Medias Foundation
**Goal:** Database schema with products, inventory, and immutability patterns
- Products catalog (seed data)
- Inventory table with dual stock columns
- Stock movements table (immutable)
- Database constraints (stock >= 0, locking)
- RLS policies

### Phase 11: Sales & Cash
**Goal:** Core POS functionality with separate cash drawer
- Sales registration (clone payment patterns)
- Medias invoice counter (VTA-xxxxxx)
- Receipt photo upload (reuse component)
- Medias cash closing (clone clinic pattern)

### Phase 12: Purchases & OCR
**Goal:** Stock replenishment with optional OCR assist
- Purchase registration form
- Tesseract.js integration
- Human verification workflow
- Photo storage for invoices

### Phase 13: Returns Workflow
**Goal:** Two-phase returns with fraud prevention
- Return request (enfermera)
- Return approval (admin)
- Stock movement to stock_devoluciones
- Refund tracking

### Phase 14: Dashboard & Reports
**Goal:** Operational visibility
- Current stock levels
- Daily/monthly sales
- Low stock alerts
- Returns metrics

---

## Implications for Requirements

**Must be in requirements:**
1. Fixed catalog of 11 products (no admin CRUD)
2. Sales are immutable (no UPDATE/DELETE)
3. Separate cash drawer from clinic
4. Returns require admin approval
5. Stock cannot go negative
6. Photo required for electronic payments

**Should NOT be in requirements:**
- Barcode scanning (11 products, use buttons)
- Customer accounts (optional patient link)
- Mixed payments (single method per sale)
- Discounts (fixed prices)
- E-commerce (physical retail only)

---

## Files Created

| File | Purpose |
|------|---------|
| `.planning/research/STACK-MEDIAS.md` | Technology recommendations |
| `.planning/research/FEATURES-MEDIAS.md` | Feature landscape |
| `.planning/research/PITFALLS-MEDIAS.md` | Fraud and error prevention |
| `.planning/research/SUMMARY-MEDIAS.md` | This summary |

---

## Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Stack | HIGH | Existing patterns cover 90%, Tesseract.js verified |
| Features | HIGH | Well-documented POS/retail patterns |
| Architecture | HIGH | Verified from existing migrations and code |
| Pitfalls | HIGH | Multiple industry sources, fraud statistics |

---

**Research complete. Ready for requirements definition.**

# Requirements: Varix-Medias (v1.1)

**Defined:** 2026-01-25
**Core Value:** Ventas inmutables con inventario preciso y cierre de caja independiente

## v1.1 Requirements

Requirements for Varix-Medias module. Phases continue from VarixClinic (Phase 10+).

### Catalogo de Productos

- [x] **CAT-01**: Admin puede ver listado de todos los productos con precio y stock actual
- [x] **CAT-02**: Admin puede editar precio de un producto existente
- [x] **CAT-03**: Admin puede agregar nuevos productos (tipo, talla, precio, codigo)
- [x] **CAT-04**: Admin puede desactivar un producto (no aparece en ventas pero mantiene historico)
- [x] **CAT-05**: Sistema tiene 11 productos pre-cargados (Muslo M/L/XL/XXL $175k, Panty M/L/XL/XXL $190k, Rodilla M/L/XL $130k)

### Ventas

- [ ] **VTA-01**: Usuario puede registrar venta seleccionando producto(s) del catalogo
- [ ] **VTA-02**: Usuario puede especificar cantidad por producto
- [ ] **VTA-03**: Sistema calcula total automaticamente basado en precios del catalogo
- [ ] **VTA-04**: Usuario puede seleccionar metodo de pago (efectivo, tarjeta, transferencia, nequi)
- [ ] **VTA-05**: Pagos con tarjeta, transferencia o nequi REQUIEREN foto de comprobante
- [ ] **VTA-06**: Usuario puede vincular venta a paciente existente (buscador de BD de VarixClinic)
- [ ] **VTA-07**: Sistema registra quien realizo la venta (vendedor) automaticamente
- [ ] **VTA-08**: Usuario puede especificar quien recibio el efectivo (si es diferente al vendedor)
- [ ] **VTA-09**: Ventas no permiten UPDATE — solo Admin puede eliminar con justificacion obligatoria
- [ ] **VTA-10**: Numeros de venta son secuenciales automaticos (VTA-000001) y nunca se reutilizan
- [ ] **VTA-11**: Venta decrementa stock automaticamente al registrarse
- [ ] **VTA-12**: Sistema bloquea venta si stock del producto es 0 (no permite stock negativo)
- [ ] **VTA-13**: Al eliminar venta, sistema revierte el stock automaticamente
- [ ] **VTA-14**: Sistema genera recibo imprimible para impresora termica al crear venta

### Inventario

- [x] **INV-01**: Usuario puede ver stock actual de todos los productos
- [x] **INV-02**: Sistema muestra stock separado: stock_normal (compras) y stock_devoluciones (returns)
- [ ] **INV-03**: Sistema muestra alertas cuando stock total < 3 unidades
- [ ] **INV-04**: Admin puede realizar ajuste manual de inventario con justificacion obligatoria
- [ ] **INV-05**: Ajustes de inventario requieren codigo de razon (dano, perdida, correccion conteo, etc.)
- [x] **INV-06**: Sistema registra historial de todos los movimientos de stock (inmutable)
- [x] **INV-07**: Cada movimiento registra: producto, tipo, cantidad, stock antes/despues, usuario, timestamp

### Compras

- [ ] **COM-01**: Usuario puede registrar compra con fecha, proveedor (texto), y productos recibidos
- [ ] **COM-02**: Usuario puede subir foto de factura de compra
- [ ] **COM-03**: Compra incrementa stock_normal automaticamente al registrarse
- [ ] **COM-04**: Usuario puede ver historial de compras

### Devoluciones

- [ ] **DEV-01**: Enfermera/Secretaria puede crear solicitud de devolucion vinculada a venta original
- [ ] **DEV-02**: Solicitud de devolucion requiere motivo y foto del producto
- [ ] **DEV-03**: Devolucion queda en estado "pendiente" hasta aprobacion
- [ ] **DEV-04**: Admin puede ver lista de devoluciones pendientes
- [ ] **DEV-05**: Admin puede aprobar o rechazar devolucion con notas
- [ ] **DEV-06**: Al aprobar devolucion, sistema incrementa stock_devoluciones (no stock_normal)
- [ ] **DEV-07**: Al aprobar devolucion, sistema registra el metodo de reembolso (efectivo/transferencia)

### Cierre de Caja

- [ ] **CIE-01**: Sistema calcula totales automaticos por metodo de pago del dia (efectivo, tarjeta, transferencia, nequi)
- [ ] **CIE-02**: Usuario ingresa conteo fisico de efectivo
- [ ] **CIE-03**: Sistema calcula y muestra diferencia entre esperado y declarado
- [ ] **CIE-04**: CUALQUIER diferencia requiere justificacion escrita (tolerancia cero)
- [ ] **CIE-05**: Una vez cerrada la caja, sistema bloquea registro de ventas para ese dia
- [ ] **CIE-06**: Numeros de cierre son secuenciales automaticos (CIM-000001)
- [ ] **CIE-07**: Solo Admin puede reabrir un cierre con justificacion obligatoria
- [ ] **CIE-08**: Cierre de caja de Medias es INDEPENDIENTE del cierre de caja de la clinica

### Dashboard

- [ ] **DSH-01**: Dashboard muestra efectivo actual en caja de Medias
- [ ] **DSH-02**: Dashboard muestra ventas del dia (cantidad y monto)
- [ ] **DSH-03**: Dashboard muestra ventas del mes (cantidad y monto)
- [ ] **DSH-04**: Dashboard muestra devoluciones pendientes de aprobacion
- [ ] **DSH-05**: Dashboard muestra productos con stock critico (< 3 unidades)

## Future Requirements

Deferred to later milestone. Tracked but not in current roadmap.

### Reportes Avanzados

- **REP-01**: Reporte de ventas por producto (unidades y monto)
- **REP-02**: Reporte de ventas por vendedor
- **REP-03**: Reporte historico mensual

### OCR para Compras

- **OCR-01**: OCR extrae datos de foto de factura automaticamente
- **OCR-02**: Verificacion humana obligatoria de datos extraidos

### Integracion Prescripciones

- **INT-01**: Mostrar si paciente tiene prescripcion activa de medias al vender

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Barcode scanning | Solo 11 productos, botones suficientes |
| Customer accounts | Link opcional a paciente es suficiente |
| Mixed payments (split tender) | Items de bajo costo ($130k-$190k), un metodo por venta |
| Discounts | Precios fijos, no politica de descuentos |
| E-commerce | Retail fisico solamente |
| Multi-location inventory | Una sola clinica |
| Automatic reordering | Alertas de stock bajo suficientes para 11 SKUs |
| Lot/batch tracking | Medias no son dispositivos medicos regulados |
| Integrated clinic+medias cash | Contabilidades separadas por diseno |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CAT-01 | Phase 10 | Complete |
| CAT-02 | Phase 10 | Complete |
| CAT-03 | Phase 10 | Complete |
| CAT-04 | Phase 10 | Complete |
| CAT-05 | Phase 10 | Complete |
| VTA-01 | Phase 11 | Pending |
| VTA-02 | Phase 11 | Pending |
| VTA-03 | Phase 11 | Pending |
| VTA-04 | Phase 11 | Pending |
| VTA-05 | Phase 11 | Pending |
| VTA-06 | Phase 11 | Pending |
| VTA-07 | Phase 11 | Pending |
| VTA-08 | Phase 11 | Pending |
| VTA-09 | Phase 11 | Pending |
| VTA-10 | Phase 11 | Pending |
| VTA-11 | Phase 11 | Pending |
| VTA-12 | Phase 11 | Pending |
| VTA-13 | Phase 11 | Pending |
| VTA-14 | Phase 11 | Pending |
| INV-01 | Phase 10 | Complete |
| INV-02 | Phase 10 | Complete |
| INV-03 | Phase 15 | Pending |
| INV-04 | Phase 15 | Pending |
| INV-05 | Phase 15 | Pending |
| INV-06 | Phase 10 | Complete |
| INV-07 | Phase 10 | Complete |
| COM-01 | Phase 13 | Pending |
| COM-02 | Phase 13 | Pending |
| COM-03 | Phase 13 | Pending |
| COM-04 | Phase 13 | Pending |
| DEV-01 | Phase 14 | Pending |
| DEV-02 | Phase 14 | Pending |
| DEV-03 | Phase 14 | Pending |
| DEV-04 | Phase 14 | Pending |
| DEV-05 | Phase 14 | Pending |
| DEV-06 | Phase 14 | Pending |
| DEV-07 | Phase 14 | Pending |
| CIE-01 | Phase 12 | Pending |
| CIE-02 | Phase 12 | Pending |
| CIE-03 | Phase 12 | Pending |
| CIE-04 | Phase 12 | Pending |
| CIE-05 | Phase 12 | Pending |
| CIE-06 | Phase 12 | Pending |
| CIE-07 | Phase 12 | Pending |
| CIE-08 | Phase 12 | Pending |
| DSH-01 | Phase 15 | Pending |
| DSH-02 | Phase 15 | Pending |
| DSH-03 | Phase 15 | Pending |
| DSH-04 | Phase 15 | Pending |
| DSH-05 | Phase 15 | Pending |

**Coverage:**
- v1.1 requirements: 50 total
- Mapped to phases: 50/50 (100%)
- Unmapped: 0

**By Phase:**
| Phase | Requirements | Count |
|-------|--------------|-------|
| Phase 10: Medias Foundation | CAT-01 to CAT-05, INV-01, INV-02, INV-06, INV-07 | 9 |
| Phase 11: Sales Core | VTA-01 to VTA-14 | 14 |
| Phase 12: Cash Closing Medias | CIE-01 to CIE-08 | 8 |
| Phase 13: Purchases | COM-01 to COM-04 | 4 |
| Phase 14: Returns Workflow | DEV-01 to DEV-07 | 7 |
| Phase 15: Dashboard & Inventory | INV-03 to INV-05, DSH-01 to DSH-05 | 8 |

---
*Requirements defined: 2026-01-25*
*Last updated: 2026-01-25 — Phase 10 requirements marked Complete*

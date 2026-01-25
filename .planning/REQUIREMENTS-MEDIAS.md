# Requirements: Varix-Medias (v1.1)

**Defined:** 2026-01-25
**Core Value:** Ventas inmutables con inventario preciso y cierre de caja independiente

## v1.1 Requirements

Requirements for Varix-Medias module. Phases continue from VarixClinic (Phase 10+).

### Catálogo de Productos

- [ ] **CAT-01**: Admin puede ver listado de todos los productos con precio y stock actual
- [ ] **CAT-02**: Admin puede editar precio de un producto existente
- [ ] **CAT-03**: Admin puede agregar nuevos productos (tipo, talla, precio, código)
- [ ] **CAT-04**: Admin puede desactivar un producto (no aparece en ventas pero mantiene histórico)
- [ ] **CAT-05**: Sistema tiene 11 productos pre-cargados (Muslo M/L/XL/XXL $175k, Panty M/L/XL/XXL $190k, Rodilla M/L/XL $130k)

### Ventas

- [ ] **VTA-01**: Usuario puede registrar venta seleccionando producto(s) del catálogo
- [ ] **VTA-02**: Usuario puede especificar cantidad por producto
- [ ] **VTA-03**: Sistema calcula total automáticamente basado en precios del catálogo
- [ ] **VTA-04**: Usuario puede seleccionar método de pago (efectivo, tarjeta, transferencia, nequi)
- [ ] **VTA-05**: Pagos con tarjeta, transferencia o nequi REQUIEREN foto de comprobante
- [ ] **VTA-06**: Usuario puede vincular venta a paciente existente (buscador de BD de VarixClinic)
- [ ] **VTA-07**: Sistema registra quién realizó la venta (vendedor) automáticamente
- [ ] **VTA-08**: Usuario puede especificar quién recibió el efectivo (si es diferente al vendedor)
- [ ] **VTA-09**: Ventas no permiten UPDATE — solo Admin puede eliminar con justificación obligatoria
- [ ] **VTA-10**: Números de venta son secuenciales automáticos (VTA-000001) y nunca se reutilizan
- [ ] **VTA-11**: Venta decrementa stock automáticamente al registrarse
- [ ] **VTA-12**: Sistema bloquea venta si stock del producto es 0 (no permite stock negativo)
- [ ] **VTA-13**: Al eliminar venta, sistema revierte el stock automáticamente
- [ ] **VTA-14**: Sistema genera recibo imprimible para impresora térmica al crear venta

### Inventario

- [ ] **INV-01**: Usuario puede ver stock actual de todos los productos
- [ ] **INV-02**: Sistema muestra stock separado: stock_normal (compras) y stock_devoluciones (returns)
- [ ] **INV-03**: Sistema muestra alertas cuando stock total < 3 unidades
- [ ] **INV-04**: Admin puede realizar ajuste manual de inventario con justificación obligatoria
- [ ] **INV-05**: Ajustes de inventario requieren código de razón (daño, pérdida, corrección conteo, etc.)
- [ ] **INV-06**: Sistema registra historial de todos los movimientos de stock (inmutable)
- [ ] **INV-07**: Cada movimiento registra: producto, tipo, cantidad, stock antes/después, usuario, timestamp

### Compras

- [ ] **COM-01**: Usuario puede registrar compra con fecha, proveedor (texto), y productos recibidos
- [ ] **COM-02**: Usuario puede subir foto de factura de compra
- [ ] **COM-03**: Compra incrementa stock_normal automáticamente al registrarse
- [ ] **COM-04**: Usuario puede ver historial de compras

### Devoluciones

- [ ] **DEV-01**: Enfermera/Secretaria puede crear solicitud de devolución vinculada a venta original
- [ ] **DEV-02**: Solicitud de devolución requiere motivo y foto del producto
- [ ] **DEV-03**: Devolución queda en estado "pendiente" hasta aprobación
- [ ] **DEV-04**: Admin puede ver lista de devoluciones pendientes
- [ ] **DEV-05**: Admin puede aprobar o rechazar devolución con notas
- [ ] **DEV-06**: Al aprobar devolución, sistema incrementa stock_devoluciones (no stock_normal)
- [ ] **DEV-07**: Al aprobar devolución, sistema registra el método de reembolso (efectivo/transferencia)

### Cierre de Caja

- [ ] **CIE-01**: Sistema calcula totales automáticos por método de pago del día (efectivo, tarjeta, transferencia, nequi)
- [ ] **CIE-02**: Usuario ingresa conteo físico de efectivo
- [ ] **CIE-03**: Sistema calcula y muestra diferencia entre esperado y declarado
- [ ] **CIE-04**: CUALQUIER diferencia requiere justificación escrita (tolerancia cero)
- [ ] **CIE-05**: Una vez cerrada la caja, sistema bloquea registro de ventas para ese día
- [ ] **CIE-06**: Números de cierre son secuenciales automáticos (CIM-000001)
- [ ] **CIE-07**: Solo Admin puede reabrir un cierre con justificación obligatoria
- [ ] **CIE-08**: Cierre de caja de Medias es INDEPENDIENTE del cierre de caja de la clínica

### Dashboard

- [ ] **DSH-01**: Dashboard muestra efectivo actual en caja de Medias
- [ ] **DSH-02**: Dashboard muestra ventas del día (cantidad y monto)
- [ ] **DSH-03**: Dashboard muestra ventas del mes (cantidad y monto)
- [ ] **DSH-04**: Dashboard muestra devoluciones pendientes de aprobación
- [ ] **DSH-05**: Dashboard muestra productos con stock crítico (< 3 unidades)

## Future Requirements

Deferred to later milestone. Tracked but not in current roadmap.

### Reportes Avanzados

- **REP-01**: Reporte de ventas por producto (unidades y monto)
- **REP-02**: Reporte de ventas por vendedor
- **REP-03**: Reporte histórico mensual

### OCR para Compras

- **OCR-01**: OCR extrae datos de foto de factura automáticamente
- **OCR-02**: Verificación humana obligatoria de datos extraídos

### Integración Prescripciones

- **INT-01**: Mostrar si paciente tiene prescripción activa de medias al vender

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Barcode scanning | Solo 11 productos, botones suficientes |
| Customer accounts | Link opcional a paciente es suficiente |
| Mixed payments (split tender) | Items de bajo costo ($130k-$190k), un método por venta |
| Discounts | Precios fijos, no política de descuentos |
| E-commerce | Retail físico solamente |
| Multi-location inventory | Una sola clínica |
| Automatic reordering | Alertas de stock bajo suficientes para 11 SKUs |
| Lot/batch tracking | Medias no son dispositivos médicos regulados |
| Integrated clinic+medias cash | Contabilidades separadas por diseño |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CAT-01 | TBD | Pending |
| CAT-02 | TBD | Pending |
| CAT-03 | TBD | Pending |
| CAT-04 | TBD | Pending |
| CAT-05 | TBD | Pending |
| VTA-01 | TBD | Pending |
| VTA-02 | TBD | Pending |
| VTA-03 | TBD | Pending |
| VTA-04 | TBD | Pending |
| VTA-05 | TBD | Pending |
| VTA-06 | TBD | Pending |
| VTA-07 | TBD | Pending |
| VTA-08 | TBD | Pending |
| VTA-09 | TBD | Pending |
| VTA-10 | TBD | Pending |
| VTA-11 | TBD | Pending |
| VTA-12 | TBD | Pending |
| VTA-13 | TBD | Pending |
| VTA-14 | TBD | Pending |
| INV-01 | TBD | Pending |
| INV-02 | TBD | Pending |
| INV-03 | TBD | Pending |
| INV-04 | TBD | Pending |
| INV-05 | TBD | Pending |
| INV-06 | TBD | Pending |
| INV-07 | TBD | Pending |
| COM-01 | TBD | Pending |
| COM-02 | TBD | Pending |
| COM-03 | TBD | Pending |
| COM-04 | TBD | Pending |
| DEV-01 | TBD | Pending |
| DEV-02 | TBD | Pending |
| DEV-03 | TBD | Pending |
| DEV-04 | TBD | Pending |
| DEV-05 | TBD | Pending |
| DEV-06 | TBD | Pending |
| DEV-07 | TBD | Pending |
| CIE-01 | TBD | Pending |
| CIE-02 | TBD | Pending |
| CIE-03 | TBD | Pending |
| CIE-04 | TBD | Pending |
| CIE-05 | TBD | Pending |
| CIE-06 | TBD | Pending |
| CIE-07 | TBD | Pending |
| CIE-08 | TBD | Pending |
| DSH-01 | TBD | Pending |
| DSH-02 | TBD | Pending |
| DSH-03 | TBD | Pending |
| DSH-04 | TBD | Pending |
| DSH-05 | TBD | Pending |

**Coverage:**
- v1.1 requirements: 43 total
- Mapped to phases: 0 (pending roadmap)
- Unmapped: 43

---
*Requirements defined: 2026-01-25*
*Last updated: 2026-01-25 after initial definition*

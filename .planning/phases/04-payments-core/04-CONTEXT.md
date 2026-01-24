# Phase 4: Payments Core - Context

**Gathered:** 2026-01-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Registros de pago INMUTABLES — no UPDATE, no DELETE a nivel de base de datos. Solo anulación por Admin o Médico con justificación obligatoria. Foto de comprobante requerida para pagos electrónicos. Números de factura secuenciales que nunca se reutilizan.

</domain>

<decisions>
## Implementation Decisions

### Catálogo de servicios
- Admin puede crear/editar servicios desde la app (CRUD de servicios)
- Mayoría de servicios tienen precio fijo
- Algunos servicios tienen precio variable según complejidad (precio base editable al registrar)
- Se permiten descuentos con justificación obligatoria (campo de texto)
- Un pago puede incluir múltiples servicios (lista de items)

### Métodos de pago
- 4 métodos: Efectivo, Tarjeta, Transferencia, Nequi
- Tarjeta, Transferencia y Nequi REQUIEREN foto de comprobante (sin foto no se guarda)
- Efectivo NO requiere foto
- Se permite pago mixto (ej: parte efectivo + parte tarjeta)
- Si pago mixto incluye método electrónico, requiere foto

### Números de factura
- Secuencia automática continua (nunca huecos)
- Pago anulado mantiene su número original
- Formato: a definir por Claude

### Anulación
- Solo Admin y Médico pueden anular pagos
- Sin límite de tiempo para anular
- Requiere justificación en texto (obligatoria)
- El pago se marca con estado = 'anulado' (no se borra)
- El registro original permanece intacto con toda su información

### Inmutabilidad (CORE)
- Tabla payments: NO tiene políticas UPDATE ni DELETE para usuarios normales
- Solo el campo 'estado' puede cambiar (de 'activo' a 'anulado')
- Trigger de anulación registra quién, cuándo y por qué en audit_log

### Claude's Discretion
- Storage de fotos (Supabase Storage recomendado)
- Formato exacto del número de factura
- UI del formulario de pago
- Diseño de la tabla payment_items para múltiples servicios

</decisions>

<specifics>
## Specific Ideas

- Pagos son el CORE VALUE del proyecto — inmutabilidad es crítica
- El sistema debe hacer el fraude IMPOSIBLE a nivel de base de datos
- La foto de comprobante es evidencia legal en caso de disputa

</specifics>

<deferred>
## Deferred Ideas

- Cierre de caja — Phase 5
- Reportes financieros — Phase 8
- Facturación electrónica DIAN — backlog

</deferred>

---

*Phase: 04-payments-core*
*Context gathered: 2026-01-24*

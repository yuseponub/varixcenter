# Phase 14: Returns Workflow - Context

**Gathered:** 2026-01-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Flujo de devoluciones con aprobación de dos fases para prevención de fraude. Productos devueltos incrementan stock_devoluciones (no stock_normal). Incluye:
- Solicitud de devolución vinculada a venta original
- Aprobación por Admin/Médico
- Registro de método de reembolso
- Integración con cierre de caja

</domain>

<decisions>
## Implementation Decisions

### Flujo de solicitud
- Cualquier empleado puede crear solicitud de devolución
- Foto del producto es OPCIONAL (no obligatoria)
- Motivo de devolución: texto libre (no lista predefinida)
- Devoluciones parciales permitidas (ej: compró 3, devuelve 1)
- Solicitud debe vincular a venta original

### Proceso de aprobación
- Admin o Médico pueden aprobar/rechazar
- Sin notificación al solicitante — solo cambia estado
- Notas del aprobador son opcionales (tanto al aprobar como rechazar)
- Sin tiempo límite — queda pendiente hasta que alguien actúe
- Estados: pendiente → aprobada/rechazada

### Método de reembolso
- Métodos disponibles: Efectivo o Cambio de producto
- Solicitante elige el método al crear la solicitud
- Si es cambio de producto: se hace venta separada (no vinculada)
- Reembolso en efectivo SÍ afecta cierre de caja de medias (se resta)

### Claude's Discretion
- Diseño de UI para lista de devoluciones pendientes
- Estructura de la tabla y campos adicionales necesarios
- Integración exacta con cierre de caja (cómo se calcula la resta)

</decisions>

<specifics>
## Specific Ideas

- El flujo anti-fraude es: empleado solicita → Admin/Médico revisa y aprueba
- stock_devoluciones se incrementa al aprobar (no stock_normal)
- El efectivo de devolución reduce el efectivo esperado en cierre

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 14-returns-workflow*
*Context gathered: 2026-01-26*

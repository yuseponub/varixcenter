# Phase 13: Purchases - Context

**Gathered:** 2026-01-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Registro de compras de mercancía que incrementan stock_normal. Incluye:
- Registro de compra con foto/PDF de factura obligatoria
- OCR para parsear productos de la factura automáticamente
- Flujo de dos pasos: registro → confirmación de recepción → incremento de stock
- Historial de compras con filtros

</domain>

<decisions>
## Implementation Decisions

### Información de compra
- Proveedor: campo de texto libre (no catálogo)
- Datos obligatorios: fecha de factura, total factura
- Número de factura: NO obligatorio
- Notas: opcional
- Todos los roles pueden registrar compras

### Permisos de modificación
- Admin/Médico pueden editar y eliminar directamente
- Enfermera puede solicitar eliminación/edición que requiere aprobación de Admin/Médico
- Al eliminar: revierte el stock si ya estaba confirmado

### Flujo de registro
- Una compra puede tener múltiples productos con cantidades
- Se captura costo unitario por producto (para análisis de márgenes en reportes)
- Stock NO incrementa al registrar - requiere confirmación de recepción
- Cualquier usuario puede confirmar recepción de mercancía
- Al confirmar recepción: incrementa stock_normal automáticamente

### Evidencia fotográfica
- Foto o PDF de factura es OBLIGATORIO para registrar compra
- Solo un archivo por compra (no múltiples)
- OCR procesa la imagen/PDF para extraer productos automáticamente
- Usuario confirma productos parseados antes de guardar

### Listado y filtros
- Filtros disponibles: fecha (rango), proveedor (búsqueda), estado (pendiente/recibido)
- Columnas: fecha, proveedor, total, estado, cantidad de productos
- Orden por defecto: pendientes de recepción primero

### Claude's Discretion
- Implementación específica del OCR (API externa vs local)
- Diseño del flujo de confirmación de productos parseados
- Manejo de errores cuando OCR no puede leer la factura
- UI del estado de procesamiento de factura

</decisions>

<specifics>
## Specific Ideas

- OCR debe parsear la factura y mostrar productos detectados para confirmación
- Flujo: subir factura → OCR procesa → muestra productos → usuario confirma → guarda compra en estado "pendiente recepción"
- Luego: confirmar recepción → incrementa stock

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 13-purchases*
*Context gathered: 2026-01-26*

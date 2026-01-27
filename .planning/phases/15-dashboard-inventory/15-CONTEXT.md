# Phase 15: Dashboard & Inventory - Context

**Gathered:** 2026-01-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Dashboard operativo para Medias con métricas de ventas, alertas de stock crítico, capacidad de ajuste manual de inventario, y página de movimientos de stock. El dashboard también funciona como hub de navegación para todos los apartados de Medias.

</domain>

<decisions>
## Implementation Decisions

### Layout del Dashboard
- Métrica principal: **Efectivo actual en caja** (lo más visible)
- Sin comparaciones con periodos anteriores (solo valores actuales)
- **Solo cards con números**, sin gráficos
- Ubicación: **/medias** (reemplaza la landing actual, productos se mueve a /medias/productos)
- Cards de navegación a apartados: **Botones/cards grandes** con solo título e icono (sin contadores)
- Apartados accesibles: Productos, Ventas, Compras, Devoluciones, Cierres

### Alertas de Stock
- Umbral **configurable por producto** (campo en tabla productos)
- Alertas visibles en **dashboard e inventario (productos)**
- Visualización: **Card resumen** ("5 productos críticos") + **lista detallada** abajo
- Cálculo basado en **solo stock_normal** (ignora stock_devoluciones para alertas)

### Ajustes de Inventario
- Permisos: **Admin y Médico** pueden hacer ajustes
- Razón de ajuste: **Campo de texto libre** (sin códigos predefinidos)
- Evidencia: **Solo justificación escrita** requerida (foto no obligatoria)
- Dirección: **Ambas** (puede agregar o quitar stock)
- Tipo de stock: **Usuario elige** si afecta stock_normal o stock_devoluciones

### Visibilidad de Stock
- En productos: **Columnas separadas** (Normal | Devoluciones | Total)
- No se necesita página de inventario separada (productos es suficiente)
- **Página global de movimientos** (/medias/movimientos) con historial de todos los movimientos
- Filtros en movimientos: **Producto, rango de fechas, y tipo** (venta, compra, devolución, ajuste)

### Claude's Discretion
- Orden y agrupación de cards en el dashboard
- Estilo visual de las alertas de stock crítico
- Formato de la tabla de movimientos

</decisions>

<specifics>
## Specific Ideas

- Dashboard funciona como "home" de Medias con navegación a todos los apartados
- Efectivo en caja es la métrica más importante (operación diaria)
- Alertas de stock basadas solo en stock_normal porque las devoluciones son "segunda calidad" y no cuentan para decisiones de reabastecimiento

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 15-dashboard-inventory*
*Context gathered: 2026-01-26*

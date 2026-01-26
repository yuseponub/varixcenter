# Phase 16: Control de Gastos - Context

**Gathered:** 2026-01-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Sistema de registro y control de gastos operativos de la clínica. Incluye gastos recurrentes (arriendo, servicios) y gastos variables (insumos, reparaciones). Integra caja menor con alertas de saldo bajo.

</domain>

<decisions>
## Implementation Decisions

### Categorías de gastos
Categorías fijas (no editables por usuario):
1. Arriendo
2. Servicios (agua, luz, gas, internet)
3. Salarios
4. Seguridad social
5. Insumos
6. Materiales de aseo
7. Reparaciones
8. Pólizas
9. Asesorías (sistemas, supersalud)
10. Mantenimiento de equipos
11. Publicidad
12. Otros

### Tipos de gastos
- **Recurrentes**: Gastos fijos mensuales (arriendo, servicios, salarios)
  - Sistema genera recordatorio al inicio del mes
  - Usuario marca como "Pagado" + adjunta comprobante
  - O marca como "Pendiente" y adjunta comprobante después
- **Variables**: Gastos puntuales (insumos, reparaciones)
  - Registro manual con comprobante obligatorio (foto o PDF)

### Fuente de pago
Al registrar gasto, usuario selecciona de dónde sale el dinero:
1. **Efectivo del día** → Resta del cierre de caja
2. **Caja menor** → Resta del fondo de caja menor
3. **Externo (médico)** → No afecta ninguna caja, solo se registra

### Caja menor
- Fondo separado para gastos pequeños
- Umbral mínimo configurable por Admin/Médico (ej: $200,000)
- Alerta cuando saldo < umbral
- Se recarga manualmente cuando se desee (no diario obligatorio)
- Recarga viene de efectivo del día o externo

### Comprobantes
- Obligatorio para gastos variables
- Obligatorio al marcar recurrente como "Pagado"
- Formatos: imagen (jpg, png, webp) o PDF
- Almacenados en Supabase Storage (bucket: payment-receipts, folder: gastos/)

### Permisos
- **Registrar gastos**: Todos los roles
- **Ver gastos del día**: Todos los roles
- **Reporte consolidado**: Solo Admin + Médico
- **Configurar umbral caja menor**: Solo Admin + Médico
- **Recargar caja menor**: Solo Admin + Médico

### Integración con otros módulos
- **Cierre de caja**: Gastos de "efectivo del día" se restan del total esperado
- **Alertas (Fase 8)**: Alerta de caja menor baja aparece en dashboard
- **Reportes (Fase 8)**: Reporte diario incluye gastos del día con comprobantes

### Claude's Discretion
- UI del formulario de gastos
- Cómo mostrar recordatorios de gastos recurrentes pendientes
- Diseño del panel de caja menor

</decisions>

<specifics>
## Specific Ideas

- Al final del día, Admin/Médico ve reporte de todos los gastos + comprobantes
- Gastos recurrentes que no se marquen como pagados siguen apareciendo como pendientes

</specifics>

<deferred>
## Deferred Ideas

- Presupuesto mensual por categoría con alertas de sobregiro
- Comparación de gastos mes a mes
- Exportación de gastos a Excel para contador

</deferred>

---

*Phase: 16-expense-control*
*Context gathered: 2026-01-26*

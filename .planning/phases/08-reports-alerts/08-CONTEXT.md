# Phase 8: Reports & Alerts - Context

**Gathered:** 2026-01-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Admin/Médico puede ver reportes financieros (diario, mensual, rango) y sistema genera alertas automáticas ante anomalías (pagos anulados, diferencias en cierre). Reportes son visuales en dashboard, no exportables.

</domain>

<decisions>
## Implementation Decisions

### Estructura de reportes
- Tres vistas: diario, mensual, y rango personalizado (selector de fechas)
- Desglose: totales por método de pago + gráfico (barras o pie)
- Información adicional: pagos del período + cantidad de citas atendidas
- Solo visualización en pantalla, sin exportación PDF/Excel

### Dashboard de alertas
- Widget en dashboard principal (no página dedicada)
- Badge con número en menú para alertas no leídas
- Alertas pueden marcarse como resueltas por Admin/Médico
- 3 niveles de severidad: Info (azul), Advertencia (amarillo), Crítico (rojo)

### Criterios de anomalías
- **Pago anulado**: Alerta cada vez que se anula un pago
  - Información completa: quién anuló, monto, paciente, motivo
  - Severidad: Advertencia
- **Diferencia en cierre**: Alerta cuando cierre tuvo diferencia
  - Distinguir faltante vs sobrante ("Faltante de $50,000")
  - Severidad: Crítico si faltante, Advertencia si sobrante
- ~~Accesos fuera de horario~~: Descartado (horario no definido aún)

### Acceso y permisos
- Reportes financieros: Solo Admin + Médico
- Ver alertas: Solo Admin + Médico
- Resolver alertas: Solo Admin + Médico
- Badge de alertas: Solo visible para Admin + Médico

### Claude's Discretion
- Tipo de gráfico (barras vs pie)
- Diseño exacto del widget de alertas
- Cómo calcular "citas atendidas" (estado completada)

</decisions>

<specifics>
## Specific Ideas

- Alertas deben ser accionables: click en alerta lleva al detalle (pago anulado → ver pago, diferencia → ver cierre)
- Badge debe actualizarse en tiempo real o al recargar página

</specifics>

<deferred>
## Deferred Ideas

- **Flujo de aprobación para anulaciones**: Enfermera solicita anular pago → Médico aprueba en alertas. Esto cambia el modelo de permisos actual y es una capacidad nueva (workflow de aprobación), no solo reportes.
- **Alertas de acceso fuera de horario**: Pendiente hasta definir horario de operación de la clínica.

</deferred>

---

*Phase: 08-reports-alerts*
*Context gathered: 2026-01-26*

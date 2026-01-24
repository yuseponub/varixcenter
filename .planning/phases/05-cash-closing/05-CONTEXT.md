# Phase 5: Cash Closing - Context

**Gathered:** 2026-01-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Secretaria puede cerrar caja del día con comparación automática entre totales calculados y conteo físico. Una vez cerrada, los registros quedan bloqueados permanentemente (con excepción de Admin/Médico con justificación).

</domain>

<decisions>
## Implementation Decisions

### Flujo de cierre
- Un solo cierre al final del día (no por turnos)
- Solo secretaria puede hacer el cierre
- Admin puede reabrir un cierre con justificación obligatoria
- Si no se cierra un día, el sistema muestra alerta al día siguiente pero NO bloquea operaciones

### Interfaz de arqueo
- Conteo por total simple ("Tengo $X en efectivo"), no por denominación de billetes
- Sistema muestra totales calculados por método: efectivo, tarjeta, transferencia, Nequi
- Secretaria ingresa su conteo físico de efectivo
- Sistema calcula y muestra diferencia automáticamente

### Manejo de diferencias
- CUALQUIER diferencia requiere justificación escrita (sin tolerancia)
- Faltante y sobrante tienen igual gravedad
- Solo texto de justificación (no foto adicional por diferencia)
- Sistema genera alertas para Admin/Médico cuando hay diferencias frecuentes en la semana

### Bloqueo y evidencia
- Foto obligatoria: del reporte impreso (no del dinero)
- Botón para imprimir/generar PDF del reporte de cierre
- Después del cierre TODO queda inmutable para ese día
- Admin/Médico pueden hacer cambios en días cerrados:
  - Si afecta montos → requiere justificación
  - Correcciones menores → sin justificación

### Claude's Discretion
- Diseño exacto de la pantalla de cierre
- Formato del reporte imprimible
- Cómo mostrar las alertas de diferencias frecuentes
- Manejo de casos edge (cierre a medianoche, etc.)

</decisions>

<specifics>
## Specific Ideas

- El flujo debe ser simple: ver totales → ingresar conteo → justificar si hay diferencia → subir foto → cerrar
- La foto es del reporte impreso firmado por la secretaria
- Alertas de diferencias frecuentes van a Admin/Médico para que investiguen patrones

</specifics>

<deferred>
## Deferred Ideas

- Reportes detallados de diferencias históricas → Phase 8 (Reports & Alerts)
- Desglose por denominación de billetes → No prioritario, quizás nunca

</deferred>

---

*Phase: 05-cash-closing*
*Context gathered: 2026-01-24*

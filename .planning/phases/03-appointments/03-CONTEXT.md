# Phase 3: Appointments - Context

**Created:** 2026-01-23
**Purpose:** Capture implementation decisions before planning

## Phase Goal

Usuario puede gestionar agenda de citas con vista por dia/semana y filtro por medico

## Requirements Covered

- APT-01: Vista de agenda por dia y semana
- APT-02: Filtro por medico (Dr. Ciro, Dra. Carolina)
- APT-03: Estados de cita con maquina de estados

## Decisions Made

### A. Componente de Calendario

**Decision:** Usar FullCalendar con drag-and-drop habilitado

**Rationale:**
- Libreria madura con vistas dia/semana incluidas
- Soporte nativo para drag-and-drop (requerido por usuario)
- Touch-friendly para uso en tablets
- Bien documentada y mantenida

**Implementation notes:**
- Package: `@fullcalendar/react` + plugins necesarios
- Drag-and-drop permite a secretarias reorganizar citas visualmente
- Necesita `@fullcalendar/interaction` para drag-drop

### D. Maquina de Estados

**Decision:** Estados extendidos con transiciones flexibles

**Estados finales:**
```
programada -> confirmada -> en_sala -> en_atencion -> completada
                 |
                 v
            cancelada
                 |
                 v
            no_asistio
```

**Reglas de transicion:**
1. **Cancelacion:** Cualquier rol puede cancelar cualquier cita (sin restricciones)
2. **No-show:** Estado `no_asistio` para rastrear inasistencias
3. **Completar:** Medico o secretaria pueden marcar como completada
4. **Reversion:** Se permite retroceder a estados anteriores libremente

**Rationale:**
- Flexibilidad total requerida por la operacion de la clinica
- No-show separado de cancelado para reportes de inasistencia
- Sin restricciones de roles para agilidad operativa

## Gray Areas Resolved

| Area | Decision | Discussed |
|------|----------|-----------|
| Componente UI | FullCalendar | Yes |
| Drag-and-drop | Habilitado | Yes |
| Estado no-show | Agregar `no_asistio` | Yes |
| Cancelacion | Cualquier rol, sin restricciones | Yes |
| Quien completa | Medico o secretaria | Yes |
| Reversion estados | Permitida libremente | Yes |

## Assumptions (Not Discussed)

Los siguientes puntos NO fueron discutidos y se asumiran valores por defecto durante la planificacion:

1. **Horario de operacion:** Se asume horario tipico de clinica (8am-6pm, lunes-sabado)
2. **Duracion de citas:** Se asume duracion configurable por tipo de servicio
3. **Datos de cita:** Se asume: paciente, medico, fecha/hora, tipo servicio, notas opcionales
4. **Solapamiento:** Se asume que el sistema NO permite citas solapadas para el mismo medico

Si alguna de estas asunciones es incorrecta, se puede ajustar durante la planificacion.

---
*Context captured: 2026-01-23*

# Phase 9: Notifications - Context

**Gathered:** 2026-01-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Sistema envía recordatorios automáticos de citas a pacientes por SMS. Recordatorios son informativos (sin respuesta bidireccional). WhatsApp se agregará en fase futura cuando esté configurado en Twilio.

</domain>

<decisions>
## Implementation Decisions

### Canal de envío
- Solo SMS por ahora (cuenta Twilio existente)
- WhatsApp se agregará después cuando esté configurado en Twilio
- Originalmente se quería ambos, pero WhatsApp Business no está listo

### Contenido del mensaje
- Información básica: nombre paciente, fecha, hora, dirección clínica
- Tono amigable: "Hola [Nombre], te recordamos tu cita..."
- Incluir teléfono de contacto para cambios de cita
- Solo informativo — no permite confirmar/cancelar por respuesta

### Timing y frecuencia
- Dos recordatorios por cita:
  1. 24 horas antes
  2. 2 horas antes
- Si falla, reintentar 1 vez (30 min después)
- Disparador: Vercel Cron (usuario tiene Vercel)

### Historial y monitoreo
- Todo el staff puede ver historial de notificaciones
- Historial visible en:
  1. Página dedicada /notificaciones (lista con filtros)
  2. Timeline del paciente (junto a citas y pagos)
- Envíos fallidos se marcan como "fallido" en historial (sin alerta activa)
- Sin opt-out por ahora — todos los pacientes reciben recordatorios

### Claude's Discretion
- Formato exacto del mensaje SMS (dentro del límite de 160 caracteres)
- Intervalo exacto de reintento
- Estructura de la tabla de notificaciones

</decisions>

<specifics>
## Specific Ideas

- Usar cuenta Twilio existente del usuario
- Vercel Cron para disparar envíos automáticos
- Mensaje ejemplo: "Hola María, te recordamos tu cita mañana 27 de enero a las 3:00 PM en Varix Center. Para cambios: 607-XXXXXXX"

</specifics>

<deferred>
## Deferred Ideas

- WhatsApp Business — agregar cuando esté configurado en Twilio
- Respuestas bidireccionales (confirmar/cancelar por SMS)
- Opt-out para pacientes que no quieren recordatorios
- Alertas activas cuando fallan envíos

</deferred>

---

*Phase: 09-notifications*
*Context gathered: 2026-01-26*

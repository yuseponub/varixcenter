# VarixClinic - Brief del Proyecto

## El Problema

Mi familia tiene una clínica de flebología (tratamiento de varices) llamada **VarixCenter**. Actualmente usan un sistema en Microsoft Access que tiene varios problemas:

1. **Robo de dinero**: Las secretarias han estado manipulando registros de pagos para robar. Borran pagos, modifican montos, y no hay forma de detectarlo.

2. **Registros en papel**: Las historias clínicas están en papel, se pierden, son difíciles de buscar.

3. **Sin seguimiento**: No hay forma fácil de ver qué pacientes tienen tratamientos pendientes o abandonaron.

4. **Órdenes de medias perdidas**: El médico receta medias de compresión pero no hay tracking de si el paciente las compró.

## El Negocio

**Equipo:**
- Dr. Ciro (mi papá) - médico principal
- Dra. Carolina (mi hermana) - médica
- 3 secretarias/enfermeras

**Servicios principales:**
- Valoración inicial (~$100,000 COP) - incluye examen Doppler
- Escleroterapia - sesiones de tratamiento con inyecciones (~$95,000 por sesión)
- ECOR/Endoláser - procedimiento quirúrgico ($1,200,000 - $1,700,000)
- Controles de seguimiento (~$110,000)
- Venta de medias de compresión (sistema separado: varix-medias)

**Flujo típico:**
1. Paciente llega → Valoración → Diagnóstico
2. Se genera plan de tratamiento (ej: 6 sesiones escleroterapia + medias)
3. Paciente agenda citas y va pagando por sesión
4. Al final, controles de seguimiento

## Lo Que Necesitamos

### Prioridad #1: Sistema Anti-Fraude de Pagos
- Que sea IMPOSIBLE modificar o borrar un pago registrado
- Foto obligatoria del dinero/voucher en cada pago
- Números de recibo secuenciales que nunca se reutilizan
- Solo un administrador pueda anular (con justificación)
- Registro de TODO lo que pasa (quién, cuándo, qué)

### Prioridad #2: Historias Clínicas Digitales
- Reemplazar el papel
- Que los doctores puedan dictar por voz (usan tablets)
- Guardar diagnósticos, tratamientos, evolución
- Fácil de buscar pacientes

### Prioridad #3: Agenda y Citas
- Ver agenda del día por médico
- Restricciones del negocio:
  - Máximo 2 procedimientos ECOR por día
  - Máximo 3 escleroterapias por pierna por día
- Control de asistencia (llegó, no llegó, etc.)

### Prioridad #4: Cierre de Caja Diario
- Sistema calcule totales automáticamente
- Comparar con efectivo físico contado
- Detectar diferencias
- Bloquear modificaciones después del cierre

### Prioridad #5: Integración con Varix-Medias
- Ya existe un sistema separado para venta de medias (varix-medias)
- Cuando el médico recete medias, que aparezca como pendiente en el otro sistema
- Alertas si el paciente no compra las medias

### Prioridad #6: Reportes
- Ver ingresos por día/mes
- Productividad por médico
- Detectar anomalías (muchas anulaciones, diferencias de caja, etc.)

## Decisiones Técnicas Ya Tomadas

- **Frontend**: Next.js con React (queremos usar v0.dev para generar UI)
- **Base de datos**: Supabase (PostgreSQL)
- **Dispositivos**: 4-5 tablets para uso en la clínica
- **Hosting**: Vercel

## Usuarios del Sistema

| Rol | Qué hace |
|-----|----------|
| Admin | Todo, incluyendo anular pagos y ver reportes financieros |
| Médico | Historias clínicas, diagnósticos, ver agenda |
| Secretaria | Registrar pacientes, agendar citas, cobrar, cerrar caja |

## Documentación Existente

Ya tenemos documentación detallada en la carpeta `/docs` con:
- Arquitectura del sistema
- Esquema de base de datos SQL
- Especificaciones por módulo
- Sistema de seguridad y auditoría

Esta documentación puede servir como referencia, pero queremos que GSD nos ayude a estructurar el desarrollo correctamente en fases.

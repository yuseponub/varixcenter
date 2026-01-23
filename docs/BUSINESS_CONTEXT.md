# VarixCenter - Sistema de Gestión Clínica Flebológica

## Información General

| Campo | Valor |
|-------|-------|
| **Nombre** | VarixCenter - Centro Médico Flebológico |
| **Dirección** | CRA. 34 N° 52-125 Piso 2 |
| **Ciudad** | Bucaramanga, Colombia |
| **Teléfonos** | 6436810 - 3162814531 |
| **Especialidad** | Flebología (tratamiento de varices y enfermedades venosas) |

## Personal

| Rol | Nombre | Dispositivo |
|-----|--------|-------------|
| Médico Flebólogo | Dr. Ciro Mario Romero Vence | Tableta |
| Médica Flebóloga | Dra. Carolina | Tableta |
| Enfermeras/Secretarias | 3 personas (roles mixtos) | 2-3 Tabletas |

## Problema a Resolver

La clínica ha sufrido pérdidas de dinero por manipulación de registros en el sistema actual (Microsoft Access). El nuevo sistema debe:

1. **Prevenir manipulación de datos** - Registros inmutables, auditoría completa
2. **Digitalizar historias clínicas** - Eliminar papel y "mamarrachos"
3. **Control de pagos** - Foto obligatoria de recibos, cierre de caja automático
4. **Integración con Varix Medias** - Sistema separado de venta de medias de compresión
5. **Seguimiento de pacientes** - Alertas de citas, tratamientos pendientes

---

## Catálogo de Servicios y Precios

### Consultas

| Servicio | Precio | Descripción |
|----------|--------|-------------|
| Valoración | $100.000 | Primera consulta. Incluye examen visual + Doppler inicial (sin reporte) |
| Control | $110.000 | Seguimiento meses después de terminado el tratamiento |
| Scaneo | $95.000 | Para pacientes que llevan años sin venir |

### Diagnóstico

| Servicio | Precio | Descripción |
|----------|--------|-------------|
| Duplex 1 pierna | $180.000 | Eco-Doppler con reporte. Solo casos complejos o a pedido |
| Duplex 2 piernas | $260.000 | Eco-Doppler ambas piernas con reporte |

### Escleroterapia (Sesiones)

| Servicio | Precio | Límite por día |
|----------|--------|----------------|
| Sesión piernas | $95.000 | Máx 3 por pierna (6 total) |
| Sesión cara | $110.000 | - |
| Sesión manos | $110.000 | - |

### Ecoreabsorción Guía Duplex

| Tipo | Precio | Descripción |
|------|--------|-------------|
| Ramificación/Perforante | $250.000 - $350.000 | Según complejidad |
| Safena Externa | $1.200.000 | VSE |
| Safena Interna | $1.600.000 - $1.700.000 | VSI |

**Límite:** Máximo 2 sesiones de ECOR por día

### Otros Procedimientos

| Servicio | Precio | Notas |
|----------|--------|-------|
| Láser Endovascular | $2.700.000 - $4.500.000 | Variable, puede incluir flebectomía |
| Flebectomía | $1.000.000 - $4.000.000 | Variable según extensión |
| Láser Superficial | No disponible | Sin equipo actualmente |

### Medias de Compresión (Varix Medias - Sistema Separado)

| Tipo | Precio Venta | Precio Compra |
|------|--------------|---------------|
| Pantymedia | $190.000 | $103.000 |
| Muslo | $175.000 | $82.000 |
| Rodilla | $145.000 | $62.000 |

**Nota:** Las medias son un negocio separado. Se compran el día del PRIMER procedimiento, no en la valoración.

---

## Métodos de Pago Aceptados

- Efectivo
- Tarjeta débito
- Tarjeta crédito
- Transferencia bancaria
- Nequi

---

## Flujo de Atención al Paciente

### Valoración (Primera Vez)

```
1. RECEPCIÓN
   └─> Paciente llega
   └─> Secretaria cobra VALORACIÓN ($100.000)
   └─> Genera factura de valoración
   └─> Paciente pasa al consultorio

2. CONSULTORIO - ENFERMERA
   └─> Llena datos de historia clínica
   └─> Avisa al médico: "Vaya a consulta"

3. CONSULTORIO - MÉDICO
   └─> Examina visualmente
   └─> Usa equipo Doppler (INCLUIDO en valoración, sin reporte)
   └─> Hace diagnóstico
   └─> Dicta diagnóstico y plan de tratamiento

4. TRANSCRIPCIÓN - ENFERMERA
   └─> Pasa el dictado al formato formal
   └─> Genera cotización con precios

5. ENTREGA AL PACIENTE
   └─> Cotización/Plan de tratamiento impreso
   └─> Factura de la valoración (NO del tratamiento)
   └─> Agenda próxima cita si acepta
```

### Procedimiento (Días Siguientes)

```
1. RECEPCIÓN
   └─> Paciente llega
   └─> Si es PRIMER procedimiento: ordena medias (→ Varix Medias)
   └─> Secretaria cobra el procedimiento del día
   └─> Genera factura

2. PROCEDIMIENTO
   └─> Médico/Enfermera realiza el procedimiento
   └─> Se registra en historia clínica

3. AGENDA
   └─> Se agenda siguiente sesión
```

### Reglas de Procedimientos por Día

| Tipo | Máximo por día |
|------|----------------|
| Ecoreabsorción | 2 sesiones |
| Escleroterapia | 3 por pierna (6 total) |
| ECOR + Escleroterapia | 2 ECOR + 1-2 escleroterapia |

**Orden recomendado:** Primero ECOR, luego escleroterapia

---

## Ejemplo: Plan de Tratamiento Complejo

**Paciente con:** Safena externa izquierda + 2 perforantes izquierda + 1 perforante derecha

| Día | Procedimiento | Pierna | Cobro |
|-----|---------------|--------|-------|
| 1 | Valoración | - | $100.000 |
| 2 | ECOR Perforante + ECOR Safena Externa | Der + Izq | $250.000 + $1.200.000 |
| 3 | ECOR Perforante | Izq | $250.000 |
| 4 | ECOR Perforante | Izq | $250.000 |
| 5-N | Escleroterapia (18 sesiones aprox) | Ambas | $95.000 x 18 |
| Final | Control | - | $110.000 |

**Total aproximado:** $3.870.000

---

## Diferencias Clave

### Doppler en Valoración vs Duplex Pagado

| Aspecto | Doppler en Valoración | Duplex como Servicio |
|---------|----------------------|---------------------|
| Precio | Incluido en $100.000 | $180.000 - $260.000 |
| Propósito | Diagnóstico inicial | Análisis exhaustivo |
| Reporte | NO se entrega | SÍ se entrega |
| Cuándo | Siempre en valoración | Solo casos complejos o a pedido |

### Control vs Scaneo

| Aspecto | Control | Scaneo |
|---------|---------|--------|
| Precio | $110.000 | $95.000 |
| Cuándo | MESES después del tratamiento | AÑOS sin venir |

---

## Documentos que Genera el Sistema

1. **Factura de pago** - Cada vez que se cobra
2. **Cotización/Plan de tratamiento** - En la valoración
3. **Historia clínica** - Registro del paciente
4. **Cierre de caja diario** - Resumen de ingresos

---

## Integración con Varix Medias

```
SISTEMA CLÍNICO                         VARIX MEDIAS
      │                                      │
      │  Médico indica medias en             │
      │  el primer procedimiento             │
      │ ─────────────────────────────────────>│
      │                                      │ Orden pendiente
      │                                      │
      │                                      │ Si no compra en X días
      │ <─────────────────────────────────────│ ALERTA
      │                                      │
      │  ¿Paciente compró?                   │
      │ ─────────────────────────────────────>│
      │                                      │ Responde: Sí/No
      │ <─────────────────────────────────────│
```

**Importante:** Las cuentas son SEPARADAS. La venta de medias no se mezcla con los ingresos de la clínica.

---

## Usuarios y Permisos

### Roles

| Rol | Usuarios |
|-----|----------|
| Médico | Dr. Ciro, Dra. Carolina |
| Enfermera/Secretaria | 3 personas (roles mixtos) |
| Administrador | (definir) |

### Permisos Sugeridos

| Acción | Médico | Enfermera | Secretaria | Admin |
|--------|--------|-----------|------------|-------|
| Ver historias clínicas | ✅ | ✅ | ❌ | ✅ |
| Editar historias clínicas | ✅ | ✅ | ❌ | ✅ |
| Registrar pagos | ❌ | ❌ | ✅ | ✅ |
| Hacer descuentos | ❌ | ❌ | ❌ | ✅ |
| Anular pagos | ❌ | ❌ | ❌ | ✅ |
| Ver reportes financieros | ❌ | ❌ | ❌ | ✅ |
| Cierre de caja | ❌ | ❌ | ✅ | ✅ |
| Agendar citas | ✅ | ✅ | ✅ | ✅ |

---

## Controles de Seguridad Requeridos

1. **Foto obligatoria** de cada recibo de pago
2. **Número de factura automático** y consecutivo (no editable)
3. **Registros inmutables** - No se pueden modificar después de guardados
4. **Eliminación solo por admin** con justificación
5. **Auditoría completa** - Quién, qué, cuándo para cada acción
6. **Cierre de caja automático** - El sistema calcula, no la secretaria

# Requirements: VarixClinic

**Defined:** 2026-01-23
**Core Value:** Pagos inmutables con evidencia obligatoria — hacer el fraude imposible

## v1 Requirements

### Authentication & Security

- [ ] **AUTH-01**: Usuario puede iniciar sesión con email y contraseña
- [ ] **AUTH-02**: Sistema soporta 4 roles con permisos diferenciados: Admin, Médico, Enfermera, Secretaria
- [ ] **AUTH-03**: Toda acción queda registrada en log de auditoría (quién, qué, cuándo, IP, datos antes/después)
- [ ] **AUTH-04**: Sistema genera alertas automáticas ante anomalías (muchas anulaciones, diferencias de caja frecuentes, accesos fuera de horario)

### Patients

- [ ] **PAT-01**: Usuario puede registrar paciente con cédula como identificador único (no editable después)
- [ ] **PAT-02**: Usuario puede buscar pacientes por cédula, nombre o celular
- [ ] **PAT-03**: Usuario puede ver timeline de eventos del paciente (pagos, citas, procedimientos)
- [ ] **PAT-04**: Registro de paciente incluye contacto de emergencia (nombre, teléfono, parentesco)

### Appointments

- [ ] **APT-01**: Usuario puede ver agenda en vista día y semana
- [ ] **APT-02**: Usuario puede filtrar agenda por médico (Dr. Ciro, Dra. Carolina)
- [ ] **APT-03**: Citas tienen estados: programada → confirmada → en_sala → en_atención → completada

### Medical Records

- [ ] **MED-01**: Usuario puede llenar historia clínica digital completa (datos, síntomas, antecedentes, hábitos)
- [ ] **MED-02**: Médico puede registrar diagnóstico con clasificación CEAP (C0-C6) y hallazgos por pierna
- [ ] **MED-03**: Sistema genera cotización automáticamente desde el plan de tratamiento prescrito
- [ ] **MED-04**: Médico puede dictar diagnóstico por voz y sistema transcribe a texto

### Payments (Anti-Fraud)

- [ ] **PAY-01**: Registros de pago son INMUTABLES — no permiten UPDATE ni DELETE, solo anulación por Admin con justificación
- [ ] **PAY-02**: Pagos con tarjeta o transferencia requieren foto obligatoria del comprobante — sin foto no se guarda
- [ ] **PAY-03**: Números de factura son secuenciales automáticos y nunca se reutilizan (incluso si se anula)
- [ ] **PAY-04**: Sistema tiene catálogo de servicios con precios, incluyendo rangos para servicios de precio variable (ej. ECOR $250k-$350k según complejidad)

### Cash Closing

- [ ] **CASH-01**: Sistema calcula totales automáticos por método de pago al cierre del día
- [ ] **CASH-02**: Secretaria ingresa conteo físico de efectivo y sistema compara con total calculado
- [ ] **CASH-03**: Diferencia mayor a $10,000 COP requiere justificación escrita obligatoria
- [ ] **CASH-04**: Una vez cerrada la caja, los registros del día quedan bloqueados permanentemente

### Reports

- [ ] **REP-01**: Admin/Médico puede ver reporte de ingresos por día y por mes
- [ ] **REP-02**: Admin/Médico puede ver reporte de ingresos desglosado por método de pago
- [ ] **REP-03**: Admin puede ver dashboard de alertas de seguridad (anomalías detectadas)

### Notifications

- [ ] **NOT-01**: Sistema envía recordatorios de citas por SMS o WhatsApp

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Clinical Enhancements

- **MED-05**: Templates pre-llenados para diagnósticos comunes de flebología
- **MED-06**: Adjuntar imágenes/documentos a historia clínica (fotos clínicas, ultrasonidos)

### Operational

- **APT-04**: Validación automática de límites (máx 2 ECOR/día, máx 4 escleroterapias/cita)
- **REP-04**: Reporte de productividad por médico

### Integration

- **INT-01**: Integración bidireccional con Varix-Medias (sistema de medias de compresión)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Portal de pacientes | Complejidad alta, clínica pequeña puede manejar por teléfono/WhatsApp |
| Integración con seguros/claims | Clínica es mayormente pago directo, complejidad masiva |
| E-prescripción | Requiere compliance regulatorio, médicos usan recetas tradicionales |
| Telehealth/video | Flebología requiere examen físico, no aplica |
| Multi-sede | Optimización prematura, una clínica primero |
| Inventario/suministros | Dominio diferente, usar Excel o sistema separado |
| IA para diagnóstico | Riesgo regulatorio, prematuro para v1 |
| Integración HL7/FHIR | Innecesario para clínica independiente |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | TBD | Pending |
| AUTH-02 | TBD | Pending |
| AUTH-03 | TBD | Pending |
| AUTH-04 | TBD | Pending |
| PAT-01 | TBD | Pending |
| PAT-02 | TBD | Pending |
| PAT-03 | TBD | Pending |
| PAT-04 | TBD | Pending |
| APT-01 | TBD | Pending |
| APT-02 | TBD | Pending |
| APT-03 | TBD | Pending |
| MED-01 | TBD | Pending |
| MED-02 | TBD | Pending |
| MED-03 | TBD | Pending |
| MED-04 | TBD | Pending |
| PAY-01 | TBD | Pending |
| PAY-02 | TBD | Pending |
| PAY-03 | TBD | Pending |
| PAY-04 | TBD | Pending |
| CASH-01 | TBD | Pending |
| CASH-02 | TBD | Pending |
| CASH-03 | TBD | Pending |
| CASH-04 | TBD | Pending |
| REP-01 | TBD | Pending |
| REP-02 | TBD | Pending |
| REP-03 | TBD | Pending |
| NOT-01 | TBD | Pending |

**Coverage:**
- v1 requirements: 27 total
- Mapped to phases: 0
- Unmapped: 27 ⚠️

---
*Requirements defined: 2026-01-23*
*Last updated: 2026-01-23 after initial definition*

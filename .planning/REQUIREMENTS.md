# Requirements: VarixClinic

**Defined:** 2026-01-23
**Core Value:** Pagos inmutables con evidencia obligatoria — hacer el fraude imposible

## v1 Requirements

### Authentication & Security

- [ ] **AUTH-01**: Usuario puede iniciar sesion con email y contrasena
- [ ] **AUTH-02**: Sistema soporta 4 roles con permisos diferenciados: Admin, Medico, Enfermera, Secretaria
- [ ] **AUTH-03**: Toda accion queda registrada en log de auditoria (quien, que, cuando, IP, datos antes/despues)
- [ ] **AUTH-04**: Sistema genera alertas automaticas ante anomalias (muchas anulaciones, diferencias de caja frecuentes, accesos fuera de horario)

### Patients

- [ ] **PAT-01**: Usuario puede registrar paciente con cedula como identificador unico (no editable despues)
- [ ] **PAT-02**: Usuario puede buscar pacientes por cedula, nombre o celular
- [ ] **PAT-03**: Usuario puede ver timeline de eventos del paciente (pagos, citas, procedimientos)
- [ ] **PAT-04**: Registro de paciente incluye contacto de emergencia (nombre, telefono, parentesco)

### Appointments

- [ ] **APT-01**: Usuario puede ver agenda en vista dia y semana
- [ ] **APT-02**: Usuario puede filtrar agenda por medico (Dr. Ciro, Dra. Carolina)
- [ ] **APT-03**: Citas tienen estados: programada → confirmada → en_sala → en_atencion → completada

### Medical Records

- [ ] **MED-01**: Usuario puede llenar historia clinica digital completa (datos, sintomas, antecedentes, habitos)
- [ ] **MED-02**: Medico puede registrar diagnostico con clasificacion CEAP (C0-C6) y hallazgos por pierna
- [ ] **MED-03**: Sistema genera cotizacion automaticamente desde el plan de tratamiento prescrito
- [ ] **MED-04**: Medico puede dictar diagnostico por voz y sistema transcribe a texto

### Payments (Anti-Fraud)

- [ ] **PAY-01**: Registros de pago son INMUTABLES — no permiten UPDATE ni DELETE, solo anulacion por Admin con justificacion
- [ ] **PAY-02**: Pagos con tarjeta o transferencia requieren foto obligatoria del comprobante — sin foto no se guarda
- [ ] **PAY-03**: Numeros de factura son secuenciales automaticos y nunca se reutilizan (incluso si se anula)
- [ ] **PAY-04**: Sistema tiene catalogo de servicios con precios, incluyendo rangos para servicios de precio variable (ej. ECOR $250k-$350k segun complejidad)

### Cash Closing

- [ ] **CASH-01**: Sistema calcula totales automaticos por metodo de pago al cierre del dia
- [ ] **CASH-02**: Secretaria ingresa conteo fisico de efectivo y sistema compara con total calculado
- [ ] **CASH-03**: Diferencia mayor a $10,000 COP requiere justificacion escrita obligatoria
- [ ] **CASH-04**: Una vez cerrada la caja, los registros del dia quedan bloqueados permanentemente

### Reports

- [ ] **REP-01**: Admin/Medico puede ver reporte de ingresos por dia y por mes
- [ ] **REP-02**: Admin/Medico puede ver reporte de ingresos desglosado por metodo de pago
- [ ] **REP-03**: Admin puede ver dashboard de alertas de seguridad (anomalias detectadas)

### Notifications

- [ ] **NOT-01**: Sistema envia recordatorios de citas por SMS o WhatsApp

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Clinical Enhancements

- **MED-05**: Templates pre-llenados para diagnosticos comunes de flebologia
- **MED-06**: Adjuntar imagenes/documentos a historia clinica (fotos clinicas, ultrasonidos)

### Operational

- **APT-04**: Validacion automatica de limites (max 2 ECOR/dia, max 4 escleroterapias/cita)
- **REP-04**: Reporte de productividad por medico

### Integration

- **INT-01**: Integracion bidireccional con Varix-Medias (sistema de medias de compresion)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Portal de pacientes | Complejidad alta, clinica pequena puede manejar por telefono/WhatsApp |
| Integracion con seguros/claims | Clinica es mayormente pago directo, complejidad masiva |
| E-prescripcion | Requiere compliance regulatorio, medicos usan recetas tradicionales |
| Telehealth/video | Flebologia requiere examen fisico, no aplica |
| Multi-sede | Optimizacion prematura, una clinica primero |
| Inventario/suministros | Dominio diferente, usar Excel o sistema separado |
| IA para diagnostico | Riesgo regulatorio, prematuro para v1 |
| Integracion HL7/FHIR | Innecesario para clinica independiente |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Pending |
| AUTH-02 | Phase 1 | Pending |
| AUTH-03 | Phase 1 | Pending |
| AUTH-04 | Phase 8 | Pending |
| PAT-01 | Phase 2 | Pending |
| PAT-02 | Phase 2 | Pending |
| PAT-03 | Phase 2 | Pending |
| PAT-04 | Phase 2 | Pending |
| APT-01 | Phase 3 | Pending |
| APT-02 | Phase 3 | Pending |
| APT-03 | Phase 3 | Pending |
| MED-01 | Phase 6 | Pending |
| MED-02 | Phase 6 | Pending |
| MED-03 | Phase 6 | Pending |
| MED-04 | Phase 7 | Pending |
| PAY-01 | Phase 4 | Pending |
| PAY-02 | Phase 4 | Pending |
| PAY-03 | Phase 4 | Pending |
| PAY-04 | Phase 4 | Pending |
| CASH-01 | Phase 5 | Pending |
| CASH-02 | Phase 5 | Pending |
| CASH-03 | Phase 5 | Pending |
| CASH-04 | Phase 5 | Pending |
| REP-01 | Phase 8 | Pending |
| REP-02 | Phase 8 | Pending |
| REP-03 | Phase 8 | Pending |
| NOT-01 | Phase 9 | Pending |

**Coverage:**
- v1 requirements: 27 total
- Mapped to phases: 27
- Unmapped: 0

---
*Requirements defined: 2026-01-23*
*Last updated: 2026-01-23 after roadmap creation*

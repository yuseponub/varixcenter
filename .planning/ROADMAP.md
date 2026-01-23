# Roadmap: VarixClinic

## Overview

Sistema de gestion para clinica de flebologia en Bucaramanga, Colombia. El proyecto prioriza la infraestructura anti-fraude (pagos inmutables, cierre de caja, auditoria) en fases tempranas porque la manipulacion de pagos es el problema central a resolver. Las fases clinicas (historias, agenda) se construyen sobre esta base segura. Dictado por voz y notificaciones externas se dejan para el final por su alta complejidad e independencia del flujo core.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Security Foundation** - Authentication, roles, RLS, and audit logging infrastructure
- [ ] **Phase 2: Patients** - Patient registry with cedula as unique ID and search
- [ ] **Phase 3: Appointments** - Calendar views and appointment state machine
- [ ] **Phase 4: Payments Core** - Immutable payment records with receipt photos (CORE VALUE)
- [ ] **Phase 5: Cash Closing** - Daily reconciliation and post-close lockdown
- [ ] **Phase 6: Medical Records** - Clinical forms, CEAP classification, and quotations
- [ ] **Phase 7: Voice Dictation** - Speech-to-text for diagnosis (high complexity)
- [ ] **Phase 8: Reports & Alerts** - Financial reports and anomaly detection
- [ ] **Phase 9: Notifications** - SMS/WhatsApp appointment reminders

## Phase Details

### Phase 1: Security Foundation
**Goal**: Sistema tiene autenticacion segura con roles diferenciados y toda accion queda registrada en log de auditoria inmutable
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03
**Success Criteria** (what must be TRUE):
  1. Usuario puede iniciar sesion con email/contrasena y mantener sesion activa
  2. Sistema distingue 4 roles (Admin, Medico, Enfermera, Secretaria) con permisos diferenciados
  3. Toda accion de usuario queda registrada en log con quien, que, cuando, IP
  4. RLS esta habilitado en TODAS las tablas (verificable con Supabase Security Advisor)
**Plans**: 5 plans in 3 waves

Plans:
- [ ] 01-01-PLAN.md — Initialize Next.js 15 with Supabase SSR clients
- [ ] 01-02-PLAN.md — Database schema: user_roles, audit_log, custom access token hook
- [ ] 01-03-PLAN.md — Auth middleware, login page, and protected routes
- [ ] 01-04-PLAN.md — Audit triggers and RLS verification tooling
- [ ] 01-05-PLAN.md — Setup docs and verification checkpoint

### Phase 2: Patients
**Goal**: Usuario puede registrar y buscar pacientes con cedula como identificador unico inmutable
**Depends on**: Phase 1
**Requirements**: PAT-01, PAT-02, PAT-03, PAT-04
**Success Criteria** (what must be TRUE):
  1. Usuario puede registrar paciente con cedula colombiana (validacion de formato)
  2. Cedula no puede ser modificada despues del registro inicial
  3. Usuario puede buscar pacientes por cedula, nombre parcial, o celular
  4. Perfil de paciente muestra timeline vacio (se llenara con pagos/citas en fases posteriores)
  5. Registro incluye contacto de emergencia obligatorio
**Plans**: TBD

Plans:
- [ ] 02-01: TBD

### Phase 3: Appointments
**Goal**: Usuario puede gestionar agenda de citas con vista por dia/semana y filtro por medico
**Depends on**: Phase 2
**Requirements**: APT-01, APT-02, APT-03
**Success Criteria** (what must be TRUE):
  1. Usuario puede ver agenda en vista dia y semana
  2. Usuario puede filtrar agenda por Dr. Ciro o Dra. Carolina
  3. Citas transicionan por estados: programada, confirmada, en_sala, en_atencion, completada
  4. Usuario puede crear cita vinculada a paciente existente
**Plans**: TBD

Plans:
- [ ] 03-01: TBD

### Phase 4: Payments Core
**Goal**: Registros de pago son INMUTABLES — no UPDATE, no DELETE, solo anulacion por Admin con justificacion (CORE VALUE del proyecto)
**Depends on**: Phase 3
**Requirements**: PAY-01, PAY-02, PAY-03, PAY-04
**Success Criteria** (what must be TRUE):
  1. Usuario puede registrar pago seleccionando servicio del catalogo con precio automatico
  2. Pagos con tarjeta o transferencia REQUIEREN foto de comprobante — sin foto no se guarda
  3. Numeros de factura son secuenciales automaticos y nunca se reutilizan (incluso si se anula)
  4. Solo Admin puede anular pago, y debe ingresar justificacion obligatoria
  5. Intentar UPDATE o DELETE en tabla payments falla a nivel de base de datos (RLS)
**Plans**: TBD

Plans:
- [ ] 04-01: TBD

### Phase 5: Cash Closing
**Goal**: Secretaria puede cerrar caja del dia con comparacion automatica y una vez cerrada los registros quedan bloqueados permanentemente
**Depends on**: Phase 4
**Requirements**: CASH-01, CASH-02, CASH-03, CASH-04
**Success Criteria** (what must be TRUE):
  1. Sistema calcula totales automaticos por metodo de pago (efectivo, tarjeta, transferencia, Nequi)
  2. Secretaria ingresa conteo fisico y sistema muestra diferencia con total calculado
  3. Diferencia mayor a $10,000 COP requiere justificacion escrita antes de poder cerrar
  4. Una vez cerrada la caja, intentar registrar pagos para ese dia falla (bloqueo por trigger)
  5. Foto del cierre es obligatoria para completar el proceso
**Plans**: TBD

Plans:
- [ ] 05-01: TBD

### Phase 6: Medical Records
**Goal**: Medico puede llenar historia clinica digital completa con clasificacion CEAP y generar cotizacion automatica
**Depends on**: Phase 3
**Requirements**: MED-01, MED-02, MED-03
**Success Criteria** (what must be TRUE):
  1. Usuario puede llenar formulario de historia clinica (datos, sintomas, antecedentes, habitos)
  2. Medico puede registrar clasificacion CEAP (C0-C6) y hallazgos por cada pierna
  3. Sistema genera cotizacion automaticamente desde el plan de tratamiento prescrito
  4. Historia clinica aparece en timeline del paciente
**Plans**: TBD

Plans:
- [ ] 06-01: TBD

### Phase 7: Voice Dictation
**Goal**: Medico puede dictar diagnostico por voz y sistema transcribe a texto para revision
**Depends on**: Phase 6
**Requirements**: MED-04
**Success Criteria** (what must be TRUE):
  1. Medico puede activar dictado por voz en campo de diagnostico
  2. Sistema transcribe audio a texto en espanol (Colombia)
  3. Transcripcion aparece como borrador que medico debe aprobar antes de guardar
  4. Audio original queda almacenado como respaldo
**Plans**: TBD

Plans:
- [ ] 07-01: TBD

### Phase 8: Reports & Alerts
**Goal**: Admin puede ver reportes financieros y sistema genera alertas automaticas ante anomalias
**Depends on**: Phase 5
**Requirements**: REP-01, REP-02, REP-03, AUTH-04
**Success Criteria** (what must be TRUE):
  1. Admin/Medico puede ver reporte de ingresos por dia y por mes
  2. Reporte desglosa ingresos por metodo de pago (efectivo, tarjeta, transferencia, Nequi)
  3. Dashboard muestra alertas de anomalias detectadas (muchas anulaciones, diferencias frecuentes, accesos fuera de horario)
  4. Admin puede investigar alertas viendo detalles del log de auditoria
**Plans**: TBD

Plans:
- [ ] 08-01: TBD

### Phase 9: Notifications
**Goal**: Sistema envia recordatorios de citas a pacientes por SMS o WhatsApp
**Depends on**: Phase 3
**Requirements**: NOT-01
**Success Criteria** (what must be TRUE):
  1. Sistema envia recordatorio automatico 24h antes de cita programada
  2. Recordatorio se envia por SMS o WhatsApp segun preferencia del paciente
  3. Admin puede ver historial de notificaciones enviadas
**Plans**: TBD

Plans:
- [ ] 09-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Security Foundation | 0/5 | Planned | - |
| 2. Patients | 0/? | Not started | - |
| 3. Appointments | 0/? | Not started | - |
| 4. Payments Core | 0/? | Not started | - |
| 5. Cash Closing | 0/? | Not started | - |
| 6. Medical Records | 0/? | Not started | - |
| 7. Voice Dictation | 0/? | Not started | - |
| 8. Reports & Alerts | 0/? | Not started | - |
| 9. Notifications | 0/? | Not started | - |

---
*Roadmap created: 2026-01-23*
*Last updated: 2026-01-23*

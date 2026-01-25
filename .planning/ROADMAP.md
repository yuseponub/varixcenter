# Roadmap: VarixClinic

## Overview

Sistema de gestion para clinica de flebologia en Bucaramanga, Colombia. El proyecto prioriza la infraestructura anti-fraude (pagos inmutables, cierre de caja, auditoria) en fases tempranas porque la manipulacion de pagos es el problema central a resolver. Las fases clinicas (historias, agenda) se construyen sobre esta base segura. Dictado por voz y notificaciones externas se dejan para el final por su alta complejidad e independencia del flujo core.

## Milestones

- 🚧 **v1.0 MVP** - Phases 1-9 (in progress)
- 📋 **v1.1 Varix-Medias** - Phases 10-15 (planned)

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

### v1.0 MVP (Phases 1-9)

- [ ] **Phase 1: Security Foundation** - Authentication, roles, RLS, and audit logging infrastructure
- [x] **Phase 2: Patients** - Patient registry with cedula as unique ID and search
- [ ] **Phase 3: Appointments** - Calendar views and appointment state machine
- [ ] **Phase 4: Payments Core** - Immutable payment records with receipt photos (CORE VALUE)
- [ ] **Phase 5: Cash Closing** - Daily reconciliation and post-close lockdown
- [ ] **Phase 6: Medical Records** - Clinical forms, CEAP classification, and quotations
- [ ] **Phase 7: Voice Dictation** - Speech-to-text for diagnosis (high complexity)
- [ ] **Phase 8: Reports & Alerts** - Financial reports and anomaly detection
- [ ] **Phase 9: Notifications** - SMS/WhatsApp appointment reminders

### v1.1 Varix-Medias (Phases 10-15)

- [x] **Phase 10: Medias Foundation** - Database schema, product catalog, inventory tables, immutability patterns
- [ ] **Phase 11: Sales Core** - POS functionality with thermal receipt printing
- [ ] **Phase 12: Cash Closing Medias** - Separate cash drawer with zero-tolerance reconciliation
- [ ] **Phase 13: Purchases** - Stock replenishment with invoice photos
- [ ] **Phase 14: Returns Workflow** - Two-phase approval for fraud prevention
- [ ] **Phase 15: Dashboard & Inventory** - Stock alerts, adjustments, and operational dashboard

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
**Plans**: 7 plans in 4 waves

Plans:
- [x] 02-01-PLAN.md — Install npm dependencies and shadcn/ui components
- [x] 02-02-PLAN.md — Database schema: patients table with RLS and immutable cedula trigger
- [x] 02-03-PLAN.md — Zod validation schemas and Supabase query functions
- [x] 02-04-PLAN.md — Server actions (create/update) and patient form component
- [x] 02-05-PLAN.md — Patient list page with search and data table
- [x] 02-06-PLAN.md — New patient and edit patient pages
- [x] 02-07-PLAN.md — Patient detail page with timeline component

### Phase 3: Appointments
**Goal**: Usuario puede gestionar agenda de citas con vista por dia/semana y filtro por medico
**Depends on**: Phase 2
**Requirements**: APT-01, APT-02, APT-03
**Success Criteria** (what must be TRUE):
  1. Usuario puede ver agenda en vista dia y semana
  2. Usuario puede filtrar agenda por Dr. Ciro o Dra. Carolina
  3. Citas transicionan por estados: programada, confirmada, en_sala, en_atencion, completada
  4. Usuario puede crear cita vinculada a paciente existente
**Plans**: 7 plans in 4 waves

Plans:
- [ ] 03-01-PLAN.md — FullCalendar packages and appointments database schema
- [ ] 03-02-PLAN.md — TypeScript types, state machine, and Zod schemas
- [ ] 03-03-PLAN.md — Supabase appointment query functions
- [ ] 03-04-PLAN.md — Server actions for appointment CRUD
- [ ] 03-05-PLAN.md — Calendar components (FullCalendar wrapper, doctor filter, status badge)
- [ ] 03-06-PLAN.md — Calendar page with data fetching and appointment dialog
- [ ] 03-07-PLAN.md — Appointment form and new appointment page

### Phase 4: Payments Core
**Goal**: Registros de pago son INMUTABLES — no UPDATE, no DELETE, solo anulacion por Admin/Medico con justificacion (CORE VALUE del proyecto)
**Depends on**: Phase 3
**Requirements**: PAY-01, PAY-02, PAY-03, PAY-04
**Success Criteria** (what must be TRUE):
  1. Usuario puede registrar pago seleccionando servicio del catalogo con precio automatico
  2. Pagos con tarjeta o transferencia REQUIEREN foto de comprobante — sin foto no se guarda
  3. Numeros de factura son secuenciales automaticos y nunca se reutilizan (incluso si se anula)
  4. Solo Admin o Medico puede anular pago, y debe ingresar justificacion obligatoria
  5. Intentar UPDATE o DELETE en tabla payments falla a nivel de base de datos (trigger)
**Plans**: 11 plans in 4 waves

Plans:
- [ ] 04-01-PLAN.md — Services catalog and payments database schema (migrations 008-009)
- [ ] 04-02-PLAN.md — Payment immutability trigger and storage bucket (migrations 010-011)
- [ ] 04-03-PLAN.md — TypeScript types for services and payments
- [ ] 04-04-PLAN.md — Zod validation schemas for services and payments
- [ ] 04-05-PLAN.md — Supabase query functions for services and payments
- [ ] 04-06-PLAN.md — Receipt upload with signed URLs and ReceiptUpload component
- [ ] 04-07-PLAN.md — Services admin CRUD page
- [ ] 04-08-PLAN.md — Payment creation RPC and server actions
- [ ] 04-09-PLAN.md — Payment form components (ServiceSelector, PaymentMethodForm, PaymentSummary)
- [ ] 04-10-PLAN.md — PaymentForm component and new payment page
- [ ] 04-11-PLAN.md — Payments list, detail page, and anulacion dialog

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

---

## Milestone v1.1: Varix-Medias

**Milestone Goal:** Modulo de gestion para tienda de medias de compresion medica con inventario, ventas, devoluciones, compras y cierre de caja independiente de la clinica.

### Phase 10: Medias Foundation
**Goal**: Base de datos con productos, inventario dual (normal/devoluciones), y patrones de inmutabilidad establecidos
**Depends on**: Phase 9 (v1.0 completion) or Phase 1 (if building in parallel)
**Requirements**: CAT-01, CAT-02, CAT-03, CAT-04, CAT-05, INV-01, INV-02, INV-06, INV-07
**Success Criteria** (what must be TRUE):
  1. Admin puede ver listado completo de productos con precio y stock actual
  2. Admin puede agregar, editar precio, y desactivar productos del catalogo
  3. Sistema tiene 11 productos pre-cargados con precios iniciales
  4. Sistema muestra stock separado: stock_normal (de compras) y stock_devoluciones (de returns)
  5. Cada movimiento de stock queda registrado con producto, tipo, cantidad, stock antes/despues, usuario, timestamp (inmutable)
**Plans**: 4 plans in 2 waves

Plans:
- [x] 10-01-PLAN.md — Database migration (medias_products, medias_stock_movements, RLS, seed data)
- [x] 10-02-PLAN.md — TypeScript types and Zod validation schemas
- [x] 10-03-PLAN.md — Server actions and products table component
- [x] 10-04-PLAN.md — Product form and products admin page

### Phase 11: Sales Core
**Goal**: Usuario puede registrar ventas inmutables con generacion de recibo para impresora termica
**Depends on**: Phase 10
**Requirements**: VTA-01, VTA-02, VTA-03, VTA-04, VTA-05, VTA-06, VTA-07, VTA-08, VTA-09, VTA-10, VTA-11, VTA-12, VTA-13, VTA-14
**Success Criteria** (what must be TRUE):
  1. Usuario puede registrar venta seleccionando productos, cantidades, y metodo de pago
  2. Pagos electronicos (tarjeta, transferencia, nequi) REQUIEREN foto de comprobante
  3. Venta decrementa stock automaticamente; sistema bloquea venta si stock es 0
  4. Numeros de venta son secuenciales (VTA-000001) y nunca se reutilizan
  5. Ventas son inmutables — solo Admin puede eliminar con justificacion, y eliminacion revierte stock
  6. Sistema genera recibo imprimible optimizado para impresora termica de 58mm
**Plans**: 8 plans in 5 waves

Plans:
- [ ] 11-01-PLAN.md — Sales database schema (medias_sales, medias_sale_items, medias_sale_methods, venta_counter)
- [ ] 11-02-PLAN.md — Immutability trigger and admin delete RPC with stock reversal
- [ ] 11-03-PLAN.md — Atomic sale creation RPC with stock decrement and FOR UPDATE locking
- [ ] 11-04-PLAN.md — TypeScript types and Zod validation schemas for sales
- [ ] 11-05-PLAN.md — Query functions and server actions for sales
- [ ] 11-06-PLAN.md — ProductSelector, SaleMethodForm, and SaleSummary components
- [ ] 11-07-PLAN.md — SaleForm, new sale page, and sales list page
- [ ] 11-08-PLAN.md — Sale detail page with thermal receipt and admin delete dialog

### Phase 12: Cash Closing Medias
**Goal**: Cierre de caja de Medias es INDEPENDIENTE del cierre de clinica, con tolerancia cero para diferencias
**Depends on**: Phase 11
**Requirements**: CIE-01, CIE-02, CIE-03, CIE-04, CIE-05, CIE-06, CIE-07, CIE-08
**Success Criteria** (what must be TRUE):
  1. Sistema calcula totales automaticos por metodo de pago del dia (efectivo, tarjeta, transferencia, nequi)
  2. Usuario ingresa conteo fisico y sistema muestra diferencia con esperado
  3. CUALQUIER diferencia (tolerancia cero) requiere justificacion escrita
  4. Una vez cerrada la caja, sistema bloquea registro de ventas para ese dia
  5. Numeros de cierre son secuenciales (CIM-000001) y solo Admin puede reabrir con justificacion
**Plans**: TBD

Plans:
- [ ] 12-01: TBD

### Phase 13: Purchases
**Goal**: Usuario puede registrar compras que incrementan stock_normal automaticamente
**Depends on**: Phase 10
**Requirements**: COM-01, COM-02, COM-03, COM-04
**Success Criteria** (what must be TRUE):
  1. Usuario puede registrar compra con fecha, proveedor, y productos recibidos
  2. Usuario puede subir foto de factura de compra como evidencia
  3. Compra incrementa stock_normal automaticamente al registrarse
  4. Usuario puede ver historial completo de compras con filtros
**Plans**: TBD

Plans:
- [ ] 13-01: TBD

### Phase 14: Returns Workflow
**Goal**: Devoluciones requieren aprobacion de Admin para prevenir fraude, y afectan stock_devoluciones (no stock_normal)
**Depends on**: Phase 11
**Requirements**: DEV-01, DEV-02, DEV-03, DEV-04, DEV-05, DEV-06, DEV-07
**Success Criteria** (what must be TRUE):
  1. Enfermera/Secretaria puede crear solicitud de devolucion vinculada a venta original con motivo y foto
  2. Devolucion queda en estado "pendiente" hasta aprobacion de Admin
  3. Admin puede ver lista de devoluciones pendientes y aprobar/rechazar con notas
  4. Al aprobar, sistema incrementa stock_devoluciones (NO stock_normal) y registra metodo de reembolso
**Plans**: TBD

Plans:
- [ ] 14-01: TBD

### Phase 15: Dashboard & Inventory
**Goal**: Dashboard operativo con alertas de stock critico y capacidad de ajuste manual de inventario
**Depends on**: Phase 11, Phase 12, Phase 14
**Requirements**: INV-03, INV-04, INV-05, DSH-01, DSH-02, DSH-03, DSH-04, DSH-05
**Success Criteria** (what must be TRUE):
  1. Dashboard muestra efectivo actual en caja, ventas del dia/mes, devoluciones pendientes
  2. Sistema muestra alertas cuando stock total < 3 unidades
  3. Dashboard muestra productos con stock critico
  4. Admin puede realizar ajuste manual de inventario con justificacion y codigo de razon (dano, perdida, correccion conteo)
**Plans**: TBD

Plans:
- [ ] 15-01: TBD

---

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10 -> 11 -> 12 -> 13 -> 14 -> 15

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Security Foundation | v1.0 | 0/5 | Planned | - |
| 2. Patients | v1.0 | 7/7 | Complete | 2026-01-23 |
| 3. Appointments | v1.0 | 0/7 | Planned | - |
| 4. Payments Core | v1.0 | 0/11 | Planned | - |
| 5. Cash Closing | v1.0 | 0/? | Not started | - |
| 6. Medical Records | v1.0 | 0/? | Not started | - |
| 7. Voice Dictation | v1.0 | 0/? | Not started | - |
| 8. Reports & Alerts | v1.0 | 0/? | Not started | - |
| 9. Notifications | v1.0 | 0/? | Not started | - |
| 10. Medias Foundation | v1.1 | 4/4 | Complete | 2026-01-25 |
| 11. Sales Core | v1.1 | 0/8 | Planned | - |
| 12. Cash Closing Medias | v1.1 | 0/? | Not started | - |
| 13. Purchases | v1.1 | 0/? | Not started | - |
| 14. Returns Workflow | v1.1 | 0/? | Not started | - |
| 15. Dashboard & Inventory | v1.1 | 0/? | Not started | - |

---
*Roadmap created: 2026-01-23*
*Last updated: 2026-01-25 — Phase 11 planned (8 plans in 5 waves)*

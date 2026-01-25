# VarixClinic

## What This Is

Sistema de gestión integral para VarixCenter, una clínica de flebología en Bucaramanga, Colombia. Reemplaza el sistema actual en Microsoft Access con una aplicación web robusta que digitaliza historias clínicas, gestiona agenda, y —fundamentalmente— implementa un sistema de pagos anti-fraude que hace imposible la manipulación de registros financieros por parte del personal.

## Core Value

**Pagos inmutables con evidencia obligatoria.** Si todo lo demás falla, los pagos deben ser imposibles de manipular, borrar o modificar sin dejar rastro auditable.

## Current Milestone: v1.1 Varix-Medias

**Goal:** Módulo de gestión para tienda de medias de compresión médica con inventario, ventas, devoluciones, compras y cierre de caja independiente.

**Target features:**
- Catálogo fijo de 11 productos (Muslo, Panty, Rodilla en varias tallas)
- Ventas directas en plataforma con foto de comprobante obligatoria
- Inventario con stock_normal y stock_devoluciones separados
- Devoluciones en 2 fases (enfermera solicita → admin aprueba)
- Compras con OCR para extracción de datos de facturas
- Cierre de caja idéntico a VarixClinic (tolerancia cero, foto obligatoria, bloqueo post-cierre)
- Dashboard con métricas de ventas, inventario crítico, efectivo en caja
- Auditoría inmutable de todos los movimientos

**Relación con VarixClinic:**
- Módulo integrado dentro de la misma aplicación
- Contabilidad/caja de efectivo SEPARADA de la clínica
- Roles compartidos: enfermeras venden y cierran, médicos también reciben efectivo

## Requirements

### Validated

(None yet — ship to validate)

### Active

**Pacientes**
- [ ] Registro de pacientes con cédula como identificador único
- [ ] Búsqueda por cédula, nombre o celular
- [ ] Perfil completo con timeline de eventos (pagos, citas, procedimientos)

**Historias Clínicas**
- [ ] Formulario digital completo (datos, síntomas, antecedentes, hábitos)
- [ ] Dictado por voz para diagnóstico (médico habla, sistema transcribe)
- [ ] Clasificación CEAP y hallazgos por pierna
- [ ] Generación automática de cotización desde diagnóstico

**Agenda**
- [ ] Vista por día/semana y por médico
- [ ] Estados de cita: programada → confirmada → en_sala → en_atención → completada
- [ ] Validación de límites: máx 2 ECOR por día, máx 4 escleroterapias por cita
- [ ] Registro de no-shows

**Pagos (Anti-Fraude)**
- [ ] Registros de pago INMUTABLES (no UPDATE, no DELETE)
- [ ] Foto obligatoria del comprobante para tarjeta/transferencia
- [ ] Números de factura secuenciales automáticos (nunca reutilizados)
- [ ] Anulación solo por admin con justificación obligatoria
- [ ] Catálogo de servicios con precios automáticos

**Cierre de Caja**
- [ ] Totales automáticos por método de pago
- [ ] Comparación con conteo físico de efectivo
- [ ] Justificación obligatoria si diferencia > $10,000 COP
- [ ] Foto del cierre obligatoria
- [ ] Bloqueo permanente después de cerrar

**Auditoría y Seguridad**
- [ ] Log automático de toda acción (quién, qué, cuándo, IP, antes/después)
- [ ] Alertas de anomalías (muchas anulaciones, diferencias frecuentes, accesos fuera de horario)
- [ ] Roles con permisos granulares (Admin, Médico, Enfermera, Secretaria)

**Reportes**
- [ ] Ingresos por día/mes y por método de pago
- [ ] Productividad por médico
- [ ] Pacientes nuevos vs recurrentes
- [ ] Dashboard de alertas de seguridad

### Out of Scope

- **App móvil nativa** — Web responsive es suficiente para tablets
- **Integración con sistemas externos de salud** — No requerido para v1
- **Facturación electrónica DIAN** — Evaluar para v2
- **OCR para ventas de medias** — Ventas se registran directamente en plataforma
- **Integración bidireccional Medias↔Clínica** — Contabilidades separadas por diseño

## Context

**El problema:** La clínica ha sufrido pérdidas económicas por robo interno. Las secretarias manipulan el sistema actual (Access): borran pagos, modifican montos, y no hay rastro de cambios. Las historias clínicas están en papel y se pierden.

**El equipo:**
- 2 médicos flebólogos (Dr. Ciro y Dra. Carolina) — usan tablets
- 3 enfermeras/secretarias con roles mixtos — 2-3 tablets
- Admin (dueño) necesita visibilidad total

**Dispositivos:** 4-5 tablets en la clínica + computador en recepción. La UI debe ser touch-friendly.

**Catálogo de servicios:** Valoración ($100k), Control ($110k), Scaneo ($95k), Escleroterapia ($95k-$110k), ECOR ($250k-$1.8M), Láser ($2.7M-$4.5M), Flebectomía ($1.5M-$4.2M).

**Métodos de pago:** Efectivo, tarjeta débito, tarjeta crédito, transferencia, Nequi.

## Constraints

- **Stack**: Next.js 15 + React 19 + TypeScript + Supabase + shadcn/ui + Tailwind — Decidido por familiaridad y costo
- **UI Generation**: v0.dev para generar componentes base — Acelerar desarrollo con UI profesional
- **Hosting**: Vercel + Supabase Pro — ~$65-70 USD/mes
- **Dispositivos**: Debe funcionar bien en tablets (touch-friendly) y computador
- **Idioma**: Interfaz en español (Colombia)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Supabase como backend | PostgreSQL manejado, Auth incluido, Storage para fotos, RLS para seguridad | — Pending |
| Pagos 100% inmutables | Prevenir fraude es el problema #1 a resolver | — Pending |
| v0.dev para UI | Acelera desarrollo, genera código shadcn/ui compatible | — Pending |
| Sin Varix-Medias en v1 | Enfocarse en sistema principal primero | ✓ Good — ahora iniciando v1.1 |
| Empezar fresh (ignorar docs existentes) | No condicionarse por decisiones previas | ✓ Good |
| Varix-Medias como módulo integrado | Reutiliza auth, UI, patrones existentes | — Pending |
| Caja de medias separada de clínica | Contabilidades independientes por diseño | — Pending |
| Cierre de caja idéntico a clínica | Consistencia UX, reutilización de código | — Pending |

---
*Last updated: 2026-01-25 after milestone v1.1 initialization*

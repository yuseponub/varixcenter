# VarixCenter - Sistema de Gestión Clínica Flebológica

Sistema integral para la gestión de una clínica especializada en flebología (tratamiento de varices y enfermedades venosas).

## Objetivo

Digitalizar y asegurar los procesos de:
- Historias clínicas con dictado por voz
- Facturación anti-fraude con registros inmutables y evidencia fotográfica
- Agenda de citas con validaciones de negocio
- Seguimiento de tratamientos
- Venta de medias de compresión (módulo Varix Medias)
- Facturación electrónica automatizada contra el portal WiMAX

## Stack Tecnológico

- **Frontend**: Next.js 16 + React 19 + TypeScript
- **UI**: Tailwind 4 + shadcn/ui (Radix), TanStack Table
- **Backend**: Next.js Server Actions + API Routes
- **Base de Datos**: Supabase (PostgreSQL con RLS)
- **Autenticación**: Supabase Auth
- **Storage**: Supabase Storage (fotos de recibos)
- **Formularios**: React Hook Form + Zod
- **Calendario**: FullCalendar
- **Gráficos**: Recharts
- **Canvas**: Fabric.js (mapa corporal)
- **Notificaciones**: Twilio
- **Transcripción**: OpenAI Whisper

## Documentación

### Operación
- [Setup](./docs/SETUP.md) - Puesta en marcha, entorno y configuración
- [Trabajar desde otro computador](./docs/WORKING-FROM-ANOTHER-PC.md) - Clon limpio, Vercel, Supabase y acceso al robot

### Integraciones
- [Sincronización Outlook ↔ Varix](./docs/OUTLOOK-SYNC.md) - Configuración, seguridad y activación
- [Robot de facturación WiMAX](./docs/ROBOT-FACTURACION-WIMAX.md) - Facturación electrónica automatizada
- [WiMAX Cloud / RDS](./docs/WIMAX-CLOUD-RDS.md) - Infraestructura del robot

### Estado del proyecto
- [Auditoría y mejoras 2026-07](./docs/AUDITORIA-Y-MEJORAS-2026-07.md) - Hallazgos y mejoras de la rama actual
- [Contrato para agentes](./AGENTS.md) - Invariantes verificados contra el schema, Workboard y fronteras de aprobación
- [Brief del proyecto](./PROJECT_BRIEF.md) - Intención del producto

### Esquema de base de datos
La fuente de verdad es `supabase/migrations/` (numeración consecutiva). No hay
un `SCHEMA.sql` consolidado.

> La documentación funcional por módulo (`docs/modules/`, `docs/architecture/`,
> `docs/security/`) se eliminó en `425947a` (2026-01-23, "starting fresh"). El
> comportamiento vigente vive en el código: `src/lib/queries/`,
> `src/app/(protected)/<módulo>/` y `src/components/<módulo>/`. Si necesitas el
> material histórico: `git show 425947a^:docs/modules/03_PAGOS.md`.

## Estructura del Proyecto

```
varix-clinic/
├── src/
│   ├── app/                   # Next.js App Router
│   │   ├── (auth)/            # Rutas de autenticación
│   │   ├── (protected)/       # Panel principal
│   │   │   ├── citas/         # Gestión de citas
│   │   │   ├── pacientes/     # Gestión de pacientes
│   │   │   ├── historias/     # Historias clínicas
│   │   │   ├── pagos/         # Facturación y cobros
│   │   │   ├── cierres/       # Cierre de caja
│   │   │   ├── medias/        # Varix Medias
│   │   │   ├── facturacion/   # Facturación electrónica (WiMAX)
│   │   │   ├── atendidos/     # Pacientes atendidos
│   │   │   ├── servicios/     # Catálogo de servicios
│   │   │   ├── notificaciones/
│   │   │   ├── reportes/      # Reportes y dashboards
│   │   │   └── dashboard/
│   │   └── api/               # API Routes, cron e integraciones
│   ├── components/            # Componentes React por módulo + ui/ (shadcn)
│   ├── lib/
│   │   ├── queries/           # Acceso a datos por módulo
│   │   ├── supabase/          # Clientes (server, client, admin, middleware)
│   │   ├── validations/       # Esquemas Zod
│   │   ├── outlook/           # Sincronización con recepción
│   │   ├── twilio/            # Notificaciones
│   │   ├── wimax/             # Catálogo de facturación
│   │   ├── appointments/, services/, storage/
│   │   └── utils.ts
│   ├── types/                 # TypeScript types
│   └── proxy.ts
├── supabase/
│   ├── migrations/            # Fuente de verdad del schema
│   ├── tests/
│   └── seed.sql
├── scripts/
│   ├── sync-access/           # Migración/sync con Access
│   └── wimax-facturas/        # Robot de facturación
├── docs/                      # Operación e integraciones
└── .planning/                 # Historial de planeación (GSD)
```

## Módulos Principales

### 1. Pacientes
- Registro con cédula opcional (inmutable una vez fijada)
- Búsqueda por cédula, nombre, teléfono
- Historial completo del paciente
- Alertas de medias pendientes

### 2. Historias Clínicas
- Formulario digital completo
- Mapa corporal interactivo (Fabric.js)
- Dictado por voz (transcripción con OpenAI Whisper)
- Generación automática de plan de tratamiento
- Fotos de historias antiguas en físico

### 3. Agenda
- Vista diaria con timeline
- Estados de cita con flujo definido
- Servicios de precio variable (ej. ECOR)

### 4. Pagos (Anti-Fraude)
- **Registros inmutables**: única transición permitida `activo → anulado`,
  con justificación y trigger que la hace cumplir
- Numeración de factura secuencial y sin huecos (`FAC-000001`)
- Comprobante fotográfico opcional; el bucket que lo guarda es append-only
- Separación por método de pago (pagos divididos)

### 5. Cierre de Caja
- Cálculo automático de totales
- Comparación efectivo físico vs sistema
- Justificación obligatoria (mín. 10 caracteres) si hay diferencia
- Foto del cierre opcional; reapertura solo por admin, con rastro

### 6. Varix Medias
- Módulo integrado en la misma aplicación (`src/app/(protected)/medias/`)
- Prescripción desde consulta, ventas, inventario y cierre propio
- Alertas si el paciente no compra

### 7. Reportes
- Dashboard de KPIs
- Ingresos por período
- Productividad por médico
- **Alertas de seguridad**

## Seguridad

```
┌──────────────────────────────────────────┐
│          CAPAS DE SEGURIDAD              │
├──────────────────────────────────────────┤
│ 1. Autenticación (Supabase Auth)         │
│ 2. Row Level Security (RLS)              │
│ 3. Inmutabilidad de pagos                │
│ 4. Evidencia fotográfica (append-only)   │
│ 5. Auditoría inmutable                   │
│ 6. Detección de anomalías                │
└──────────────────────────────────────────┘
```

El detalle vigente está en las migraciones: `002` (log de auditoría inmutable
por RLS), `010` (inmutabilidad de pagos), `011` (bucket de comprobantes
append-only).

## Instalación

```bash
# Clonar repositorio
git clone https://github.com/yuseponub/varixcenter.git
cd varixcenter
git switch mejoras-2026-07

# Instalar dependencias
npm ci

# Configurar variables de entorno
cp .env.local.example .env.local

# Antes de desplegar migraciones, comprobar el plan
npx supabase@latest link --project-ref gojqjfuszghfqvdnjjxa
npx supabase@latest db push --dry-run

# Ejecutar en desarrollo
npm run dev
```

## Variables de Entorno

La lista completa y comentada está en [`.env.local.example`](./.env.local.example).
Los grupos son:

- **Supabase**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`
- **Outlook / Microsoft Graph**: `ENABLE_OUTLOOK_SYNC`, `OUTLOOK_AUTH_MODE`,
  `MICROSOFT_*`, `OUTLOOK_*` (ver [OUTLOOK-SYNC.md](./docs/OUTLOOK-SYNC.md))
- **Twilio**: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
- **Cron**: `ENABLE_CRON`, `CRON_SECRET`
- **OCR / transcripción**: `OPENAI_API_KEY`

## Scripts

```bash
npm run dev            # Desarrollo
npm run build          # Build producción
npm run start          # Iniciar producción
npm run lint           # Linting (--quiet); lint:all para el detalle
npm run type-check     # Verificar tipos
npm run test:outlook   # Pruebas de la sincronización Outlook
npm run security:audit # npm audit --omit=dev
```

## Flujo de Desarrollo

1. Lee el módulo en `src/app/(protected)/<módulo>/` y sus componentes
2. Sigue el patrón vigente del módulo (server actions o `src/lib/queries/`)
3. Verifica con `npm run type-check` y `npm run lint`

Ver [AGENTS.md](./AGENTS.md) para el contrato completo: invariantes, migraciones
y cuándo pausar.

## Licencia

Privado - VarixCenter

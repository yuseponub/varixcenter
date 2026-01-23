# VarixCenter - Sistema de Gestión Clínica Flebológica

Sistema integral para la gestión de una clínica especializada en flebología (tratamiento de varices y enfermedades venosas).

## Objetivo

Digitalizar y asegurar los procesos de:
- Historias clínicas con dictado por voz
- Facturación anti-fraude con foto obligatoria
- Agenda de citas con validaciones de negocio
- Seguimiento de tratamientos
- Integración con sistema de venta de medias (Varix Medias)

## Stack Tecnológico

- **Frontend**: Next.js 15 + React 19 + TypeScript
- **UI Components**: shadcn/ui (generado con v0.dev)
- **Backend**: Next.js Server Actions + API Routes
- **Base de Datos**: Supabase (PostgreSQL)
- **Autenticación**: Supabase Auth
- **Storage**: Supabase Storage (fotos de recibos)
- **Estado**: TanStack Query + Zustand
- **Formularios**: React Hook Form + Zod
- **Gráficos**: Recharts
- **PDFs**: react-pdf

## Documentación Completa

### Arquitectura
- [Arquitectura del Sistema](./docs/architecture/SYSTEM_ARCHITECTURE.md) - Diagramas, estructura, flujos
- [Stack Tecnológico](./docs/architecture/TECH_STACK.md) - Tecnologías con ejemplos de código

### Módulos
- [01. Pacientes](./docs/modules/01_PACIENTES.md) - Registro y búsqueda
- [02. Historias Clínicas](./docs/modules/02_HISTORIAS_CLINICAS.md) - Formularios, dictado por voz
- [03. Pagos](./docs/modules/03_PAGOS.md) - Sistema anti-fraude
- [04. Agenda](./docs/modules/04_AGENDA.md) - Citas y restricciones
- [05. Caja](./docs/modules/05_CAJA.md) - Cierre diario
- [06. Integración Medias](./docs/modules/06_INTEGRACION_MEDIAS.md) - Conexión con Varix Medias
- [07. Reportes](./docs/modules/07_REPORTES.md) - Dashboards y analíticas

### Base de Datos
- [Schema SQL](./docs/database/SCHEMA.sql) - Esquema completo de PostgreSQL

### Seguridad
- [Sistema de Auditoría](./docs/security/AUDIT_SYSTEM.md) - Seguridad y control anti-fraude

### Contexto
- [Contexto del Negocio](./docs/BUSINESS_CONTEXT.md) - Servicios, precios, flujos
- [Modelos de Datos](./docs/DATA_MODELS.md) - Estructura de datos
- [Guía de UI](./docs/UI_GUIDE.md) - Pantallas y componentes
- [Prompts para v0](./docs/V0_PROMPTS.md) - Prompts para generar UI

## Estructura del Proyecto

```
varix-clinic/
├── app/                    # Next.js App Router
│   ├── (auth)/            # Rutas de autenticación
│   │   └── login/
│   ├── (dashboard)/       # Panel principal
│   │   ├── agenda/        # Gestión de citas
│   │   ├── pacientes/     # Gestión de pacientes
│   │   ├── historias/     # Historias clínicas
│   │   ├── pagos/         # Facturación y cobros
│   │   ├── caja/          # Cierre de caja
│   │   └── reportes/      # Reportes y dashboards
│   └── api/               # API Routes & Webhooks
│       └── webhooks/      # Integración con Varix Medias
├── actions/               # Server Actions
├── components/            # Componentes React
│   ├── ui/               # shadcn/ui components
│   ├── pacientes/        # Componentes de pacientes
│   ├── historias/        # Componentes de historias
│   ├── pagos/            # Componentes de pagos
│   ├── agenda/           # Componentes de agenda
│   ├── caja/             # Componentes de caja
│   ├── medias/           # Componentes de medias
│   ├── reportes/         # Componentes de reportes
│   └── shared/           # Componentes compartidos
├── lib/                   # Utilidades
│   ├── supabase/         # Cliente Supabase
│   └── utils/            # Helpers
├── hooks/                 # Custom React hooks
├── stores/               # Zustand stores
├── types/                # TypeScript types
└── docs/                  # Documentación
    ├── architecture/     # Arquitectura
    ├── modules/          # Documentación por módulo
    ├── database/         # Esquemas SQL
    └── security/         # Seguridad
```

## Módulos Principales

### 1. Pacientes
- Registro con validación de documento
- Búsqueda por cédula, nombre, teléfono
- Historial completo del paciente
- Alertas de medias pendientes

### 2. Historias Clínicas
- Formulario digital completo
- Mapa corporal interactivo
- Dictado por voz (Web Speech API)
- Generación automática de plan de tratamiento

### 3. Agenda
- Vista diaria con timeline
- Máximo 2 ECOR por día (validación automática)
- Máximo 3 escleroterapias por pierna por día
- Estados de cita con flujo definido

### 4. Pagos (Anti-Fraude)
- **Foto obligatoria** de cada pago
- Número de recibo secuencial (nunca reutilizado)
- **Registros inmutables** (solo anulación por admin)
- Separación por método de pago

### 5. Cierre de Caja
- Cálculo automático de totales
- Comparación efectivo físico vs sistema
- Justificación obligatoria si hay diferencia
- Foto del conteo final

### 6. Integración Varix Medias
- Prescripción automática desde consulta
- Alertas si paciente no compra
- Webhook bidireccional

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
│ 4. Evidencia fotográfica obligatoria     │
│ 5. Auditoría completa                    │
│ 6. Detección de anomalías                │
└──────────────────────────────────────────┘
```

Ver [Sistema de Auditoría](./docs/security/AUDIT_SYSTEM.md) para detalles completos.

## Instalación

```bash
# Clonar repositorio
git clone https://github.com/yuseponub/varix-clinic.git
cd varix-clinic

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env.local

# Ejecutar migraciones en Supabase
# (Usar SQL de docs/database/SCHEMA.sql)

# Ejecutar en desarrollo
npm run dev
```

## Variables de Entorno

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Integración Varix Medias
VARIX_MEDIAS_API_KEY=your-api-key
VARIX_MEDIAS_WEBHOOK_URL=https://varix-medias.vercel.app/api/webhooks/clinic
VARIX_MEDIAS_WEBHOOK_SECRET=your-webhook-secret

# Cron Jobs
CRON_SECRET=your-cron-secret
```

## Scripts

```bash
npm run dev          # Desarrollo
npm run build        # Build producción
npm run start        # Iniciar producción
npm run lint         # Linting
npm run type-check   # Verificar tipos
```

## Flujo de Desarrollo con v0.dev

1. Lee la documentación del módulo en `docs/modules/`
2. Copia el prompt de v0.dev del final del documento
3. Genera el componente en v0.dev
4. Integra en el proyecto con las server actions

## Licencia

Privado - VarixCenter

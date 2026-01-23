# Arquitectura del Sistema - VarixClinic

## Visión General

VarixClinic es un sistema de gestión integral para clínicas flebológicas que maneja el ciclo completo de atención al paciente: desde la valoración inicial hasta el seguimiento post-tratamiento, incluyendo facturación, auditoría y conexión con el sistema de venta de medias de compresión (Varix Medias).

---

## Diagrama de Arquitectura General

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                   CLIENTES                                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    │
│    │   TABLET    │    │   TABLET    │    │   TABLET    │    │   DESKTOP   │    │
│    │  Dr. Ciro   │    │Dra. Carolina│    │ Recepción   │    │    Admin    │    │
│    │             │    │             │    │             │    │             │    │
│    │ - Historia  │    │ - Historia  │    │ - Agenda    │    │ - Reportes  │    │
│    │ - Diagnóst. │    │ - Diagnóst. │    │ - Pagos     │    │ - Config    │    │
│    │ - Dictado   │    │ - Dictado   │    │ - Caja      │    │ - Usuarios  │    │
│    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘    │
│           │                  │                  │                  │           │
│           └──────────────────┴──────────────────┴──────────────────┘           │
│                                        │                                        │
│                                        ▼                                        │
│                          ┌─────────────────────────┐                           │
│                          │      NAVEGADOR WEB      │                           │
│                          │   (Chrome/Safari/Edge)  │                           │
│                          │     Progressive Web     │                           │
│                          │        App (PWA)        │                           │
│                          └────────────┬────────────┘                           │
│                                       │                                         │
└───────────────────────────────────────┼─────────────────────────────────────────┘
                                        │
                                        │ HTTPS
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              VERCEL (HOSTING)                                   │
│                            vercel.com / varixclinic.com                         │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│    ┌─────────────────────────────────────────────────────────────────────┐     │
│    │                        NEXT.JS 15 APPLICATION                        │     │
│    ├─────────────────────────────────────────────────────────────────────┤     │
│    │                                                                     │     │
│    │  ┌─────────────────────────────────────────────────────────────┐   │     │
│    │  │                    APP ROUTER (Frontend)                     │   │     │
│    │  │                                                             │   │     │
│    │  │  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐   │   │     │
│    │  │  │  Pages    │ │  Layouts  │ │Components │ │   Hooks   │   │   │     │
│    │  │  │           │ │           │ │(shadcn/ui)│ │           │   │   │     │
│    │  │  │ /login    │ │ Dashboard │ │ +v0.dev   │ │ useAuth   │   │   │     │
│    │  │  │ /agenda   │ │ Auth      │ │ +custom   │ │ usePatient│   │   │     │
│    │  │  │ /pacientes│ │           │ │           │ │ usePayment│   │   │     │
│    │  │  │ /historias│ │           │ │           │ │ etc...    │   │   │     │
│    │  │  │ /pagos    │ │           │ │           │ │           │   │   │     │
│    │  │  │ /caja     │ │           │ │           │ │           │   │   │     │
│    │  │  │ /reportes │ │           │ │           │ │           │   │   │     │
│    │  │  └───────────┘ └───────────┘ └───────────┘ └───────────┘   │   │     │
│    │  │                                                             │   │     │
│    │  └─────────────────────────────────────────────────────────────┘   │     │
│    │                                │                                   │     │
│    │                                ▼                                   │     │
│    │  ┌─────────────────────────────────────────────────────────────┐   │     │
│    │  │                    SERVER LAYER                              │   │     │
│    │  │                                                             │   │     │
│    │  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │   │     │
│    │  │  │  Server Actions │  │   API Routes    │  │ Middleware  │ │   │     │
│    │  │  │                 │  │                 │  │             │ │   │     │
│    │  │  │ createPatient() │  │ GET /api/...    │  │ Auth check  │ │   │     │
│    │  │  │ createPayment() │  │ POST /api/...   │  │ Role check  │ │   │     │
│    │  │  │ updateHistory() │  │                 │  │ Logging     │ │   │     │
│    │  │  │ etc...          │  │                 │  │             │ │   │     │
│    │  │  └─────────────────┘  └─────────────────┘  └─────────────┘ │   │     │
│    │  │                                                             │   │     │
│    │  │  ┌─────────────────────────────────────────────────────┐   │   │     │
│    │  │  │              VALIDATION LAYER (Zod)                  │   │   │     │
│    │  │  │  - Input validation                                  │   │   │     │
│    │  │  │  - Type safety                                       │   │   │     │
│    │  │  │  - Schema definitions                                │   │   │     │
│    │  │  └─────────────────────────────────────────────────────┘   │   │     │
│    │  │                                                             │   │     │
│    │  └─────────────────────────────────────────────────────────────┘   │     │
│    │                                                                     │     │
│    └─────────────────────────────────────────────────────────────────────┘     │
│                                        │                                        │
└────────────────────────────────────────┼────────────────────────────────────────┘
                                         │
                                         │ Supabase Client (SDK)
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              SUPABASE (Backend as a Service)                    │
│                                  supabase.com                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                           AUTHENTICATION                                  │  │
│  │                                                                          │  │
│  │   ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐        │  │
│  │   │   Email/   │  │   JWT      │  │  Session   │  │  Refresh   │        │  │
│  │   │  Password  │  │  Tokens    │  │ Management │  │   Tokens   │        │  │
│  │   └────────────┘  └────────────┘  └────────────┘  └────────────┘        │  │
│  │                                                                          │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                        POSTGRESQL DATABASE                                │  │
│  │                                                                          │  │
│  │   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐         │  │
│  │   │  SCHEMA:        │  │  SCHEMA:        │  │  SCHEMA:        │         │  │
│  │   │  clinic         │  │  audit          │  │  integration    │         │  │
│  │   │                 │  │                 │  │                 │         │  │
│  │   │  - pacientes    │  │  - logs         │  │  - ordenes_     │         │  │
│  │   │  - historias    │  │  - accesos      │  │    medias       │         │  │
│  │   │  - diagnosticos │  │  - cambios      │  │                 │         │  │
│  │   │  - planes       │  │                 │  │                 │         │  │
│  │   │  - sesiones     │  │                 │  │                 │         │  │
│  │   │  - pagos        │  │                 │  │                 │         │  │
│  │   │  - citas        │  │                 │  │                 │         │  │
│  │   │  - usuarios     │  │                 │  │                 │         │  │
│  │   │  - cierres_caja │  │                 │  │                 │         │  │
│  │   └─────────────────┘  └─────────────────┘  └─────────────────┘         │  │
│  │                                                                          │  │
│  │   ┌──────────────────────────────────────────────────────────────┐      │  │
│  │   │                  ROW LEVEL SECURITY (RLS)                     │      │  │
│  │   │   - Políticas por tabla                                       │      │  │
│  │   │   - Verificación de roles                                     │      │  │
│  │   │   - Aislamiento de datos                                      │      │  │
│  │   └──────────────────────────────────────────────────────────────┘      │  │
│  │                                                                          │  │
│  │   ┌──────────────────────────────────────────────────────────────┐      │  │
│  │   │              TRIGGERS & FUNCTIONS                             │      │  │
│  │   │   - audit_log_trigger()      → Registra cambios              │      │  │
│  │   │   - generate_invoice_number() → Consecutivo facturas         │      │  │
│  │   │   - update_plan_progress()   → Actualiza progreso            │      │  │
│  │   │   - calculate_totals()       → Cálculos automáticos          │      │  │
│  │   │   - check_permissions()      → Verifica permisos             │      │  │
│  │   └──────────────────────────────────────────────────────────────┘      │  │
│  │                                                                          │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                             STORAGE                                       │  │
│  │                                                                          │  │
│  │   ┌────────────────┐  ┌────────────────┐  ┌────────────────┐            │  │
│  │   │  Bucket:       │  │  Bucket:       │  │  Bucket:       │            │  │
│  │   │  recibos       │  │  documentos    │  │  cierres       │            │  │
│  │   │                │  │                │  │                │            │  │
│  │   │  - Fotos pago  │  │  - Historias   │  │  - Fotos       │            │  │
│  │   │  - Comprobantes│  │  - Cotizaciones│  │    efectivo    │            │  │
│  │   │                │  │  - Facturas PDF│  │                │            │  │
│  │   └────────────────┘  └────────────────┘  └────────────────┘            │  │
│  │                                                                          │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                         EDGE FUNCTIONS                                    │  │
│  │                                                                          │  │
│  │   ┌────────────────┐  ┌────────────────┐  ┌────────────────┐            │  │
│  │   │  generate-pdf  │  │  process-audio │  │  sync-varix    │            │  │
│  │   │                │  │  (Whisper API) │  │  (integración) │            │  │
│  │   └────────────────┘  └────────────────┘  └────────────────┘            │  │
│  │                                                                          │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                           REALTIME                                        │  │
│  │                                                                          │  │
│  │   - Actualizaciones de agenda en tiempo real                             │  │
│  │   - Notificaciones de nuevos pagos                                       │  │
│  │   - Estado de citas (opcional)                                           │  │
│  │                                                                          │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
                                         │
                                         │
              ┌──────────────────────────┼──────────────────────────┐
              │                          │                          │
              ▼                          ▼                          ▼
┌─────────────────────────┐  ┌─────────────────────────┐  ┌─────────────────────────┐
│    SERVICIOS EXTERNOS   │  │     VARIX MEDIAS        │  │      MONITOREO          │
│                         │  │   (Sistema existente)   │  │                         │
│  ┌───────────────────┐  │  │                         │  │  ┌───────────────────┐  │
│  │    OpenAI API     │  │  │  - Mismo Supabase      │  │  │      Sentry       │  │
│  │    (Whisper)      │  │  │  - Schema: public      │  │  │                   │  │
│  │                   │  │  │  - Productos, ventas   │  │  │  - Error tracking │  │
│  │  Transcripción    │  │  │                         │  │  │  - Performance    │  │
│  │  de voz           │  │  │  INTEGRACIÓN:          │  │  │                   │  │
│  └───────────────────┘  │  │  - ordenes_medias      │  │  └───────────────────┘  │
│                         │  │  - alertas pendientes  │  │                         │
│  ┌───────────────────┐  │  │                         │  │  ┌───────────────────┐  │
│  │  Impresora POS    │  │  │                         │  │  │  Vercel Analytics │  │
│  │  (térmica)        │  │  │                         │  │  │                   │  │
│  │                   │  │  │                         │  │  │  - Usage metrics  │  │
│  │  Via Web Print    │  │  │                         │  │  │  - Core Web Vitals│  │
│  │  API              │  │  │                         │  │  │                   │  │
│  └───────────────────┘  │  │                         │  │  └───────────────────┘  │
│                         │  │                         │  │                         │
└─────────────────────────┘  └─────────────────────────┘  └─────────────────────────┘
```

---

## Stack Tecnológico Detallado

### Frontend

| Tecnología | Versión | Propósito | Documentación |
|------------|---------|-----------|---------------|
| **Next.js** | 15.x | Framework React con App Router | https://nextjs.org/docs |
| **React** | 19.x | Librería UI | https://react.dev |
| **TypeScript** | 5.x | Tipado estático | https://typescriptlang.org |
| **Tailwind CSS** | 4.x | Estilos utilitarios | https://tailwindcss.com |
| **shadcn/ui** | latest | Componentes base | https://ui.shadcn.com |
| **v0.dev** | - | Generación de UI con IA | https://v0.dev |
| **TanStack Query** | 5.x | Fetching, cache, estados | https://tanstack.com/query |
| **TanStack Table** | 8.x | Tablas complejas | https://tanstack.com/table |
| **Zustand** | 5.x | Estado global | https://zustand-demo.pmnd.rs |
| **React Hook Form** | 7.x | Manejo de formularios | https://react-hook-form.com |
| **Zod** | 3.x | Validación de schemas | https://zod.dev |
| **date-fns** | 4.x | Manipulación de fechas | https://date-fns.org |
| **Recharts** | 2.x | Gráficos y visualizaciones | https://recharts.org |
| **Lucide React** | latest | Iconos | https://lucide.dev |
| **Sonner** | latest | Notificaciones toast | https://sonner.emilkowal.ski |
| **Framer Motion** | 11.x | Animaciones | https://framer.com/motion |
| **react-pdf** | 9.x | Generación de PDFs | https://react-pdf.org |
| **cmdk** | 1.x | Command palette (Cmd+K) | https://cmdk.paco.me |

### Backend

| Tecnología | Propósito | Ubicación |
|------------|-----------|-----------|
| **Next.js Server Actions** | Mutaciones (crear, editar, eliminar) | `/app/actions/` |
| **Next.js API Routes** | Endpoints REST para queries complejas | `/app/api/` |
| **Next.js Middleware** | Auth, logging, rate limiting | `/middleware.ts` |
| **Supabase SDK** | Cliente para DB, Auth, Storage | `/lib/supabase/` |
| **Zod** | Validación server-side | `/lib/validations/` |

### Base de Datos

| Tecnología | Propósito |
|------------|-----------|
| **PostgreSQL 15** | Base de datos relacional (via Supabase) |
| **Row Level Security** | Seguridad a nivel de fila |
| **PL/pgSQL** | Funciones y triggers |
| **pg_cron** | Jobs programados (opcional) |

### Servicios Cloud

| Servicio | Propósito | Plan |
|----------|-----------|------|
| **Vercel** | Hosting, CI/CD, Edge Network | Pro ($20/mes) |
| **Supabase** | Database, Auth, Storage, Edge Functions | Pro ($25/mes) |
| **Sentry** | Error tracking, performance | Free tier |
| **OpenAI** | Whisper API para transcripción | Pay as you go (~$5/mes) |

---

## Patrones de Arquitectura

### 1. Server Components (por defecto)
```tsx
// app/pacientes/page.tsx - Server Component
async function PacientesPage() {
  const pacientes = await getPacientes() // Fetch en servidor
  return <PacientesList pacientes={pacientes} />
}
```

### 2. Client Components (cuando necesario)
```tsx
// components/payment-form.tsx
'use client'

import { useForm } from 'react-hook-form'

export function PaymentForm() {
  const form = useForm()
  // Interactividad del cliente
}
```

### 3. Server Actions (mutaciones)
```tsx
// app/actions/pacientes.ts
'use server'

export async function createPaciente(data: PacienteInput) {
  const validated = pacienteSchema.parse(data)
  const result = await supabase.from('pacientes').insert(validated)
  revalidatePath('/pacientes')
  return result
}
```

### 4. API Routes (queries complejas)
```tsx
// app/api/reportes/ingresos/route.ts
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const desde = searchParams.get('desde')
  const hasta = searchParams.get('hasta')

  const ingresos = await calcularIngresos(desde, hasta)
  return Response.json(ingresos)
}
```

---

## Estructura de Carpetas

```
varix-clinic/
│
├── app/                          # Next.js App Router
│   ├── (auth)/                   # Grupo de rutas de autenticación
│   │   ├── login/
│   │   │   └── page.tsx
│   │   └── layout.tsx
│   │
│   ├── (dashboard)/              # Grupo de rutas del dashboard
│   │   ├── layout.tsx            # Layout con sidebar
│   │   ├── page.tsx              # Dashboard principal
│   │   │
│   │   ├── agenda/
│   │   │   ├── page.tsx          # Vista de agenda
│   │   │   └── [fecha]/
│   │   │       └── page.tsx      # Agenda por fecha
│   │   │
│   │   ├── pacientes/
│   │   │   ├── page.tsx          # Lista/búsqueda de pacientes
│   │   │   ├── nuevo/
│   │   │   │   └── page.tsx      # Crear paciente
│   │   │   └── [id]/
│   │   │       ├── page.tsx      # Ver paciente
│   │   │       └── historia/
│   │   │           └── page.tsx  # Historia clínica
│   │   │
│   │   ├── pagos/
│   │   │   ├── page.tsx          # Registrar pago
│   │   │   └── historial/
│   │   │       └── page.tsx      # Historial de pagos
│   │   │
│   │   ├── caja/
│   │   │   ├── page.tsx          # Estado de caja
│   │   │   └── cierre/
│   │   │       └── page.tsx      # Cierre de caja
│   │   │
│   │   ├── medias/
│   │   │   └── page.tsx          # Órdenes de medias
│   │   │
│   │   ├── reportes/
│   │   │   ├── page.tsx          # Dashboard de reportes
│   │   │   ├── ingresos/
│   │   │   ├── pacientes/
│   │   │   └── auditoria/
│   │   │
│   │   └── configuracion/
│   │       ├── usuarios/
│   │       └── servicios/
│   │
│   ├── api/                      # API Routes
│   │   ├── pacientes/
│   │   ├── pagos/
│   │   ├── reportes/
│   │   └── webhook/
│   │
│   ├── actions/                  # Server Actions
│   │   ├── pacientes.ts
│   │   ├── historias.ts
│   │   ├── pagos.ts
│   │   ├── citas.ts
│   │   └── caja.ts
│   │
│   ├── layout.tsx                # Root layout
│   ├── globals.css               # Estilos globales
│   └── not-found.tsx             # Página 404
│
├── components/                   # Componentes React
│   ├── ui/                       # shadcn/ui components
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── card.tsx
│   │   ├── dialog.tsx
│   │   ├── table.tsx
│   │   └── ...
│   │
│   ├── forms/                    # Formularios específicos
│   │   ├── patient-form.tsx
│   │   ├── history-form.tsx
│   │   ├── payment-form.tsx
│   │   └── appointment-form.tsx
│   │
│   ├── layout/                   # Componentes de layout
│   │   ├── sidebar.tsx
│   │   ├── header.tsx
│   │   ├── nav-item.tsx
│   │   └── user-menu.tsx
│   │
│   ├── features/                 # Componentes por feature
│   │   ├── agenda/
│   │   │   ├── agenda-view.tsx
│   │   │   ├── appointment-card.tsx
│   │   │   └── time-slots.tsx
│   │   │
│   │   ├── patients/
│   │   │   ├── patient-card.tsx
│   │   │   ├── patient-search.tsx
│   │   │   └── patient-history.tsx
│   │   │
│   │   ├── payments/
│   │   │   ├── payment-form.tsx
│   │   │   ├── receipt-preview.tsx
│   │   │   └── payment-methods.tsx
│   │   │
│   │   ├── medical/
│   │   │   ├── body-map.tsx           # Mapa corporal SVG
│   │   │   ├── symptoms-checklist.tsx
│   │   │   ├── diagnosis-form.tsx
│   │   │   └── treatment-plan.tsx
│   │   │
│   │   └── voice/
│   │       ├── voice-recorder.tsx
│   │       └── transcription-preview.tsx
│   │
│   └── shared/                   # Componentes compartidos
│       ├── photo-capture.tsx
│       ├── money-input.tsx
│       ├── date-picker.tsx
│       ├── status-badge.tsx
│       ├── loading-spinner.tsx
│       └── empty-state.tsx
│
├── lib/                          # Utilidades y configuración
│   ├── supabase/
│   │   ├── client.ts             # Cliente para componentes cliente
│   │   ├── server.ts             # Cliente para Server Components
│   │   ├── admin.ts              # Cliente con service role
│   │   └── types.ts              # Tipos generados de la DB
│   │
│   ├── validations/              # Schemas de Zod
│   │   ├── paciente.ts
│   │   ├── historia.ts
│   │   ├── pago.ts
│   │   └── cita.ts
│   │
│   ├── hooks/                    # Custom hooks
│   │   ├── use-auth.ts
│   │   ├── use-permissions.ts
│   │   ├── use-patient.ts
│   │   └── use-voice-recording.ts
│   │
│   ├── utils/                    # Utilidades
│   │   ├── format.ts             # Formateo de dinero, fechas
│   │   ├── constants.ts          # Constantes
│   │   └── helpers.ts            # Funciones helper
│   │
│   └── store/                    # Zustand stores
│       ├── auth-store.ts
│       ├── patient-store.ts
│       └── ui-store.ts
│
├── types/                        # TypeScript types
│   ├── database.ts               # Tipos de Supabase
│   ├── api.ts                    # Tipos de API
│   └── index.ts                  # Exports
│
├── public/                       # Assets estáticos
│   ├── logo.svg
│   └── body-map.svg
│
├── supabase/                     # Configuración Supabase
│   ├── migrations/               # Migraciones SQL
│   │   ├── 001_initial_schema.sql
│   │   ├── 002_rls_policies.sql
│   │   ├── 003_functions.sql
│   │   └── 004_triggers.sql
│   │
│   ├── functions/                # Edge Functions
│   │   ├── generate-pdf/
│   │   └── process-audio/
│   │
│   └── seed.sql                  # Datos iniciales
│
├── docs/                         # Documentación
│   ├── architecture/
│   ├── modules/
│   ├── database/
│   ├── api/
│   ├── ui/
│   ├── security/
│   ├── integrations/
│   └── guides/
│
├── .env.example                  # Variables de entorno ejemplo
├── .env.local                    # Variables de entorno local (no commit)
├── next.config.ts                # Configuración Next.js
├── tailwind.config.ts            # Configuración Tailwind
├── tsconfig.json                 # Configuración TypeScript
├── components.json               # Configuración shadcn/ui
└── package.json                  # Dependencias
```

---

## Flujo de Datos

```
┌─────────────────────────────────────────────────────────────────┐
│                        FLUJO DE LECTURA                         │
└─────────────────────────────────────────────────────────────────┘

  Usuario            Server Component         Supabase
     │                      │                    │
     │  Navega a /pacientes │                    │
     │─────────────────────>│                    │
     │                      │  SELECT * FROM     │
     │                      │  pacientes         │
     │                      │───────────────────>│
     │                      │                    │
     │                      │   [data, error]    │
     │                      │<───────────────────│
     │                      │                    │
     │   HTML + React       │                    │
     │   (renderizado)      │                    │
     │<─────────────────────│                    │
     │                      │                    │


┌─────────────────────────────────────────────────────────────────┐
│                       FLUJO DE ESCRITURA                        │
└─────────────────────────────────────────────────────────────────┘

  Usuario          Client Component      Server Action       Supabase
     │                    │                    │                │
     │  Llena formulario  │                    │                │
     │───────────────────>│                    │                │
     │                    │                    │                │
     │  Click "Guardar"   │                    │                │
     │───────────────────>│                    │                │
     │                    │                    │                │
     │                    │  createPatient()   │                │
     │                    │───────────────────>│                │
     │                    │                    │                │
     │                    │                    │  Validación    │
     │                    │                    │  (Zod)         │
     │                    │                    │                │
     │                    │                    │  INSERT INTO   │
     │                    │                    │  pacientes     │
     │                    │                    │───────────────>│
     │                    │                    │                │
     │                    │                    │   [data]       │
     │                    │                    │<───────────────│
     │                    │                    │                │
     │                    │                    │  TRIGGER:      │
     │                    │                    │  audit_log()   │
     │                    │                    │───────────────>│
     │                    │                    │                │
     │                    │                    │  revalidate    │
     │                    │                    │  Path          │
     │                    │                    │                │
     │                    │   { success }      │                │
     │                    │<───────────────────│                │
     │                    │                    │                │
     │  Toast "Guardado"  │                    │                │
     │<───────────────────│                    │                │
     │                    │                    │                │
     │  Redirect o        │                    │                │
     │  Actualizar UI     │                    │                │
     │<───────────────────│                    │                │
```

---

## Seguridad

### Capas de Seguridad

1. **Frontend**: Validación con Zod, sanitización de inputs
2. **Middleware**: Verificación de autenticación en cada request
3. **Server Actions**: Validación server-side, verificación de permisos
4. **Database**: Row Level Security (RLS), triggers de auditoría
5. **Network**: HTTPS obligatorio, headers de seguridad

### Modelo de Permisos

```
ADMIN
  └── Todos los permisos

MEDICO
  ├── Ver/Editar historias clínicas
  ├── Ver/Crear diagnósticos
  ├── Ver/Crear planes de tratamiento
  ├── Ordenar medias
  └── Ver agenda propia

ENFERMERA
  ├── Ver historias clínicas
  ├── Editar datos básicos de pacientes
  ├── Registrar sesiones
  └── Ver agenda

SECRETARIA
  ├── Ver agenda (todas)
  ├── Editar citas
  ├── Registrar pagos
  ├── Hacer cierre de caja
  └── Ver datos básicos de pacientes
```

---

## Performance

### Optimizaciones Implementadas

1. **Server Components**: Renderizado en servidor por defecto
2. **Streaming**: Suspense boundaries para carga progresiva
3. **Caching**: TanStack Query para cache client-side
4. **Code Splitting**: Rutas cargadas dinámicamente
5. **Image Optimization**: Next.js Image component
6. **Database**: Índices en columnas frecuentemente consultadas

### Métricas Target

| Métrica | Target |
|---------|--------|
| First Contentful Paint | < 1.5s |
| Largest Contentful Paint | < 2.5s |
| Time to Interactive | < 3s |
| Cumulative Layout Shift | < 0.1 |

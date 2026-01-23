# VarixCenter - Sistema de Gestión Clínica Flebológica

Sistema integral para la gestión de una clínica especializada en flebología (tratamiento de varices y enfermedades venosas).

## Objetivo

Digitalizar y asegurar los procesos de:
- Historias clínicas
- Facturación y cobros
- Agenda de citas
- Seguimiento de tratamientos
- Integración con sistema de venta de medias (Varix Medias)

## Stack Tecnológico

- **Frontend**: Next.js 15 + React 19 (generado con v0.dev)
- **Backend**: Next.js API Routes / Server Actions
- **Base de Datos**: Supabase (PostgreSQL)
- **Autenticación**: Supabase Auth
- **Storage**: Supabase Storage (fotos de recibos)
- **Estilos**: Tailwind CSS + shadcn/ui

## Documentación

- [Contexto del Negocio](./docs/BUSINESS_CONTEXT.md) - Servicios, precios, flujos
- [Modelos de Datos](./docs/DATA_MODELS.md) - Estructura de la base de datos
- [Guía de UI](./docs/UI_GUIDE.md) - Pantallas y componentes

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
│   │   └── reportes/      # Reportes
│   └── api/               # API Routes
├── components/            # Componentes React
│   ├── ui/               # shadcn/ui components
│   └── ...
├── lib/                   # Utilidades
│   ├── supabase/         # Cliente Supabase
│   └── ...
├── docs/                  # Documentación
└── supabase/             # Configuración Supabase
    └── schema.sql        # Esquema de BD
```

## Módulos Principales

### 1. Pacientes
- Registro de nuevos pacientes
- Búsqueda por cédula, nombre, teléfono
- Historial completo del paciente

### 2. Historias Clínicas
- Formulario digital (reemplaza papel)
- Sistema de dictado por voz (futuro)
- Generación automática de cotización

### 3. Agenda
- Vista por día/semana
- Agenda por médico
- Confirmación de citas
- Registro de inasistencias

### 4. Facturación
- Cobro con foto obligatoria de recibo
- Número de factura automático
- Separación por método de pago
- Registros inmutables

### 5. Cierre de Caja
- Cálculo automático por el sistema
- Comparación efectivo físico vs sistema
- Foto del efectivo

### 6. Integración Varix Medias
- Órdenes de medias automáticas
- Alertas de pacientes que no compraron
- Cuentas separadas

## Seguridad

- Autenticación con Supabase Auth
- Row Level Security (RLS)
- Auditoría completa de acciones
- Registros de pago inmutables
- Permisos granulares por usuario

## Instalación

```bash
# Clonar repositorio
git clone https://github.com/yuseponub/varix-clinic.git

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env.local

# Ejecutar en desarrollo
npm run dev
```

## Variables de Entorno

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

## Licencia

Privado - VarixCenter

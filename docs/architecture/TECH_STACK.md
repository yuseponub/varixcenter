# Stack Tecnológico - VarixClinic

## Resumen Ejecutivo

| Capa | Tecnología Principal | Alternativas Consideradas | Decisión |
|------|---------------------|---------------------------|----------|
| Frontend Framework | Next.js 15 | Remix, Nuxt, SvelteKit | Next.js por ecosistema y conocimiento previo |
| UI Components | shadcn/ui + v0.dev | Material UI, Chakra, Ant Design | shadcn por customización y v0 por generación IA |
| State Management | Zustand + TanStack Query | Redux, Jotai, SWR | Zustand es simple, TanStack Query para server state |
| Styling | Tailwind CSS 4 | CSS Modules, Styled Components | Tailwind por velocidad de desarrollo |
| Database | Supabase (PostgreSQL) | PlanetScale, Neon, Railway | Supabase por features all-in-one |
| Auth | Supabase Auth | Auth0, Clerk, NextAuth | Ya integrado con Supabase |
| Hosting | Vercel | Netlify, Railway, AWS | Mejor integración con Next.js |

---

## Frontend Detallado

### Next.js 15

**¿Por qué Next.js 15?**
- App Router con Server Components
- Server Actions para mutaciones
- Streaming y Suspense integrados
- Optimización automática de imágenes
- Middleware para auth

**Configuración clave:**
```typescript
// next.config.ts
import type { NextConfig } from 'next'

const config: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb', // Para fotos de recibos
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
}

export default config
```

---

### shadcn/ui + v0.dev

**shadcn/ui** - Componentes base:
- No es una librería, son componentes que se copian a tu proyecto
- 100% customizables
- Accesibles (ARIA compliant)
- Basados en Radix UI primitives

**v0.dev** - Generación con IA:
- Genera componentes completos a partir de prompts
- Output compatible con shadcn/ui
- Exporta directamente a tu repo

**Componentes que usaremos:**

| Componente | Uso en VarixClinic |
|------------|-------------------|
| `Button` | Acciones principales |
| `Input` | Campos de formulario |
| `Card` | Contenedores de información |
| `Dialog` | Modales de confirmación |
| `Table` | Listas de pacientes, pagos |
| `Form` | Formularios complejos |
| `Select` | Dropdowns |
| `Tabs` | Navegación secundaria |
| `Calendar` | Selector de fechas |
| `Command` | Búsqueda rápida (Cmd+K) |
| `Toast` | Notificaciones (via Sonner) |
| `Sheet` | Paneles laterales (mobile) |
| `Skeleton` | Loading states |
| `Badge` | Estados, etiquetas |
| `Avatar` | Fotos de usuarios |

**Instalación inicial:**
```bash
npx shadcn@latest init

# Seleccionar componentes necesarios
npx shadcn@latest add button input card dialog table form select tabs calendar command sheet skeleton badge avatar
```

---

### TanStack Query

**¿Por qué TanStack Query?**
- Cache automático de datos del servidor
- Refetch en background
- Optimistic updates
- Infinite queries para paginación
- Devtools para debugging

**Configuración:**
```typescript
// lib/providers/query-provider.tsx
'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useState } from 'react'

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minuto
            gcTime: 5 * 60 * 1000, // 5 minutos
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
```

**Ejemplo de uso:**
```typescript
// hooks/use-pacientes.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getPacientes, createPaciente } from '@/app/actions/pacientes'

export function usePacientes(search?: string) {
  return useQuery({
    queryKey: ['pacientes', search],
    queryFn: () => getPacientes(search),
  })
}

export function useCreatePaciente() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createPaciente,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pacientes'] })
    },
  })
}
```

---

### TanStack Table

**¿Por qué TanStack Table?**
- Headless (sin estilos, máxima flexibilidad)
- Sorting, filtering, pagination integrados
- Column resizing
- Row selection
- Virtual scrolling para listas grandes

**Ejemplo de tabla de pagos:**
```typescript
// components/features/payments/payments-table.tsx
'use client'

import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
} from '@tanstack/react-table'

const columns = [
  {
    accessorKey: 'numero_factura',
    header: 'Factura',
  },
  {
    accessorKey: 'paciente.nombre',
    header: 'Paciente',
  },
  {
    accessorKey: 'total',
    header: 'Total',
    cell: ({ row }) => formatMoney(row.getValue('total')),
  },
  {
    accessorKey: 'metodo_pago',
    header: 'Método',
    cell: ({ row }) => <PaymentMethodBadge method={row.getValue('metodo_pago')} />,
  },
  {
    accessorKey: 'created_at',
    header: 'Fecha',
    cell: ({ row }) => formatDate(row.getValue('created_at')),
  },
]
```

---

### Zustand

**¿Por qué Zustand?**
- API simple (menos boilerplate que Redux)
- TypeScript first
- Persiste en localStorage fácilmente
- Pequeño (~1kb)

**Stores que crearemos:**

```typescript
// lib/store/auth-store.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthState {
  user: User | null
  role: Role | null
  permissions: Permission[]
  setUser: (user: User) => void
  setPermissions: (permissions: Permission[]) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      role: null,
      permissions: [],
      setUser: (user) => set({ user, role: user.role }),
      setPermissions: (permissions) => set({ permissions }),
      logout: () => set({ user: null, role: null, permissions: [] }),
    }),
    {
      name: 'auth-storage',
    }
  )
)
```

```typescript
// lib/store/patient-store.ts
import { create } from 'zustand'

interface PatientState {
  currentPatient: Patient | null
  setCurrentPatient: (patient: Patient | null) => void
}

export const usePatientStore = create<PatientState>((set) => ({
  currentPatient: null,
  setCurrentPatient: (patient) => set({ currentPatient: patient }),
}))
```

---

### React Hook Form + Zod

**¿Por qué esta combinación?**
- RHF: Performance (no re-renders innecesarios)
- Zod: Validación type-safe, reutilizable en frontend y backend

**Schema de ejemplo:**
```typescript
// lib/validations/paciente.ts
import { z } from 'zod'

export const pacienteSchema = z.object({
  cedula: z
    .string()
    .min(6, 'Cédula debe tener al menos 6 caracteres')
    .max(15, 'Cédula muy larga')
    .regex(/^\d+$/, 'Solo números'),

  nombre_completo: z
    .string()
    .min(3, 'Nombre muy corto')
    .max(100, 'Nombre muy largo'),

  fecha_nacimiento: z
    .date()
    .max(new Date(), 'Fecha no puede ser futura')
    .optional(),

  celular: z
    .string()
    .regex(/^3\d{9}$/, 'Número de celular inválido')
    .optional(),

  email: z
    .string()
    .email('Email inválido')
    .optional()
    .or(z.literal('')),

  direccion: z.string().optional(),
  ciudad: z.string().optional(),
  ocupacion: z.string().optional(),
})

export type PacienteInput = z.infer<typeof pacienteSchema>
```

**Formulario con RHF + Zod:**
```typescript
// components/forms/patient-form.tsx
'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { pacienteSchema, PacienteInput } from '@/lib/validations/paciente'

export function PatientForm({ onSubmit }: { onSubmit: (data: PacienteInput) => void }) {
  const form = useForm<PacienteInput>({
    resolver: zodResolver(pacienteSchema),
    defaultValues: {
      cedula: '',
      nombre_completo: '',
    },
  })

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          control={form.control}
          name="cedula"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Cédula</FormLabel>
              <FormControl>
                <Input placeholder="12345678" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {/* ... más campos */}
      </form>
    </Form>
  )
}
```

---

### Recharts

**¿Por qué Recharts?**
- Basado en D3.js pero con API de React
- Componentes declarativos
- Responsive por defecto
- Buena documentación

**Gráficos que necesitamos:**
- Ingresos por día/semana/mes (Line/Bar)
- Distribución por método de pago (Pie)
- Procedimientos realizados (Bar)
- Pacientes nuevos vs controles (Area)

**Ejemplo:**
```typescript
// components/features/reports/income-chart.tsx
'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

export function IncomeChart({ data }: { data: IncomeData[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="fecha" />
        <YAxis tickFormatter={(value) => `$${value / 1000}k`} />
        <Tooltip formatter={(value) => formatMoney(value)} />
        <Bar dataKey="efectivo" fill="#22c55e" name="Efectivo" />
        <Bar dataKey="tarjeta" fill="#3b82f6" name="Tarjeta" />
        <Bar dataKey="transferencia" fill="#f59e0b" name="Transferencia" />
      </BarChart>
    </ResponsiveContainer>
  )
}
```

---

### react-pdf

**¿Por qué react-pdf?**
- Genera PDFs con sintaxis tipo React
- Control total del diseño
- Funciona tanto en servidor como cliente
- Ideal para cotizaciones y facturas

**Documento de cotización:**
```typescript
// lib/pdf/cotizacion-template.tsx
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
  },
  header: {
    textAlign: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  // ... más estilos
})

export function CotizacionPDF({ data }: { data: CotizacionData }) {
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>VARIX CENTER</Text>
          <Text>CENTRO MÉDICO FLEBOLÓGICO</Text>
        </View>

        <View style={styles.patientInfo}>
          <Text>Paciente: {data.paciente.nombre}</Text>
          <Text>Cédula: {data.paciente.cedula}</Text>
        </View>

        {/* Tabla de procedimientos */}
        <View style={styles.table}>
          {data.items.map((item, index) => (
            <View key={index} style={styles.row}>
              <Text style={styles.cell}>{item.descripcion}</Text>
              <Text style={styles.cell}>{item.pierna}</Text>
              <Text style={styles.cellRight}>{formatMoney(item.valor)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.total}>
          <Text>TOTAL ESTIMADO: {formatMoney(data.total)}</Text>
        </View>
      </Page>
    </Document>
  )
}
```

---

### date-fns

**¿Por qué date-fns?**
- Inmutable (no modifica fechas originales)
- Tree-shakeable (solo importas lo que usas)
- Soporte de locales (español)
- Funcional

**Configuración locale:**
```typescript
// lib/utils/date.ts
import { format, formatDistance, parseISO, isToday, isTomorrow, startOfDay, endOfDay } from 'date-fns'
import { es } from 'date-fns/locale'

export function formatFecha(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, "d 'de' MMMM 'de' yyyy", { locale: es })
}

export function formatFechaCorta(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'dd/MM/yyyy', { locale: es })
}

export function formatHora(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'h:mm a', { locale: es })
}

export function formatDiaAgenda(date: Date): string {
  if (isToday(date)) return 'Hoy'
  if (isTomorrow(date)) return 'Mañana'
  return format(date, "EEEE d 'de' MMMM", { locale: es })
}
```

---

### Otras Librerías

| Librería | Versión | Propósito |
|----------|---------|-----------|
| **sonner** | 1.x | Toasts/notificaciones bonitas |
| **framer-motion** | 11.x | Animaciones fluidas |
| **cmdk** | 1.x | Command palette (Cmd+K) |
| **lucide-react** | latest | Iconos SVG |
| **clsx** | 2.x | Condicionales de clases |
| **tailwind-merge** | 2.x | Merge de clases Tailwind |
| **@supabase/supabase-js** | 2.x | Cliente Supabase |
| **@supabase/ssr** | 0.x | SSR helpers para Supabase |

---

## Backend Detallado

### Supabase

**Features que usaremos:**

| Feature | Uso |
|---------|-----|
| **Database** | PostgreSQL 15, schemas, funciones, triggers |
| **Auth** | Email/password, JWT, sesiones |
| **RLS** | Row Level Security para permisos |
| **Storage** | Fotos de recibos, PDFs |
| **Edge Functions** | Lógica pesada (PDFs, Whisper) |
| **Realtime** | Actualizaciones de agenda (opcional) |

**Configuración del cliente:**
```typescript
// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

```typescript
// lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Ignorar en Server Components
          }
        },
      },
    }
  )
}
```

---

### Server Actions

**Estructura:**
```typescript
// app/actions/pacientes.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { pacienteSchema } from '@/lib/validations/paciente'
import { revalidatePath } from 'next/cache'

export async function createPaciente(formData: FormData) {
  const supabase = await createClient()

  // Obtener usuario actual
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autorizado')

  // Validar datos
  const rawData = Object.fromEntries(formData)
  const validated = pacienteSchema.parse(rawData)

  // Insertar en DB
  const { data, error } = await supabase
    .from('pacientes')
    .insert({
      ...validated,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) throw error

  // Revalidar cache
  revalidatePath('/pacientes')

  return { success: true, data }
}
```

---

## Variables de Entorno

```env
# .env.local

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxxx
SUPABASE_SERVICE_ROLE_KEY=eyJxxxx

# OpenAI (para Whisper)
OPENAI_API_KEY=sk-xxxx

# Sentry
SENTRY_DSN=https://xxxx@sentry.io/xxxx
SENTRY_AUTH_TOKEN=xxxx

# App
NEXT_PUBLIC_APP_URL=https://varixclinic.com
```

---

## Scripts de NPM

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "lint:fix": "next lint --fix",
    "type-check": "tsc --noEmit",
    "db:types": "supabase gen types typescript --project-id xxxxx > types/database.ts",
    "db:push": "supabase db push",
    "db:reset": "supabase db reset"
  }
}
```

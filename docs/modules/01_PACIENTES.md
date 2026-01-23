# Módulo: Pacientes

## Descripción General

El módulo de Pacientes es el núcleo del sistema. Gestiona toda la información demográfica y de contacto de los pacientes, sirve como punto de entrada para otros módulos (historias clínicas, pagos, citas) y mantiene un registro histórico completo de cada paciente.

---

## Funcionalidades

### 1. Registro de Paciente Nuevo

**Flujo:**
```
Secretaria/Enfermera
       │
       ▼
┌─────────────────────┐
│  Buscar por cédula  │
│  (verificar si      │
│   existe)           │
└──────────┬──────────┘
           │
    ┌──────┴──────┐
    │             │
    ▼             ▼
 EXISTE        NO EXISTE
    │             │
    ▼             ▼
Ver perfil   Formulario
existente    nuevo paciente
                  │
                  ▼
           Llenar datos
                  │
                  ▼
           Guardar
                  │
                  ▼
           Continuar a
           valoración
```

**Campos del formulario:**

| Campo | Tipo | Requerido | Validación |
|-------|------|-----------|------------|
| Cédula | text | ✅ | 6-15 dígitos, único |
| Nombre completo | text | ✅ | 3-100 caracteres |
| Fecha de nacimiento | date | ❌ | No futura |
| Género | select | ❌ | F/M |
| Estado civil | select | ❌ | Soltero/Casado/Viudo/Divorciado/Unión libre |
| Ocupación | text | ❌ | - |
| Dirección | text | ❌ | - |
| Ciudad | text | ❌ | Default: Bucaramanga |
| Teléfono fijo | text | ❌ | 7 dígitos |
| Celular | text | ✅ | 10 dígitos, empieza con 3 |
| Email | email | ❌ | Formato válido |
| Cómo nos conoció | select | ❌ | Referido/Publicidad/Internet/Otro |

**Datos de contacto de emergencia (opcionales):**

| Campo | Tipo | Requerido |
|-------|------|-----------|
| Nombre contacto | text | ❌ |
| Teléfono contacto | text | ❌ |
| Parentesco | select | ❌ |

---

### 2. Búsqueda de Pacientes

**Criterios de búsqueda:**
- Por cédula (búsqueda exacta)
- Por nombre (búsqueda parcial, case-insensitive)
- Por celular (búsqueda exacta)

**Implementación con debounce:**
```typescript
// hooks/use-patient-search.ts
import { useQuery } from '@tanstack/react-query'
import { useDebounce } from '@/lib/hooks/use-debounce'

export function usePatientSearch(query: string) {
  const debouncedQuery = useDebounce(query, 300)

  return useQuery({
    queryKey: ['patients', 'search', debouncedQuery],
    queryFn: () => searchPatients(debouncedQuery),
    enabled: debouncedQuery.length >= 3,
  })
}
```

**UI de búsqueda:**
```
┌─────────────────────────────────────────────────────────────┐
│ 🔍 Buscar paciente...                              [+ Nuevo]│
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Escriba cédula, nombre o celular (mínimo 3 caracteres)     │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                     │   │
│  │  CC 37.840.063                                      │   │
│  │  Mayarlandez Gutierrez Bayona                       │   │
│  │  📱 321-310-4675  │  Última visita: 22/01/2026      │   │
│  │                                          [Ver] [📋] │   │
│  │                                                     │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │                                                     │   │
│  │  CC 52.123.456                                      │   │
│  │  María García López                                 │   │
│  │  📱 315-234-5678  │  Última visita: 15/01/2026      │   │
│  │                                          [Ver] [📋] │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

### 3. Perfil del Paciente

**Vista de perfil completo:**

```
┌─────────────────────────────────────────────────────────────┐
│ [←] Mayarlandez Gutierrez Bayona              [Editar] [⋮] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  INFORMACIÓN PERSONAL                                       │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Cédula:    37.840.063                               │   │
│  │ Edad:      46 años (09/11/1979)                     │   │
│  │ Género:    Femenino                                 │   │
│  │ Estado:    Casada                                   │   │
│  │ Ocupación: Hogar                                    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  CONTACTO                                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 📱 321-310-4675                      [WhatsApp] [📞]│   │
│  │ 📧 mayarlandez@email.com             [Enviar email] │   │
│  │ 📍 Diagonal 13 #60-125, Real de Minas, Bucaramanga  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ═══════════════════════════════════════════════════════   │
│                                                             │
│  TABS: [Historial] [Tratamiento] [Pagos] [Citas]           │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  HISTORIAL MÉDICO                                           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 📋 22/01/2026 - Control post-tratamiento            │   │
│  │    Dr. Ciro Mario                                   │   │
│  │                                                     │   │
│  │ 📋 06/11/2025 - Valoración inicial                  │   │
│  │    Dr. Ciro Mario                                   │   │
│  │    Diagnóstico: Insuficiencia Venosa Crónica        │   │
│  │    Ver historia completa →                          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  TRATAMIENTO ACTIVO                                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Plan: Ecoreabsorción + Escleroterapia               │   │
│  │ Total: $3.410.000                                   │   │
│  │ Pagado: $1.950.000 (57%)                            │   │
│  │ Progreso: ████████░░░░░░ 12/18 sesiones             │   │
│  │                                                     │   │
│  │ Próxima cita: 25/01/2026 9:00am - 2 Sesiones       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ACCIONES RÁPIDAS                                           │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │
│  │ Nueva   │ │ Registrar│ │ Agendar │ │ Ordenar │           │
│  │ Historia│ │  Pago    │ │  Cita   │ │ Medias  │           │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

### 4. Edición de Paciente

**Campos editables:**
- Todos los datos de contacto
- Información personal (excepto cédula)

**Campos NO editables:**
- Cédula (identificador único)
- Fecha de registro
- Historial médico (se edita desde módulo de historias)

**Auditoría de cambios:**
- Cada modificación se registra en `audit.logs`
- Se guarda: campo modificado, valor anterior, valor nuevo, usuario, fecha/hora

---

### 5. Historial del Paciente

**Información mostrada en timeline:**

```
TIMELINE DEL PACIENTE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  📅 22/01/2026                                    ──────────
  │
  ├── 💰 Pago: $190.000 (2 sesiones escleroterapia)
  │       Factura #39384 | Tarjeta
  │
  ├── 💉 Sesión: 2 sesiones escleroterapia
  │       Pierna izquierda | Dr. Ciro
  │
  └── 📋 Control post-tratamiento
          Evolución satisfactoria

  📅 15/01/2026                                    ──────────
  │
  ├── 💰 Pago: $250.000 (ECOR perforante)
  │       Factura #39350 | Efectivo
  │
  └── 💉 Procedimiento: ECOR perforante
          Pierna izquierda | Dr. Ciro

  📅 06/11/2025                                    ──────────
  │
  ├── 💰 Pago: $100.000 (Valoración)
  │       Factura #39280 | Efectivo
  │
  ├── 📋 Historia clínica creada
  │       Diagnóstico: Insuficiencia Venosa Crónica
  │
  └── 📄 Plan de tratamiento generado
          Total estimado: $3.410.000

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Modelo de Datos

```sql
CREATE TABLE clinic.pacientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identificación
  cedula VARCHAR(20) UNIQUE NOT NULL,
  nombre_completo VARCHAR(100) NOT NULL,

  -- Datos personales
  fecha_nacimiento DATE,
  genero CHAR(1) CHECK (genero IN ('F', 'M')),
  estado_civil VARCHAR(20),
  ocupacion VARCHAR(50),

  -- Contacto
  direccion TEXT,
  ciudad VARCHAR(50) DEFAULT 'Bucaramanga',
  telefono VARCHAR(15),
  celular VARCHAR(15),
  email VARCHAR(100),

  -- Cómo nos conoció
  publicidad VARCHAR(50),

  -- Contacto de emergencia
  contacto_emergencia_nombre VARCHAR(100),
  contacto_emergencia_telefono VARCHAR(15),
  contacto_emergencia_parentesco VARCHAR(30),

  -- Metadata
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Índices
CREATE INDEX idx_pacientes_cedula ON clinic.pacientes(cedula);
CREATE INDEX idx_pacientes_nombre ON clinic.pacientes USING gin(nombre_completo gin_trgm_ops);
CREATE INDEX idx_pacientes_celular ON clinic.pacientes(celular);

-- Trigger para updated_at
CREATE TRIGGER update_pacientes_updated_at
  BEFORE UPDATE ON clinic.pacientes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

---

## API / Server Actions

### Crear paciente
```typescript
// app/actions/pacientes.ts
'use server'

export async function createPaciente(data: PacienteInput) {
  const supabase = await createClient()

  // Verificar que no exista
  const { data: existing } = await supabase
    .from('pacientes')
    .select('id')
    .eq('cedula', data.cedula)
    .single()

  if (existing) {
    return { error: 'Ya existe un paciente con esta cédula' }
  }

  const { data: paciente, error } = await supabase
    .from('pacientes')
    .insert(data)
    .select()
    .single()

  if (error) throw error

  revalidatePath('/pacientes')
  return { success: true, data: paciente }
}
```

### Buscar pacientes
```typescript
export async function searchPacientes(query: string) {
  const supabase = await createClient()

  // Determinar tipo de búsqueda
  const isNumeric = /^\d+$/.test(query)

  let queryBuilder = supabase
    .from('pacientes')
    .select(`
      id,
      cedula,
      nombre_completo,
      celular,
      ultima_visita:citas(fecha)
    `)
    .eq('activo', true)
    .order('nombre_completo')
    .limit(10)

  if (isNumeric) {
    // Buscar por cédula o celular
    queryBuilder = queryBuilder.or(`cedula.eq.${query},celular.eq.${query}`)
  } else {
    // Buscar por nombre (case-insensitive, parcial)
    queryBuilder = queryBuilder.ilike('nombre_completo', `%${query}%`)
  }

  const { data, error } = await queryBuilder

  if (error) throw error
  return data
}
```

### Obtener paciente con historial
```typescript
export async function getPacienteConHistorial(id: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('pacientes')
    .select(`
      *,
      historias_clinicas (
        id,
        fecha,
        medico:usuarios(nombre)
      ),
      planes_tratamiento (
        id,
        total_estimado,
        estado,
        items:plan_tratamiento_items(*)
      ),
      pagos (
        id,
        numero_factura,
        total,
        metodo_pago,
        created_at
      ),
      citas (
        id,
        fecha,
        hora,
        tipo,
        estado
      )
    `)
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}
```

---

## Componentes UI

### PatientCard
```typescript
// components/features/patients/patient-card.tsx
interface PatientCardProps {
  patient: {
    id: string
    cedula: string
    nombre_completo: string
    celular?: string
    ultima_visita?: string
  }
  onView?: () => void
  onNewHistory?: () => void
}

export function PatientCard({ patient, onView, onNewHistory }: PatientCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-sm text-muted-foreground">
              CC {formatCedula(patient.cedula)}
            </p>
            <p className="font-semibold text-lg">{patient.nombre_completo}</p>
            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
              {patient.celular && (
                <span className="flex items-center gap-1">
                  <Phone className="h-4 w-4" />
                  {formatPhone(patient.celular)}
                </span>
              )}
              {patient.ultima_visita && (
                <span>Última visita: {formatFecha(patient.ultima_visita)}</span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onView}>
              Ver
            </Button>
            <Button variant="ghost" size="sm" onClick={onNewHistory}>
              <ClipboardPlus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
```

### PatientSearch
```typescript
// components/features/patients/patient-search.tsx
'use client'

export function PatientSearch({ onSelect }: { onSelect: (patient: Patient) => void }) {
  const [query, setQuery] = useState('')
  const { data: patients, isLoading } = usePatientSearch(query)

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por cédula, nombre o celular..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {isLoading && <LoadingSpinner />}

      {patients?.length === 0 && query.length >= 3 && (
        <EmptyState
          icon={UserX}
          title="No se encontraron pacientes"
          description="Intenta con otro término de búsqueda"
          action={
            <Button onClick={() => router.push('/pacientes/nuevo')}>
              Registrar nuevo paciente
            </Button>
          }
        />
      )}

      {patients?.map((patient) => (
        <PatientCard
          key={patient.id}
          patient={patient}
          onView={() => onSelect(patient)}
        />
      ))}
    </div>
  )
}
```

---

## Permisos

| Acción | Admin | Médico | Enfermera | Secretaria |
|--------|-------|--------|-----------|------------|
| Ver lista de pacientes | ✅ | ✅ | ✅ | ✅ |
| Ver perfil completo | ✅ | ✅ | ✅ | ❌ (solo datos básicos) |
| Crear paciente | ✅ | ✅ | ✅ | ✅ |
| Editar paciente | ✅ | ✅ | ✅ | ❌ |
| Eliminar paciente | ✅ | ❌ | ❌ | ❌ |
| Ver historial médico | ✅ | ✅ | ✅ | ❌ |
| Exportar datos | ✅ | ❌ | ❌ | ❌ |

---

## Validaciones

```typescript
// lib/validations/paciente.ts
import { z } from 'zod'

export const pacienteSchema = z.object({
  cedula: z
    .string()
    .min(6, 'La cédula debe tener al menos 6 dígitos')
    .max(15, 'La cédula es muy larga')
    .regex(/^\d+$/, 'La cédula solo debe contener números'),

  nombre_completo: z
    .string()
    .min(3, 'El nombre es muy corto')
    .max(100, 'El nombre es muy largo')
    .regex(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/, 'El nombre solo debe contener letras'),

  fecha_nacimiento: z
    .string()
    .optional()
    .transform((val) => val ? new Date(val) : undefined)
    .refine((date) => !date || date <= new Date(), {
      message: 'La fecha no puede ser futura',
    }),

  genero: z.enum(['F', 'M']).optional(),

  estado_civil: z
    .enum(['soltero', 'casado', 'viudo', 'divorciado', 'union_libre'])
    .optional(),

  celular: z
    .string()
    .regex(/^3\d{9}$/, 'El celular debe tener 10 dígitos y empezar con 3')
    .optional()
    .or(z.literal('')),

  email: z
    .string()
    .email('El email no es válido')
    .optional()
    .or(z.literal('')),

  direccion: z.string().max(200).optional(),
  ciudad: z.string().max(50).optional(),
  ocupacion: z.string().max(50).optional(),
  publicidad: z.string().max(50).optional(),
})

export type PacienteInput = z.infer<typeof pacienteSchema>
```

---

## Casos de Uso

### CU-001: Registrar paciente nuevo en valoración

**Actor:** Enfermera/Secretaria

**Precondición:** Paciente no existe en el sistema

**Flujo principal:**
1. Usuario busca por cédula
2. Sistema indica que no existe
3. Usuario hace clic en "Nuevo paciente"
4. Sistema muestra formulario
5. Usuario llena datos obligatorios (cédula, nombre, celular)
6. Usuario llena datos opcionales según disponibilidad
7. Usuario hace clic en "Guardar"
8. Sistema valida datos
9. Sistema guarda paciente
10. Sistema muestra perfil del paciente
11. Usuario puede continuar a crear historia clínica

**Flujo alternativo 4a:** Cédula ya existe
- Sistema muestra mensaje de error
- Usuario verifica la cédula

### CU-002: Buscar paciente existente

**Actor:** Cualquier usuario

**Flujo principal:**
1. Usuario escribe en campo de búsqueda
2. Sistema espera 300ms (debounce)
3. Sistema busca por cédula, nombre o celular
4. Sistema muestra resultados
5. Usuario selecciona paciente
6. Sistema muestra perfil del paciente

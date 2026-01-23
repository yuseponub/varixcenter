# Módulo 04: Agenda y Citas

## Descripción General

Sistema de gestión de agenda médica que permite programar, modificar y controlar las citas de los pacientes. Incluye restricciones de negocio específicas para procedimientos (máximo 2 ECOR por día, máximo 3 escleroterapia por pierna por día).

## Reglas de Negocio

### Restricciones de Procedimientos

```
┌─────────────────────────────────────────────────────────────────┐
│                    REGLAS DE AGENDA                             │
├─────────────────────────────────────────────────────────────────┤
│  ECOR (Endoláser):                                              │
│  • Máximo 2 procedimientos por día                              │
│  • Requiere preparación de quirófano                            │
│  • Duración estimada: 2-3 horas                                 │
│                                                                 │
│  Escleroterapia:                                                │
│  • Máximo 3 sesiones por pierna por día                         │
│  • Puede hacerse ambas piernas en una cita                      │
│  • Duración estimada: 30-45 minutos                             │
│                                                                 │
│  Valoración:                                                    │
│  • Incluye Doppler (no cargo extra)                             │
│  • Duración estimada: 45-60 minutos                             │
│  • Primera cita del paciente nuevo                              │
│                                                                 │
│  Control:                                                       │
│  • Seguimiento post-tratamiento                                 │
│  • Duración estimada: 20-30 minutos                             │
└─────────────────────────────────────────────────────────────────┘
```

### Tipos de Cita y Duración

| Tipo | Código | Duración (min) | Restricción Diaria |
|------|--------|----------------|-------------------|
| Valoración | VAL | 60 | Sin límite |
| Control | CTR | 30 | Sin límite |
| Escleroterapia | ESC | 45 | 3 por pierna |
| Scaneo | SCA | 30 | Sin límite |
| Duplex | DPX | 45 | Sin límite |
| ECOR | ECR | 180 | 2 por día |

## Modelo de Datos

### Tabla: clinic.citas

```sql
CREATE TABLE clinic.citas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID NOT NULL REFERENCES clinic.pacientes(id),
  medico_id UUID NOT NULL REFERENCES clinic.usuarios(id),

  -- Programación
  fecha DATE NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fin TIME NOT NULL,
  tipo_cita VARCHAR(20) NOT NULL CHECK (tipo_cita IN (
    'valoracion', 'control', 'escleroterapia',
    'scaneo', 'duplex', 'ecor'
  )),

  -- Para escleroterapia
  pierna VARCHAR(10) CHECK (pierna IN ('izquierda', 'derecha', 'ambas', NULL)),
  sesion_numero INTEGER, -- Número de sesión del tratamiento

  -- Estado
  estado VARCHAR(20) NOT NULL DEFAULT 'programada' CHECK (estado IN (
    'programada', 'confirmada', 'en_sala',
    'en_atencion', 'completada', 'no_asistio', 'cancelada'
  )),

  -- Información adicional
  motivo TEXT,
  notas_internas TEXT,
  recordatorio_enviado BOOLEAN DEFAULT FALSE,

  -- Auditoría
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES clinic.usuarios(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES clinic.usuarios(id),

  -- Índices para búsqueda rápida
  CONSTRAINT cita_hora_valida CHECK (hora_fin > hora_inicio)
);

-- Índice para búsqueda por fecha y médico
CREATE INDEX idx_citas_fecha_medico ON clinic.citas(fecha, medico_id);

-- Índice para búsqueda por paciente
CREATE INDEX idx_citas_paciente ON clinic.citas(paciente_id);
```

### Tabla: clinic.bloqueos_agenda

```sql
-- Bloqueos de horario (vacaciones, reuniones, etc.)
CREATE TABLE clinic.bloqueos_agenda (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id UUID NOT NULL REFERENCES clinic.usuarios(id),
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  hora_inicio TIME, -- NULL = todo el día
  hora_fin TIME,
  motivo VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES clinic.usuarios(id)
);
```

## Validaciones del Sistema

### Trigger: Validar Límites de ECOR

```sql
CREATE OR REPLACE FUNCTION clinic.validar_limite_ecor()
RETURNS TRIGGER AS $$
DECLARE
  ecor_count INTEGER;
BEGIN
  IF NEW.tipo_cita = 'ecor' AND NEW.estado NOT IN ('cancelada', 'no_asistio') THEN
    SELECT COUNT(*) INTO ecor_count
    FROM clinic.citas
    WHERE fecha = NEW.fecha
      AND tipo_cita = 'ecor'
      AND estado NOT IN ('cancelada', 'no_asistio')
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID);

    IF ecor_count >= 2 THEN
      RAISE EXCEPTION 'No se pueden programar más de 2 procedimientos ECOR por día. Ya hay % programados para esta fecha.', ecor_count;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validar_limite_ecor
  BEFORE INSERT OR UPDATE ON clinic.citas
  FOR EACH ROW
  EXECUTE FUNCTION clinic.validar_limite_ecor();
```

### Trigger: Validar Límites de Escleroterapia

```sql
CREATE OR REPLACE FUNCTION clinic.validar_limite_escleroterapia()
RETURNS TRIGGER AS $$
DECLARE
  escl_count_izq INTEGER;
  escl_count_der INTEGER;
BEGIN
  IF NEW.tipo_cita = 'escleroterapia' AND NEW.estado NOT IN ('cancelada', 'no_asistio') THEN
    -- Contar sesiones por pierna para el mismo paciente en el mismo día
    SELECT
      COUNT(*) FILTER (WHERE pierna IN ('izquierda', 'ambas')),
      COUNT(*) FILTER (WHERE pierna IN ('derecha', 'ambas'))
    INTO escl_count_izq, escl_count_der
    FROM clinic.citas
    WHERE fecha = NEW.fecha
      AND paciente_id = NEW.paciente_id
      AND tipo_cita = 'escleroterapia'
      AND estado NOT IN ('cancelada', 'no_asistio')
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID);

    -- Validar según la pierna de la nueva cita
    IF NEW.pierna IN ('izquierda', 'ambas') AND escl_count_izq >= 3 THEN
      RAISE EXCEPTION 'Máximo 3 sesiones de escleroterapia por pierna por día. Pierna izquierda ya tiene % sesiones.', escl_count_izq;
    END IF;

    IF NEW.pierna IN ('derecha', 'ambas') AND escl_count_der >= 3 THEN
      RAISE EXCEPTION 'Máximo 3 sesiones de escleroterapia por pierna por día. Pierna derecha ya tiene % sesiones.', escl_count_der;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validar_limite_escleroterapia
  BEFORE INSERT OR UPDATE ON clinic.citas
  FOR EACH ROW
  EXECUTE FUNCTION clinic.validar_limite_escleroterapia();
```

### Trigger: Detectar Conflictos de Horario

```sql
CREATE OR REPLACE FUNCTION clinic.validar_conflicto_horario()
RETURNS TRIGGER AS $$
DECLARE
  conflicto_count INTEGER;
BEGIN
  IF NEW.estado NOT IN ('cancelada', 'no_asistio') THEN
    SELECT COUNT(*) INTO conflicto_count
    FROM clinic.citas
    WHERE medico_id = NEW.medico_id
      AND fecha = NEW.fecha
      AND estado NOT IN ('cancelada', 'no_asistio')
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID)
      AND (
        (NEW.hora_inicio >= hora_inicio AND NEW.hora_inicio < hora_fin)
        OR (NEW.hora_fin > hora_inicio AND NEW.hora_fin <= hora_fin)
        OR (NEW.hora_inicio <= hora_inicio AND NEW.hora_fin >= hora_fin)
      );

    IF conflicto_count > 0 THEN
      RAISE EXCEPTION 'Conflicto de horario: ya existe una cita programada en este horario para el médico seleccionado.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validar_conflicto_horario
  BEFORE INSERT OR UPDATE ON clinic.citas
  FOR EACH ROW
  EXECUTE FUNCTION clinic.validar_conflicto_horario();
```

## Server Actions

### actions/citas.ts

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

// Schema de validación
const citaSchema = z.object({
  paciente_id: z.string().uuid(),
  medico_id: z.string().uuid(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hora_inicio: z.string().regex(/^\d{2}:\d{2}$/),
  tipo_cita: z.enum([
    'valoracion', 'control', 'escleroterapia',
    'scaneo', 'duplex', 'ecor'
  ]),
  pierna: z.enum(['izquierda', 'derecha', 'ambas']).optional(),
  motivo: z.string().optional(),
  notas_internas: z.string().optional(),
})

// Duraciones por tipo de cita (en minutos)
const DURACIONES: Record<string, number> = {
  valoracion: 60,
  control: 30,
  escleroterapia: 45,
  scaneo: 30,
  duplex: 45,
  ecor: 180,
}

export async function crearCita(formData: FormData) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autorizado')

  const data = citaSchema.parse({
    paciente_id: formData.get('paciente_id'),
    medico_id: formData.get('medico_id'),
    fecha: formData.get('fecha'),
    hora_inicio: formData.get('hora_inicio'),
    tipo_cita: formData.get('tipo_cita'),
    pierna: formData.get('pierna') || undefined,
    motivo: formData.get('motivo') || undefined,
    notas_internas: formData.get('notas_internas') || undefined,
  })

  // Calcular hora de fin basado en duración del tipo de cita
  const duracion = DURACIONES[data.tipo_cita]
  const [horas, minutos] = data.hora_inicio.split(':').map(Number)
  const horaFin = new Date(2000, 0, 1, horas, minutos + duracion)
  const hora_fin = `${horaFin.getHours().toString().padStart(2, '0')}:${horaFin.getMinutes().toString().padStart(2, '0')}`

  const { data: cita, error } = await supabase
    .from('citas')
    .insert({
      ...data,
      hora_fin,
      created_by: user.id,
      updated_by: user.id,
    })
    .select()
    .single()

  if (error) {
    // Manejar errores de restricciones
    if (error.message.includes('ECOR')) {
      return { error: 'Ya hay 2 procedimientos ECOR programados para este día.' }
    }
    if (error.message.includes('escleroterapia')) {
      return { error: 'Máximo 3 sesiones de escleroterapia por pierna por día.' }
    }
    if (error.message.includes('Conflicto')) {
      return { error: 'El médico ya tiene una cita en este horario.' }
    }
    throw error
  }

  revalidatePath('/agenda')
  return { data: cita }
}

export async function obtenerAgendaDia(fecha: string, medicoId?: string) {
  const supabase = await createClient()

  let query = supabase
    .from('citas')
    .select(`
      *,
      paciente:pacientes(id, nombre_completo, telefono, foto_url),
      medico:usuarios(id, nombre_completo)
    `)
    .eq('fecha', fecha)
    .not('estado', 'in', '(cancelada)')
    .order('hora_inicio')

  if (medicoId) {
    query = query.eq('medico_id', medicoId)
  }

  const { data, error } = await query

  if (error) throw error
  return data
}

export async function cambiarEstadoCita(
  citaId: string,
  nuevoEstado: string,
  notas?: string
) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autorizado')

  const { data, error } = await supabase
    .from('citas')
    .update({
      estado: nuevoEstado,
      notas_internas: notas,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', citaId)
    .select()
    .single()

  if (error) throw error

  revalidatePath('/agenda')
  return data
}

export async function obtenerDisponibilidad(
  fecha: string,
  medicoId: string,
  tipoCita: string
) {
  const supabase = await createClient()

  // Obtener citas existentes del día
  const { data: citasDelDia } = await supabase
    .from('citas')
    .select('hora_inicio, hora_fin, tipo_cita')
    .eq('fecha', fecha)
    .eq('medico_id', medicoId)
    .not('estado', 'in', '(cancelada,no_asistio)')

  // Obtener bloqueos del día
  const { data: bloqueosDelDia } = await supabase
    .from('bloqueos_agenda')
    .select('hora_inicio, hora_fin')
    .eq('medico_id', medicoId)
    .lte('fecha_inicio', fecha)
    .gte('fecha_fin', fecha)

  // Generar slots disponibles (8:00 AM - 6:00 PM)
  const slots: string[] = []
  const duracion = DURACIONES[tipoCita]

  for (let hora = 8; hora < 18; hora++) {
    for (let minuto = 0; minuto < 60; minuto += 30) {
      const horaStr = `${hora.toString().padStart(2, '0')}:${minuto.toString().padStart(2, '0')}`
      const finMinutos = hora * 60 + minuto + duracion
      const horaFinStr = `${Math.floor(finMinutos / 60).toString().padStart(2, '0')}:${(finMinutos % 60).toString().padStart(2, '0')}`

      // Verificar si el slot está disponible
      const ocupado = citasDelDia?.some(cita => {
        const citaInicio = cita.hora_inicio
        const citaFin = cita.hora_fin
        return (horaStr >= citaInicio && horaStr < citaFin) ||
               (horaFinStr > citaInicio && horaFinStr <= citaFin)
      })

      const bloqueado = bloqueosDelDia?.some(bloqueo => {
        if (!bloqueo.hora_inicio) return true // Bloqueo de día completo
        return (horaStr >= bloqueo.hora_inicio && horaStr < bloqueo.hora_fin!)
      })

      if (!ocupado && !bloqueado && finMinutos <= 18 * 60) {
        slots.push(horaStr)
      }
    }
  }

  // Si es ECOR, verificar límite diario
  if (tipoCita === 'ecor') {
    const ecorCount = citasDelDia?.filter(c => c.tipo_cita === 'ecor').length || 0
    if (ecorCount >= 2) {
      return { slots: [], mensaje: 'Ya hay 2 ECOR programados para este día' }
    }
  }

  return { slots }
}
```

## Componentes UI

### Vista de Agenda Diaria

```tsx
// components/agenda/agenda-diaria.tsx
'use client'

import { useState } from 'react'
import { format, addDays, subDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { obtenerAgendaDia } from '@/actions/citas'

const COLORES_TIPO = {
  valoracion: 'bg-blue-100 text-blue-800 border-blue-300',
  control: 'bg-green-100 text-green-800 border-green-300',
  escleroterapia: 'bg-purple-100 text-purple-800 border-purple-300',
  scaneo: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  duplex: 'bg-orange-100 text-orange-800 border-orange-300',
  ecor: 'bg-red-100 text-red-800 border-red-300',
}

const COLORES_ESTADO = {
  programada: 'bg-gray-100',
  confirmada: 'bg-blue-50',
  en_sala: 'bg-yellow-50',
  en_atencion: 'bg-green-50',
  completada: 'bg-green-100',
  no_asistio: 'bg-red-50',
}

export function AgendaDiaria() {
  const [fecha, setFecha] = useState(new Date())
  const fechaStr = format(fecha, 'yyyy-MM-dd')

  const { data: citas, isLoading } = useQuery({
    queryKey: ['agenda', fechaStr],
    queryFn: () => obtenerAgendaDia(fechaStr),
  })

  // Generar línea de tiempo (8:00 - 18:00)
  const horas = Array.from({ length: 11 }, (_, i) => i + 8)

  return (
    <div className="space-y-4">
      {/* Header con navegación */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setFecha(subDays(fecha, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-xl font-semibold min-w-[200px] text-center">
            {format(fecha, "EEEE d 'de' MMMM", { locale: es })}
          </h2>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setFecha(addDays(fecha, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Nueva Cita
        </Button>
      </div>

      {/* Contadores de restricciones */}
      <div className="flex gap-4">
        <Card className="flex-1">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">ECOR Hoy</span>
              <Badge variant={
                (citas?.filter(c => c.tipo_cita === 'ecor').length || 0) >= 2
                  ? 'destructive'
                  : 'secondary'
              }>
                {citas?.filter(c => c.tipo_cita === 'ecor').length || 0} / 2
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Timeline de citas */}
      <Card>
        <CardContent className="p-0">
          <div className="relative">
            {/* Líneas de hora */}
            {horas.map(hora => (
              <div
                key={hora}
                className="flex border-t first:border-t-0"
                style={{ minHeight: '80px' }}
              >
                <div className="w-20 p-2 text-sm text-muted-foreground border-r bg-gray-50">
                  {hora}:00
                </div>
                <div className="flex-1 relative">
                  {/* Citas en esta hora */}
                  {citas
                    ?.filter(cita => {
                      const citaHora = parseInt(cita.hora_inicio.split(':')[0])
                      return citaHora === hora
                    })
                    .map(cita => (
                      <CitaCard key={cita.id} cita={cita} />
                    ))
                  }
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function CitaCard({ cita }: { cita: any }) {
  return (
    <div
      className={`
        absolute left-2 right-2 p-2 rounded-lg border-l-4 cursor-pointer
        hover:shadow-md transition-shadow
        ${COLORES_TIPO[cita.tipo_cita as keyof typeof COLORES_TIPO]}
        ${COLORES_ESTADO[cita.estado as keyof typeof COLORES_ESTADO]}
      `}
      style={{
        top: `${parseInt(cita.hora_inicio.split(':')[1]) * (80/60)}px`,
      }}
    >
      <div className="flex items-start gap-2">
        <Avatar className="h-8 w-8">
          <AvatarImage src={cita.paciente?.foto_url} />
          <AvatarFallback>
            {cita.paciente?.nombre_completo?.charAt(0)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">
            {cita.paciente?.nombre_completo}
          </p>
          <p className="text-xs text-muted-foreground">
            {cita.hora_inicio} - {cita.hora_fin}
          </p>
          <Badge variant="outline" className="mt-1 text-xs">
            {cita.tipo_cita}
            {cita.pierna && ` (${cita.pierna})`}
          </Badge>
        </div>
      </div>
    </div>
  )
}
```

### Selector de Horario Disponible

```tsx
// components/agenda/selector-horario.tsx
'use client'

import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { obtenerDisponibilidad } from '@/actions/citas'
import { Clock } from 'lucide-react'

interface Props {
  fecha: string
  medicoId: string
  tipoCita: string
  onSelect: (hora: string) => void
  selectedHora?: string
}

export function SelectorHorario({
  fecha,
  medicoId,
  tipoCita,
  onSelect,
  selectedHora
}: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['disponibilidad', fecha, medicoId, tipoCita],
    queryFn: () => obtenerDisponibilidad(fecha, medicoId, tipoCita),
    enabled: Boolean(fecha && medicoId && tipoCita),
  })

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Cargando horarios...</div>
  }

  if (data?.mensaje) {
    return (
      <div className="p-4 bg-yellow-50 rounded-lg text-yellow-800 text-sm">
        {data.mensaje}
      </div>
    )
  }

  if (!data?.slots?.length) {
    return (
      <div className="p-4 bg-gray-50 rounded-lg text-muted-foreground text-sm">
        No hay horarios disponibles para esta fecha
      </div>
    )
  }

  // Agrupar por período (mañana/tarde)
  const manana = data.slots.filter(s => parseInt(s.split(':')[0]) < 12)
  const tarde = data.slots.filter(s => parseInt(s.split(':')[0]) >= 12)

  return (
    <div className="space-y-4">
      {manana.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
            <Clock className="h-4 w-4" /> Mañana
          </h4>
          <div className="flex flex-wrap gap-2">
            {manana.map(hora => (
              <Button
                key={hora}
                variant={selectedHora === hora ? 'default' : 'outline'}
                size="sm"
                onClick={() => onSelect(hora)}
              >
                {hora}
              </Button>
            ))}
          </div>
        </div>
      )}

      {tarde.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
            <Clock className="h-4 w-4" /> Tarde
          </h4>
          <div className="flex flex-wrap gap-2">
            {tarde.map(hora => (
              <Button
                key={hora}
                variant={selectedHora === hora ? 'default' : 'outline'}
                size="sm"
                onClick={() => onSelect(hora)}
              >
                {hora}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

### Flujo de Estados de Cita

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLUJO DE ESTADOS                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌──────────┐    Confirmación    ┌───────────┐                │
│   │PROGRAMADA│ ─────────────────▶ │ CONFIRMADA│                │
│   └──────────┘                    └───────────┘                │
│        │                               │                        │
│        │ No asiste                     │ Llega                  │
│        ▼                               ▼                        │
│   ┌──────────┐                    ┌───────────┐                │
│   │NO_ASISTIO│                    │  EN_SALA  │                │
│   └──────────┘                    └───────────┘                │
│                                        │                        │
│                                        │ Médico atiende         │
│                                        ▼                        │
│                                   ┌───────────┐                │
│                                   │EN_ATENCION│                │
│                                   └───────────┘                │
│                                        │                        │
│                                        │ Termina consulta       │
│                                        ▼                        │
│                                   ┌───────────┐                │
│                                   │COMPLETADA │                │
│                                   └───────────┘                │
│                                                                 │
│   En cualquier momento (excepto COMPLETADA):                   │
│   ─────────────▶ CANCELADA                                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Prompt para v0.dev

```
Crear un componente de agenda médica diaria para tablet con las siguientes características:

Layout:
- Vista de timeline vertical de 8:00 AM a 6:00 PM
- Navegación entre días con flechas
- Contador de ECOR del día (máximo 2)

Cada cita muestra:
- Avatar y nombre del paciente
- Hora inicio - fin
- Tipo de cita con color distintivo
- Estado actual con badge
- Para escleroterapia: indicar pierna (izquierda/derecha/ambas)

Colores por tipo:
- Valoración: azul
- Control: verde
- Escleroterapia: púrpura
- Scaneo: amarillo
- Duplex: naranja
- ECOR: rojo

Estados de cita con indicador visual:
- Programada (gris)
- Confirmada (azul claro)
- En sala (amarillo)
- En atención (verde claro)
- Completada (verde)
- No asistió (rojo claro)

Acciones:
- Tap en cita: abrir modal con opciones de cambio de estado
- Botón + para nueva cita
- Drag & drop para reprogramar (stretch goal)

Stack: React, TypeScript, shadcn/ui, Tailwind CSS
```

## Integración con Otros Módulos

### Con Pagos
- Al marcar cita como "completada", mostrar modal de pago
- Validar que el pago esté registrado antes de liberar al paciente

### Con Historias Clínicas
- Al iniciar atención (estado "en_atencion"), abrir automáticamente la historia clínica
- Registrar automáticamente la fecha de consulta en la historia

### Con Medias (Varix)
- Al completar valoración, ofrecer crear orden de medias
- Mostrar alerta si el paciente tiene orden de medias pendiente

---

## Próximo: [05_CAJA.md](./05_CAJA.md)

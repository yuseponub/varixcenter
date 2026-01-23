# Phase 3: Appointments - Research

**Researched:** 2026-01-23
**Domain:** Calendar UI, appointment state machine, time-based constraints
**Confidence:** HIGH

## Summary

This research covers implementing a calendar-based appointment system using FullCalendar with React 19 and Next.js 15, integrated with Supabase PostgreSQL. The phase requires day/week views, doctor filtering, drag-and-drop functionality for tablets, and a robust state machine for appointment transitions.

The standard approach is FullCalendar v6 (locked decision from CONTEXT.md) with the `@fullcalendar/interaction` plugin for drag-and-drop. PostgreSQL exclusion constraints using `btree_gist` prevent double-booking at the database level. The state machine should be implemented with simple TypeScript discriminated unions rather than a heavy library like XState, given the straightforward linear flow with flexible reversions.

Key findings: FullCalendar v6 uses Preact internally and works with React 19. Next.js App Router requires `'use client'` directive. Touch support is built-in with configurable long-press delays for tablets. Spanish locale (`es`) is available out of the box.

**Primary recommendation:** Use FullCalendar v6 with timeGrid and interaction plugins, implement state machine as TypeScript types with a transition function, and use PostgreSQL exclusion constraints for overlap prevention.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @fullcalendar/react | ^6.1.20 | React wrapper for FullCalendar | Official React connector, Preact-based (no React conflicts) |
| @fullcalendar/core | ^6.1.20 | Core calendar engine | Required peer dependency for all plugins |
| @fullcalendar/timegrid | ^6.1.20 | Day and week time views | Provides timeGridDay and timeGridWeek views (APT-01) |
| @fullcalendar/interaction | ^6.1.20 | Drag-drop, click, select | Enables editable appointments (user requirement) |
| @fullcalendar/daygrid | ^6.1.20 | Month view (optional) | Fallback view, may be useful later |
| btree_gist | PostgreSQL extension | GiST index for exclusion constraints | Required for overlap prevention |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @fullcalendar/core/locales/es | (bundled) | Spanish locale | Button text, month/day names in Spanish |
| zod | ^4.3.6 | Schema validation | Appointment form validation (existing pattern) |
| react-hook-form | ^7.71.1 | Form handling | Appointment create/edit forms (existing pattern) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| FullCalendar | react-big-calendar | Less feature-rich, no official drag-drop on touch |
| Simple TypeScript FSM | XState | XState overkill for this linear flow; simple types suffice |
| DB exclusion constraint | Application-level check | Race conditions, less reliable |

**Installation:**
```bash
npm install @fullcalendar/react @fullcalendar/core @fullcalendar/timegrid @fullcalendar/interaction @fullcalendar/daygrid
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/(protected)/citas/
│   ├── page.tsx              # Calendar view (APT-01)
│   ├── actions.ts            # Server actions for CRUD
│   └── nueva/
│       └── page.tsx          # New appointment form
├── components/appointments/
│   ├── appointment-calendar.tsx    # FullCalendar wrapper (client component)
│   ├── appointment-form.tsx        # Create/edit form with zod
│   ├── appointment-dialog.tsx      # Modal for quick edit
│   ├── doctor-filter.tsx           # Filter by medico (APT-02)
│   └── status-badge.tsx            # Visual status indicator
├── lib/
│   ├── validations/
│   │   └── appointment.ts    # Zod schemas for appointments
│   ├── queries/
│   │   └── appointments.ts   # Supabase queries
│   └── appointments/
│       └── state-machine.ts  # Status transitions (APT-03)
└── types/
    └── appointments.ts       # TypeScript types
```

### Pattern 1: FullCalendar Client Component
**What:** Wrap FullCalendar in a client component with 'use client' directive
**When to use:** Always - FullCalendar uses browser APIs and event handlers
**Example:**
```typescript
// Source: https://fullcalendar.io/docs/react + https://github.com/vercel/next.js/issues/45435
'use client'

import { useRef } from 'react'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import esLocale from '@fullcalendar/core/locales/es'
import type { EventClickArg, DateSelectArg, EventDropArg } from '@fullcalendar/core'

interface AppointmentCalendarProps {
  events: CalendarEvent[]
  onEventClick: (info: EventClickArg) => void
  onDateSelect: (info: DateSelectArg) => void
  onEventDrop: (info: EventDropArg) => void
  selectedDoctor?: string | null
}

export function AppointmentCalendar({
  events,
  onEventClick,
  onDateSelect,
  onEventDrop,
  selectedDoctor
}: AppointmentCalendarProps) {
  const calendarRef = useRef<FullCalendar>(null)

  const filteredEvents = selectedDoctor
    ? events.filter(e => e.extendedProps.doctorId === selectedDoctor)
    : events

  return (
    <FullCalendar
      ref={calendarRef}
      plugins={[timeGridPlugin, interactionPlugin]}
      initialView="timeGridWeek"
      locale={esLocale}
      headerToolbar={{
        left: 'prev,next today',
        center: 'title',
        right: 'timeGridWeek,timeGridDay'
      }}
      // Business hours (8am-6pm, Mon-Sat per assumptions)
      slotMinTime="08:00:00"
      slotMaxTime="18:00:00"
      slotDuration="00:15:00"
      hiddenDays={[0]} // Hide Sunday
      // Interaction
      editable={true}
      selectable={true}
      selectMirror={true}
      // Touch support for tablets
      longPressDelay={300}
      eventLongPressDelay={300}
      selectLongPressDelay={300}
      // Prevent overlaps
      eventOverlap={false}
      // Events
      events={filteredEvents}
      eventClick={onEventClick}
      select={onDateSelect}
      eventDrop={onEventDrop}
      // Styling
      height="auto"
      nowIndicator={true}
    />
  )
}
```

### Pattern 2: Appointment State Machine with TypeScript
**What:** Type-safe state transitions using discriminated unions
**When to use:** For APT-03 status management
**Example:**
```typescript
// Source: TypeScript handbook + domain requirements from CONTEXT.md

// Extended states from CONTEXT.md decisions
export const APPOINTMENT_STATES = [
  'programada',
  'confirmada',
  'en_sala',
  'en_atencion',
  'completada',
  'cancelada',
  'no_asistio'
] as const

export type AppointmentStatus = typeof APPOINTMENT_STATES[number]

// Allowed transitions (flexible per CONTEXT.md - reversion allowed)
const TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  programada: ['confirmada', 'cancelada', 'no_asistio'],
  confirmada: ['programada', 'en_sala', 'cancelada', 'no_asistio'],
  en_sala: ['confirmada', 'en_atencion', 'cancelada', 'no_asistio'],
  en_atencion: ['en_sala', 'completada', 'cancelada'],
  completada: ['en_atencion'], // Can revert to en_atencion
  cancelada: ['programada'], // Can reschedule
  no_asistio: ['programada']  // Can reschedule
}

export function canTransition(
  from: AppointmentStatus,
  to: AppointmentStatus
): boolean {
  return TRANSITIONS[from].includes(to)
}

export function getAvailableTransitions(
  current: AppointmentStatus
): AppointmentStatus[] {
  return TRANSITIONS[current]
}

// Status display in Spanish
export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  programada: 'Programada',
  confirmada: 'Confirmada',
  en_sala: 'En Sala de Espera',
  en_atencion: 'En Atencion',
  completada: 'Completada',
  cancelada: 'Cancelada',
  no_asistio: 'No Asistio'
}

export const STATUS_COLORS: Record<AppointmentStatus, string> = {
  programada: 'bg-blue-100 text-blue-800',
  confirmada: 'bg-green-100 text-green-800',
  en_sala: 'bg-yellow-100 text-yellow-800',
  en_atencion: 'bg-purple-100 text-purple-800',
  completada: 'bg-gray-100 text-gray-800',
  cancelada: 'bg-red-100 text-red-800',
  no_asistio: 'bg-orange-100 text-orange-800'
}
```

### Pattern 3: PostgreSQL Exclusion Constraint for No Overlaps
**What:** Database-level prevention of double-booking
**When to use:** Appointments table creation
**Example:**
```sql
-- Source: https://blog.danielclayton.co.uk/posts/overlapping-data-postgres-exclusion-constraints/

-- Enable required extension
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Appointments table with overlap prevention
CREATE TABLE public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id),
  doctor_id UUID NOT NULL REFERENCES auth.users(id),

  -- Time range
  fecha_hora_inicio TIMESTAMPTZ NOT NULL,
  fecha_hora_fin TIMESTAMPTZ NOT NULL,

  -- Status (APT-03)
  estado VARCHAR(20) NOT NULL DEFAULT 'programada'
    CHECK (estado IN ('programada', 'confirmada', 'en_sala',
                      'en_atencion', 'completada', 'cancelada', 'no_asistio')),

  -- Optional fields
  notas TEXT,
  servicio_id UUID, -- Future: link to services table

  -- Audit
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- CRITICAL: Prevent overlapping appointments for same doctor
  -- Only applies to non-cancelled/no-show appointments
  CONSTRAINT no_overlapping_appointments
    EXCLUDE USING gist (
      doctor_id WITH =,
      tstzrange(fecha_hora_inicio, fecha_hora_fin, '[)') WITH &&
    ) WHERE (estado NOT IN ('cancelada', 'no_asistio'))
);

-- Check constraint: end time must be after start time
ALTER TABLE public.appointments
  ADD CONSTRAINT valid_time_range
  CHECK (fecha_hora_fin > fecha_hora_inicio);
```

### Anti-Patterns to Avoid
- **Direct state mutations:** Never set status directly without checking canTransition()
- **Client-side overlap validation only:** Always rely on database constraint as source of truth
- **Re-initializing Draggable in useEffect:** Causes duplicate events; use FullCalendar's built-in editable
- **Missing 'use client' directive:** FullCalendar fails silently in Server Components

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Calendar UI | Custom grid layout | FullCalendar | Handles timezones, scrolling, mobile, accessibility |
| Drag-drop on touch | Touch event handlers | @fullcalendar/interaction | Long-press detection, scroll-vs-drag, edge cases |
| Overlap detection | Application-level check | PostgreSQL exclusion constraint | Race conditions are impossible to prevent client-side |
| Date localization | Manual month/day names | FullCalendar locale + Intl | Built-in Spanish support, handles all edge cases |
| Time slot snapping | Manual time rounding | FullCalendar snapDuration | Already solved with configurable precision |

**Key insight:** Calendar implementations have years of edge cases (DST, timezone changes, scrolling performance, mobile gestures). FullCalendar has solved these; don't reinvent them.

## Common Pitfalls

### Pitfall 1: Server Component Error with FullCalendar
**What goes wrong:** "Class extends value undefined is not a constructor or null"
**Why it happens:** FullCalendar's React wrapper uses class components, incompatible with RSC
**How to avoid:** Always add `'use client'` at top of component file
**Warning signs:** Hydration errors, blank calendar, console errors about class components

### Pitfall 2: CSS Not Loading or Flickering
**What goes wrong:** Calendar renders unstyled or styles flash on navigation
**Why it happens:** FullCalendar v6 bundles CSS internally; Next.js may not load it correctly
**How to avoid:** Import CSS in a client component layout or use Next.js App Router loading state
**Warning signs:** Unstyled calendar on first load, styles appearing after interaction

### Pitfall 3: Calendar Width Rendering Issues
**What goes wrong:** Calendar renders narrow instead of full width
**Why it happens:** Container not sized when FullCalendar initializes
**How to avoid:** Use `height="auto"` and ensure parent has defined width; call `calendar.updateSize()` if needed
**Warning signs:** Calendar is very narrow on initial load, expands on window resize

### Pitfall 4: Duplicate Events on Drag from External
**What goes wrong:** Dragging external event creates multiple copies
**Why it happens:** Draggable initialized multiple times (React StrictMode, useEffect re-runs)
**How to avoid:** Use FullCalendar's built-in event system, not external Draggable; or use cleanup in useEffect
**Warning signs:** Events multiply when dragged, especially in development mode

### Pitfall 5: Touch Drag Feels Unresponsive
**What goes wrong:** Users think drag isn't working on tablets
**Why it happens:** Default longPressDelay is 1000ms, feels like nothing happens
**How to avoid:** Set `longPressDelay={300}` for snappier response on tablets
**Warning signs:** Users tap repeatedly thinking calendar is broken

### Pitfall 6: Overlapping Appointments Race Condition
**What goes wrong:** Two users book same slot simultaneously, both succeed
**Why it happens:** Application-level check has a race window between check and insert
**How to avoid:** Use PostgreSQL exclusion constraint (atomic, no race condition possible)
**Warning signs:** Duplicate appointments for same doctor/time appearing in production

### Pitfall 7: State Transition Without Validation
**What goes wrong:** Appointment jumps from 'programada' directly to 'completada'
**Why it happens:** Frontend allows arbitrary status updates, backend doesn't validate
**How to avoid:** Use canTransition() check in server action before update
**Warning signs:** Invalid state sequences in audit log, confused staff

## Code Examples

Verified patterns from official sources:

### Server Action for Creating Appointment
```typescript
// Source: Prior decisions (02-04) + FullCalendar event format
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { appointmentSchema } from '@/lib/validations/appointment'

type ActionState = {
  success: boolean
  message: string
  errors?: Record<string, string[]>
}

export async function createAppointment(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient()

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, message: 'No autorizado' }
  }

  // Validate input
  const rawData = {
    patient_id: formData.get('patient_id'),
    doctor_id: formData.get('doctor_id'),
    fecha_hora_inicio: formData.get('fecha_hora_inicio'),
    fecha_hora_fin: formData.get('fecha_hora_fin'),
    notas: formData.get('notas') || null
  }

  const result = appointmentSchema.safeParse(rawData)
  if (!result.success) {
    return {
      success: false,
      message: 'Datos invalidos',
      errors: result.error.flatten().fieldErrors
    }
  }

  // Insert - exclusion constraint handles overlap prevention
  const { error } = await supabase
    .from('appointments')
    .insert({
      ...result.data,
      estado: 'programada',
      created_by: user.id
    })

  if (error) {
    // Check for exclusion constraint violation
    if (error.code === '23P01') {
      return {
        success: false,
        message: 'El medico ya tiene una cita en ese horario'
      }
    }
    console.error('Create appointment error:', error)
    return { success: false, message: 'Error al crear la cita' }
  }

  revalidatePath('/citas')
  return { success: true, message: 'Cita creada exitosamente' }
}
```

### Zod Schema for Appointments
```typescript
// Source: Existing pattern from patient.ts + domain requirements
import { z } from 'zod'
import { APPOINTMENT_STATES } from './state-machine'

export const appointmentSchema = z.object({
  patient_id: z
    .string()
    .uuid('ID de paciente invalido'),

  doctor_id: z
    .string()
    .uuid('ID de medico invalido'),

  fecha_hora_inicio: z
    .string()
    .datetime('Formato de fecha/hora invalido'),

  fecha_hora_fin: z
    .string()
    .datetime('Formato de fecha/hora invalido'),

  notas: z
    .string()
    .max(500, 'Las notas son muy largas')
    .nullable()
    .optional()
}).refine(
  data => new Date(data.fecha_hora_fin) > new Date(data.fecha_hora_inicio),
  { message: 'La hora de fin debe ser posterior a la hora de inicio', path: ['fecha_hora_fin'] }
)

export const appointmentStatusSchema = z.object({
  estado: z.enum(APPOINTMENT_STATES, {
    errorMap: () => ({ message: 'Estado de cita invalido' })
  })
})

export type AppointmentFormData = z.infer<typeof appointmentSchema>
```

### Query: Get Appointments for Calendar View
```typescript
// Source: Existing pattern from patients.ts + FullCalendar event format
import { createClient } from '@/lib/supabase/server'

export interface CalendarEvent {
  id: string
  title: string
  start: string
  end: string
  backgroundColor: string
  borderColor: string
  extendedProps: {
    patientId: string
    patientName: string
    doctorId: string
    doctorName: string
    status: string
    notas: string | null
  }
}

const STATUS_COLORS: Record<string, string> = {
  programada: '#3B82F6',    // blue
  confirmada: '#10B981',    // green
  en_sala: '#F59E0B',       // yellow
  en_atencion: '#8B5CF6',   // purple
  completada: '#6B7280',    // gray
  cancelada: '#EF4444',     // red
  no_asistio: '#F97316'     // orange
}

export async function getAppointmentsForCalendar(
  startDate: string,
  endDate: string,
  doctorId?: string
): Promise<CalendarEvent[]> {
  const supabase = await createClient()

  let query = supabase
    .from('appointments')
    .select(`
      id,
      fecha_hora_inicio,
      fecha_hora_fin,
      estado,
      notas,
      patient:patients!patient_id(id, nombre, apellido),
      doctor:user_roles!doctor_id(user_id, users:auth.users(email))
    `)
    .gte('fecha_hora_inicio', startDate)
    .lte('fecha_hora_inicio', endDate)
    .not('estado', 'in', '(cancelada,no_asistio)')

  if (doctorId) {
    query = query.eq('doctor_id', doctorId)
  }

  const { data, error } = await query

  if (error) throw error

  return (data || []).map(apt => ({
    id: apt.id,
    title: `${apt.patient.nombre} ${apt.patient.apellido}`,
    start: apt.fecha_hora_inicio,
    end: apt.fecha_hora_fin,
    backgroundColor: STATUS_COLORS[apt.estado] || '#6B7280',
    borderColor: STATUS_COLORS[apt.estado] || '#6B7280',
    extendedProps: {
      patientId: apt.patient.id,
      patientName: `${apt.patient.nombre} ${apt.patient.apellido}`,
      doctorId: apt.doctor_id,
      doctorName: apt.doctor?.users?.email || 'Desconocido',
      status: apt.estado,
      notas: apt.notas
    }
  }))
}
```

### Doctor Filter Component
```typescript
// Source: APT-02 requirements + shadcn/ui Select (existing in project)
'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface Doctor {
  id: string
  nombre: string
}

interface DoctorFilterProps {
  doctors: Doctor[]
  value: string | null
  onChange: (doctorId: string | null) => void
}

export function DoctorFilter({ doctors, value, onChange }: DoctorFilterProps) {
  return (
    <Select
      value={value || 'all'}
      onValueChange={(v) => onChange(v === 'all' ? null : v)}
    >
      <SelectTrigger className="w-[200px]">
        <SelectValue placeholder="Filtrar por medico" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Todos los medicos</SelectItem>
        {doctors.map((doctor) => (
          <SelectItem key={doctor.id} value={doctor.id}>
            {doctor.nombre}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| FullCalendar v5 React renderer | v6 uses Preact internally | v6 (2022) | Fixes StrictMode warnings, import order issues |
| Application overlap check | PostgreSQL exclusion constraint | PostgreSQL 9.0+ | Eliminates race conditions entirely |
| Complex XState for linear flows | Simple TypeScript transitions | N/A | Less code, easier to understand for simple flows |
| css-loader config in Next.js | Bundled CSS in v6 | v6 (2022) | No manual CSS imports needed |

**Deprecated/outdated:**
- `@fullcalendar/common` package: Merged into core in v6
- Manual CSS imports: v6 bundles styles automatically
- `next-transpile-modules`: No longer needed for FullCalendar v6 with Next.js 13+

## Open Questions

Things that couldn't be fully resolved:

1. **Doctor list source**
   - What we know: Doctors are users with role='medico' in user_roles table
   - What's unclear: Should we create a view/function to get doctor list with names?
   - Recommendation: Create `get_doctors()` function or use join with user metadata

2. **Service types/durations**
   - What we know: CONTEXT.md mentions "duracion configurable por servicio"
   - What's unclear: Is there a services table planned? What determines duration?
   - Recommendation: Start with default 30-minute slots, plan for services table in future

3. **React 19 specific behavior**
   - What we know: FullCalendar v6.1.20 works with React 18, uses Preact internally
   - What's unclear: No explicit React 19 compatibility statement found
   - Recommendation: Test early; the Preact approach should minimize compatibility issues

4. **Realtime updates**
   - What we know: Supabase supports realtime subscriptions
   - What's unclear: Is realtime needed for this phase? Multiple users editing simultaneously?
   - Recommendation: Defer to future enhancement; start with reload on action

## Sources

### Primary (HIGH confidence)
- [FullCalendar React Component Docs](https://fullcalendar.io/docs/react) - Setup, TypeScript, callbacks
- [FullCalendar TimeGrid View](https://fullcalendar.io/docs/timegrid-view) - Day/week views, slot configuration
- [FullCalendar Event Dragging](https://fullcalendar.io/docs/event-dragging-resizing) - Interaction plugin, touch support
- [FullCalendar Locale](https://fullcalendar.io/docs/locale) - Spanish locale configuration
- [FullCalendar Touch Support](https://fullcalendar.io/docs/touch) - longPressDelay options
- [PostgreSQL Exclusion Constraints](https://blog.danielclayton.co.uk/posts/overlapping-data-postgres-exclusion-constraints/) - btree_gist, tstzrange

### Secondary (MEDIUM confidence)
- [Next.js FullCalendar App Router Issue #45435](https://github.com/vercel/next.js/issues/45435) - 'use client' solution (resolved)
- [FullCalendar GitHub Releases](https://github.com/fullcalendar/fullcalendar-react/releases) - v6.1.20 latest
- [FullCalendar v6 Upgrade Guide](https://fullcalendar.io/docs/upgrading-from-v5) - Architecture changes

### Tertiary (LOW confidence)
- WebSearch results on XState vs simple FSM - Opinion-based, but consensus supports simple approach for linear flows
- WebSearch on React 19 + FullCalendar - No specific issues found (absence of evidence)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Official documentation confirms all packages and their roles
- Architecture: HIGH - Patterns verified against official docs and existing project patterns
- Pitfalls: HIGH - Multiple sources confirm these issues and solutions
- State machine: MEDIUM - Design based on CONTEXT.md requirements, TypeScript best practices

**Research date:** 2026-01-23
**Valid until:** 2026-02-23 (30 days - stable libraries)

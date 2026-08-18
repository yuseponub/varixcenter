'use client'

/**
 * Cuadrícula de citas apiladas en FILAS (vista "Calendario" propia)
 *
 * Igual que un calendario clásico: el eje de HORAS va en la columna izquierda
 * (07:00, 08:00, …) y a la derecha cada día. Pero cuando hay varias citas en
 * la misma hora, se apilan UNA DEBAJO DE OTRA (filas) dentro de esa banda de
 * hora — nunca en "bloques" lado a lado como hace el timeGrid de FullCalendar.
 *
 * Zona horaria: Colombia es UTC−5 fijo. El cursor se guarda como mediodía UTC
 * de la fecha civil y se lee con getUTC* (mediodía UTC = 07:00 Bogotá, mismo
 * día civil), así la navegación no se corre por zona horaria.
 */

import { useEffect, useMemo, useState, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { CalendarEvent } from '@/types/appointments'
import { STATUS_LABELS } from '@/lib/appointments/state-machine'

interface StackedAgendaProps {
  events: CalendarEvent[]
  onEventClick: (event: CalendarEvent) => void
  /** Notifica el rango visible (ISO UTC) para que el padre recargue citas. */
  onRangeChange: (start: string, end: string) => void
  initialDate?: Date | string
  /** Fecha a la que saltar cuando el buscador elige una cita. El contador
   *  `seq` permite repetir el salto a la misma fecha. */
  focus?: { date: string; seq: number } | null
}

const TZ = 'America/Bogota'

const dayKeyFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const hourFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  hour: '2-digit',
  hour12: false,
})
const timeFmt = new Intl.DateTimeFormat('es-CO', {
  timeZone: TZ,
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})
const dayTitleFmt = new Intl.DateTimeFormat('es-CO', {
  timeZone: TZ,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})
const dayShortFmt = new Intl.DateTimeFormat('es-CO', {
  timeZone: TZ,
  weekday: 'short',
  day: 'numeric',
})
const rangeTitleFmt = new Intl.DateTimeFormat('es-CO', {
  timeZone: TZ,
  day: 'numeric',
  month: 'short',
})

const OUTLOOK_COLOR = 'oklch(0.45 0.12 210)'

/** Tintes por estado. Hora = confirmación; Nombre = asistencia. */
const TINT = {
  confirmada: {
    bg: 'color-mix(in oklch, oklch(0.62 0.15 165) 22%, transparent)',
    color: 'oklch(0.36 0.11 160)',
  },
  cancelada: {
    bg: 'color-mix(in oklch, oklch(0.6 0.18 27) 22%, transparent)',
    color: 'oklch(0.48 0.19 27)',
  },
  completada: {
    bg: 'color-mix(in oklch, oklch(0.62 0.15 165) 24%, transparent)',
    color: 'oklch(0.34 0.11 160)',
  },
  no_asistio: {
    bg: 'color-mix(in oklch, oklch(0.68 0.15 55) 30%, transparent)',
    color: 'oklch(0.46 0.14 50)',
  },
} as const

const DEFAULT_MIN_HOUR = 8
const DEFAULT_MAX_HOUR = 19

/** Fecha civil (Bogotá) de `date` como mediodía UTC, para navegar sin tz. */
function toCivilNoon(date: Date): Date {
  const parts = dayKeyFmt.format(date).split('-').map(Number)
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12, 0, 0))
}

function addDays(civilNoon: Date, days: number): Date {
  return new Date(civilNoon.getTime() + days * 86_400_000)
}

/** Clave 'YYYY-MM-DD' de un día-civil almacenado como mediodía UTC. */
function civilKey(civilNoon: Date): string {
  const y = civilNoon.getUTCFullYear()
  const m = String(civilNoon.getUTCMonth() + 1).padStart(2, '0')
  const d = String(civilNoon.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 00:00 Bogotá de un día civil = 05:00 UTC. */
function civilToBogotaMidnightUTC(civilNoon: Date): Date {
  return new Date(
    Date.UTC(
      civilNoon.getUTCFullYear(),
      civilNoon.getUTCMonth(),
      civilNoon.getUTCDate(),
      5,
      0,
      0
    )
  )
}

/** Hora (0-23) del evento en Bogotá. */
function bogotaHour(iso: string | Date): number {
  return Number(hourFmt.format(new Date(iso)))
}

/** Tarjeta individual de cita (misma para día y semana). */
function CitaCard({
  ev,
  compact,
  onClick,
}: {
  ev: CalendarEvent
  compact: boolean
  onClick: () => void
}) {
  const isOutlook = ev.extendedProps.source === 'outlook'
  // Cita de Outlook sin paciente asignado → toda la barra amarilla.
  const unassigned = isOutlook && !ev.extendedProps.patientId
  const accent = unassigned
    ? 'oklch(0.72 0.15 85)'
    : isOutlook
      ? OUTLOOK_COLOR
      : ev.borderColor || 'var(--primary)'
  const name =
    ev.extendedProps.matchedPatientName ||
    ev.extendedProps.patientName ||
    ev.title
  const estado = ev.extendedProps.estado
  // Hora ← confirmación; Nombre ← asistencia. Solo para citas de Varix.
  const timeTint = isOutlook
    ? null
    : estado === 'confirmada'
      ? TINT.confirmada
      : estado === 'cancelada'
        ? TINT.cancelada
        : null
  const nameTint = isOutlook
    ? null
    : estado === 'completada'
      ? TINT.completada
      : estado === 'no_asistio'
        ? TINT.no_asistio
        : null
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${timeFmt.format(new Date(ev.start))} · ${name}`}
      className="flex w-full items-center gap-2 rounded-md border border-border bg-card px-2 py-1 text-left shadow-sm hover:bg-accent/60"
      style={
        unassigned
          ? {
              backgroundColor: 'oklch(0.95 0.09 95)',
              borderColor: accent,
              borderLeft: `4px solid ${accent}`,
              color: 'oklch(0.4 0.1 65)',
            }
          : { borderLeft: `4px solid ${accent}` }
      }
    >
      <span
        className={`shrink-0 rounded px-1 text-[11px] font-semibold tabular-nums ${
          timeTint ? '' : 'text-muted-foreground'
        }`}
        style={
          timeTint ? { backgroundColor: timeTint.bg, color: timeTint.color } : undefined
        }
      >
        {timeFmt.format(new Date(ev.start))}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className="block truncate rounded px-1 text-xs font-medium"
          style={
            nameTint ? { backgroundColor: nameTint.bg, color: nameTint.color } : undefined
          }
        >
          {name}
        </span>
        {/* Procedimientos agendados y telefono, debajo del nombre */}
        {(ev.extendedProps.servicios?.length || ev.extendedProps.patientCelular) && (
          <span className="block truncate px-1 text-[10px] leading-tight text-muted-foreground">
            {[
              ...(ev.extendedProps.servicios ?? []),
              ev.extendedProps.patientCelular,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        )}
      </span>
      {!compact &&
        (isOutlook ? (
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{
              backgroundColor: `color-mix(in oklch, ${OUTLOOK_COLOR} 15%, transparent)`,
              color: OUTLOOK_COLOR,
            }}
          >
            Outlook
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
            {STATUS_LABELS[ev.extendedProps.estado] ?? ev.extendedProps.estado}
          </span>
        ))}
    </button>
  )
}

export function StackedAgenda({
  events,
  onEventClick,
  onRangeChange,
  initialDate,
  focus = null,
}: StackedAgendaProps) {
  const [mode, setMode] = useState<'day' | 'week'>('week')
  const [cursor, setCursor] = useState<Date>(() =>
    toCivilNoon(initialDate ? new Date(initialDate) : new Date())
  )

  // Salto desde el buscador: mueve el cursor al día de la cita elegida. Se
  // ajusta durante el render (no en un efecto) para no encadenar un segundo
  // render con la semana equivocada ya pintada.
  const [appliedFocusSeq, setAppliedFocusSeq] = useState(0)
  if (focus && focus.seq !== appliedFocusSeq) {
    const target = new Date(focus.date)
    setAppliedFocusSeq(focus.seq)
    if (!Number.isNaN(target.getTime())) setCursor(toCivilNoon(target))
  }

  // Días visibles (mediodía-UTC cada uno). Semana = Lun..Sáb (sin domingo).
  const visibleDays = useMemo(() => {
    if (mode === 'day') return [cursor]
    const dow = cursor.getUTCDay() // 0 dom .. 6 sáb
    const offsetToMonday = dow === 0 ? 6 : dow - 1
    const monday = addDays(cursor, -offsetToMonday)
    return Array.from({ length: 6 }, (_, i) => addDays(monday, i)) // Lun..Sáb
  }, [cursor, mode])

  const dayKeys = useMemo(() => visibleDays.map(civilKey), [visibleDays])

  // Notificar rango al padre cuando cambie.
  useEffect(() => {
    const first = visibleDays[0]
    const last = visibleDays[visibleDays.length - 1]
    const start = civilToBogotaMidnightUTC(first).toISOString()
    const end = civilToBogotaMidnightUTC(addDays(last, 1)).toISOString()
    onRangeChange(start, end)
  }, [visibleDays, onRangeChange])

  // Índice: día -> hora -> citas (ordenadas por hora exacta).
  const { grid, hours } = useMemo(() => {
    const visibleKeys = new Set(dayKeys)
    const byDayHour = new Map<string, Map<number, CalendarEvent[]>>()
    let minHour = DEFAULT_MIN_HOUR
    let maxHour = DEFAULT_MAX_HOUR

    for (const ev of events) {
      const start = new Date(ev.start)
      if (Number.isNaN(start.getTime())) continue
      const dKey = dayKeyFmt.format(start)
      if (!visibleKeys.has(dKey)) continue
      const h = bogotaHour(start)
      if (h < minHour) minHour = h
      if (h > maxHour) maxHour = h
      let hourMap = byDayHour.get(dKey)
      if (!hourMap) {
        hourMap = new Map()
        byDayHour.set(dKey, hourMap)
      }
      const list = hourMap.get(h)
      if (list) list.push(ev)
      else hourMap.set(h, [ev])
    }

    for (const hourMap of byDayHour.values()) {
      for (const list of hourMap.values()) {
        list.sort(
          (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
        )
      }
    }

    const hoursArr: number[] = []
    for (let h = minHour; h <= maxHour; h++) hoursArr.push(h)
    return { grid: byDayHour, hours: hoursArr }
  }, [events, dayKeys])

  const goToday = useCallback(() => setCursor(toCivilNoon(new Date())), [])
  const goPrev = useCallback(
    () => setCursor((c) => addDays(c, mode === 'day' ? -1 : -7)),
    [mode]
  )
  const goNext = useCallback(
    () => setCursor((c) => addDays(c, mode === 'day' ? 1 : 7)),
    [mode]
  )

  const rangeTitle =
    mode === 'day'
      ? dayTitleFmt.format(civilToBogotaMidnightUTC(cursor))
      : `${rangeTitleFmt.format(
          civilToBogotaMidnightUTC(visibleDays[0])
        )} – ${rangeTitleFmt.format(
          civilToBogotaMidnightUTC(visibleDays[visibleDays.length - 1])
        )}`

  const todayKey = civilKey(toCivilNoon(new Date()))
  const cols = mode === 'day' ? 1 : visibleDays.length
  // Grilla CSS: [columna de horas] + una columna por día visible.
  const gridCols = `56px repeat(${cols}, minmax(0, 1fr))`

  return (
    <div className="flex h-full flex-col">
      {/* Encabezado delgado y fijo */}
      <div className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border bg-card px-2 py-1.5">
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Anterior"
            onClick={goPrev}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-input hover:bg-accent"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={goNext}
            aria-label="Siguiente"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-input hover:bg-accent"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={goToday}
            className="ml-1 h-7 rounded-md border border-input px-2.5 text-xs font-medium hover:bg-accent"
          >
            Hoy
          </button>
        </div>

        <span className="truncate text-sm font-semibold capitalize">
          {rangeTitle}
        </span>

        <div className="flex items-center gap-0.5 rounded-md border border-input p-0.5">
          <button
            type="button"
            onClick={() => setMode('week')}
            className={`h-6 rounded px-2 text-xs font-medium ${
              mode === 'week'
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-accent'
            }`}
          >
            Semana
          </button>
          <button
            type="button"
            onClick={() => setMode('day')}
            className={`h-6 rounded px-2 text-xs font-medium ${
              mode === 'day'
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-accent'
            }`}
          >
            Día
          </button>
        </div>
      </div>

      {/* Cuadrícula: horas a la izquierda, citas apiladas en filas por hora */}
      <div className="flex-1 overflow-auto">
        {/* Cabecera de días (solo en semana) */}
        {mode === 'week' && (
          <div
            className="sticky top-0 z-20 grid border-b border-border bg-muted"
            style={{ gridTemplateColumns: gridCols }}
          >
            <div className="border-r border-border" />
            {visibleDays.map((day) => {
              const key = civilKey(day)
              const isToday = key === todayKey
              return (
                <div
                  key={key}
                  className={`border-r border-border px-1 py-1 text-center text-[11px] font-semibold capitalize last:border-r-0 ${
                    isToday ? 'bg-primary/10 text-primary' : 'text-muted-foreground'
                  }`}
                >
                  {dayShortFmt.format(civilToBogotaMidnightUTC(day))}
                </div>
              )
            })}
          </div>
        )}

        {/* Filas de horas */}
        {hours.map((h) => (
          <div
            key={h}
            className="grid border-b border-border/70"
            style={{ gridTemplateColumns: gridCols }}
          >
            {/* Etiqueta de hora */}
            <div className="border-r border-border px-1 py-1 text-right text-[11px] font-medium tabular-nums text-muted-foreground">
              {String(h).padStart(2, '0')}:00
            </div>
            {/* Una celda por día, con las citas de esa hora apiladas */}
            {visibleDays.map((day) => {
              const key = civilKey(day)
              const isToday = key === todayKey
              const citas = grid.get(key)?.get(h) ?? []
              return (
                <div
                  key={key}
                  className={`min-h-[2.5rem] space-y-1 border-r border-border/60 p-1 last:border-r-0 ${
                    isToday ? 'bg-primary/5' : ''
                  }`}
                >
                  {citas.map((ev) => (
                    <CitaCard
                      key={ev.id}
                      ev={ev}
                      compact={mode === 'week'}
                      onClick={() => onEventClick(ev)}
                    />
                  ))}
                </div>
              )
            })}
          </div>
        ))}

        {hours.length === 0 && (
          <div className="px-3 py-6 text-center text-sm italic text-muted-foreground">
            Sin citas en este rango
          </div>
        )}
      </div>
    </div>
  )
}

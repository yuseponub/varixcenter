'use client'

/**
 * Stacked Agenda (vista "Filas")
 *
 * Vista de calendario alterna a FullCalendar: muestra las citas APILADAS EN
 * FILAS (una debajo de otra), ordenadas por hora. Cuando dos citas coinciden
 * en la misma hora igual quedan una arriba y otra abajo (nunca en "bloques"
 * lado a lado como hace el timeGrid de FullCalendar).
 *
 * Zona horaria: Colombia es UTC−5 fijo. Guardamos la fecha "civil" del cursor
 * como mediodía UTC y leemos con getUTC* (mediodía UTC = 07:00 Bogotá, mismo
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
}

const TZ = 'America/Bogota'

const dayKeyFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
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
const rangeTitleFmt = new Intl.DateTimeFormat('es-CO', {
  timeZone: TZ,
  day: 'numeric',
  month: 'short',
})

const OUTLOOK_COLOR = 'oklch(0.45 0.12 210)'

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

export function StackedAgenda({
  events,
  onEventClick,
  onRangeChange,
  initialDate,
}: StackedAgendaProps) {
  const [mode, setMode] = useState<'day' | 'week'>('week')
  const [cursor, setCursor] = useState<Date>(() =>
    toCivilNoon(initialDate ? new Date(initialDate) : new Date())
  )

  // Días visibles (mediodía-UTC cada uno). Semana = Lun..Sáb (sin domingo).
  const visibleDays = useMemo(() => {
    if (mode === 'day') return [cursor]
    const dow = cursor.getUTCDay() // 0 dom .. 6 sáb
    const offsetToMonday = dow === 0 ? 6 : dow - 1
    const monday = addDays(cursor, -offsetToMonday)
    return Array.from({ length: 6 }, (_, i) => addDays(monday, i)) // Lun..Sáb
  }, [cursor, mode])

  // Notificar rango al padre cuando cambie.
  useEffect(() => {
    const first = visibleDays[0]
    const last = visibleDays[visibleDays.length - 1]
    const start = civilToBogotaMidnightUTC(first).toISOString()
    const end = civilToBogotaMidnightUTC(addDays(last, 1)).toISOString()
    onRangeChange(start, end)
  }, [visibleDays, onRangeChange])

  // Agrupar citas por día civil (Bogotá) y ordenarlas por hora.
  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const ev of events) {
      const startDate = new Date(ev.start)
      if (Number.isNaN(startDate.getTime())) continue
      const key = dayKeyFmt.format(startDate)
      const list = map.get(key)
      if (list) list.push(ev)
      else map.set(key, [ev])
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
      )
    }
    return map
  }, [events])

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

  return (
    <div className="flex h-full flex-col">
      {/* Encabezado delgado y fijo */}
      <div className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-border bg-card px-2 py-1.5">
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

      {/* Filas de citas por día */}
      <div className="flex-1 overflow-auto">
        {visibleDays.map((day) => {
          const key = civilKey(day)
          const dayEvents = eventsByDay.get(key) ?? []
          const isToday = key === todayKey
          return (
            <div key={key} className="border-b border-border last:border-b-0">
              <div
                className={`sticky top-0 z-10 px-3 py-1 text-xs font-semibold capitalize ${
                  isToday
                    ? 'bg-primary/10 text-primary'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {dayTitleFmt.format(civilToBogotaMidnightUTC(day))}
                {isToday && ' · hoy'}
              </div>

              {dayEvents.length === 0 ? (
                <div className="px-3 py-2 text-xs italic text-muted-foreground">
                  Sin citas
                </div>
              ) : (
                <ul className="divide-y divide-border/60">
                  {dayEvents.map((ev) => {
                    const isOutlook = ev.extendedProps.source === 'outlook'
                    const accent = isOutlook
                      ? OUTLOOK_COLOR
                      : ev.borderColor || 'var(--primary)'
                    const name =
                      ev.extendedProps.matchedPatientName ||
                      ev.extendedProps.patientName ||
                      ev.title
                    return (
                      <li key={ev.id}>
                        <button
                          type="button"
                          onClick={() => onEventClick(ev)}
                          className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-accent/60"
                          style={{ borderLeft: `4px solid ${accent}` }}
                        >
                          <span className="w-16 shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                            {timeFmt.format(new Date(ev.start))}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">
                            {name}
                          </span>
                          {isOutlook ? (
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
                              {STATUS_LABELS[ev.extendedProps.estado] ??
                                ev.extendedProps.estado}
                            </span>
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

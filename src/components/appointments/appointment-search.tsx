'use client'

/**
 * Buscador de personas en la agenda.
 *
 * Se escribe el nombre (o cédula, o celular) y se listan las citas de esa
 * persona: primero las de hoy en adelante — que es la pregunta real de
 * recepción, "¿tiene cita?" — y después el historial reciente. Incluye las
 * citas que solo existen como evento de Outlook, marcadas como tales.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { Search, Calendar, User, Phone, X, Stethoscope } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/appointments/status-badge'
import type { CalendarEvent } from '@/types/appointments'

export interface AppointmentSearchResult extends CalendarEvent {
  origen: 'varix' | 'outlook' | 'outlook-escritorio'
  displayName: string
  cedula: string
  celular: string
  doctorName: string | null
  /** La decide el servidor: una cita de todo el día llega como 'YYYY-MM-DD'
   *  y no se puede comparar contra un instante. */
  esProxima: boolean
  sortKey: string
}

interface AppointmentSearchProps {
  /** Se dispara al elegir un resultado. */
  onSelect: (appointment: AppointmentSearchResult) => void
}

const dateFmt = new Intl.DateTimeFormat('es-CO', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'America/Bogota',
})
const timeFmt = new Intl.DateTimeFormat('es-CO', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: 'America/Bogota',
})

function formatWhen(value: string | Date, allDay?: boolean): string {
  // Un evento de todo el día llega como 'YYYY-MM-DD' (fecha civil). Si se
  // pasa tal cual a Date se interpreta como medianoche UTC, que en Bogotá cae
  // el día anterior; se ancla al mediodía para que no se corra.
  const raw = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T12:00:00`
    : value
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return ''
  const day = dateFmt.format(date)
  return allDay ? `${day} · todo el día` : `${day} · ${timeFmt.format(date)}`
}

export function AppointmentSearch({ onSelect }: AppointmentSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<AppointmentSearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)
  // Descarta respuestas que llegan tarde y pisarían a una búsqueda más reciente.
  const requestRef = useRef(0)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
  }, [])

  const search = useCallback(async (searchQuery: string) => {
    if (searchQuery.trim().length < 2) {
      setResults([])
      setIsOpen(false)
      return
    }

    const requestId = ++requestRef.current
    setIsLoading(true)

    try {
      const response = await fetch(
        `/api/appointments/search?q=${encodeURIComponent(searchQuery)}`,
        { cache: 'no-store' }
      )
      if (!response.ok) throw new Error('respuesta no válida')
      const data = await response.json()
      if (requestId !== requestRef.current) return
      setResults(data.appointments || [])
      setIsOpen(true)
    } catch (error) {
      console.error('Error en la búsqueda:', error)
      if (requestId === requestRef.current) {
        setResults([])
        setIsOpen(true)
      }
    } finally {
      if (requestId === requestRef.current) setIsLoading(false)
    }
  }, [])

  const handleInputChange = (value: string) => {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => void search(value), 300)
  }

  const handleSelect = (appointment: AppointmentSearchResult) => {
    setIsOpen(false)
    onSelect(appointment)
  }

  const handleClear = () => {
    requestRef.current++
    setQuery('')
    setResults([])
    setIsOpen(false)
    setIsLoading(false)
  }

  const upcoming = results.filter((result) => result.esProxima)
  const past = results.filter((result) => !result.esProxima)

  const renderRow = (appointment: AppointmentSearchResult) => (
    <li key={appointment.id}>
      <button
        type="button"
        onClick={() => handleSelect(appointment)}
        className="flex w-full flex-col gap-1 px-3 py-2 text-left hover:bg-accent"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium">{appointment.displayName}</span>
          {appointment.origen === 'varix' ? (
            <StatusBadge status={appointment.extendedProps.estado} size="sm" />
          ) : (
            <span className="shrink-0 rounded-full bg-[oklch(0.45_0.12_210)] px-2 py-0.5 text-[11px] font-semibold text-white">
              Outlook
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-sm font-medium text-foreground">
          <Calendar className="h-3 w-3 shrink-0" />
          {formatWhen(appointment.start, appointment.allDay)}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
          {appointment.cedula && (
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {appointment.cedula}
            </span>
          )}
          {appointment.celular && (
            <span className="flex items-center gap-1">
              <Phone className="h-3 w-3" />
              {appointment.celular}
            </span>
          )}
          {appointment.doctorName && (
            <span className="flex items-center gap-1">
              <Stethoscope className="h-3 w-3" />
              {appointment.doctorName}
            </span>
          )}
        </div>
      </button>
    </li>
  )

  const sectionHeader = (text: string) => (
    <li className="sticky top-0 bg-popover px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {text}
    </li>
  )

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Buscar persona: nombre, cédula o celular…"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          className="pl-10 pr-10"
        />
        {query && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 p-0"
            onClick={handleClear}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {isLoading && (
        <div className="absolute right-12 top-1/2 -translate-y-1/2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-primary" />
        </div>
      )}

      {isOpen && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg">
          <ul className="max-h-96 overflow-auto py-1">
            {upcoming.length > 0 && sectionHeader('Próximas citas')}
            {upcoming.map(renderRow)}
            {past.length > 0 && sectionHeader('Citas anteriores')}
            {past.map(renderRow)}
          </ul>
        </div>
      )}

      {isOpen && query.trim().length >= 2 && results.length === 0 && !isLoading && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover p-4 text-center text-sm text-muted-foreground shadow-lg">
          Esa persona no tiene citas registradas
        </div>
      )}
    </div>
  )
}

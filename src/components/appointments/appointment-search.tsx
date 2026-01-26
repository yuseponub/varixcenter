'use client'

/**
 * Appointment Search Component
 *
 * Search field with dropdown results for finding appointments
 * by patient name, cedula, or phone number.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { Search, Calendar, User, Phone, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/appointments/status-badge'
import type { AppointmentStatus } from '@/types/appointments'

interface SearchResult {
  id: string
  fecha_hora_inicio: string
  fecha_hora_fin: string
  estado: AppointmentStatus
  motivo_consulta: string | null
  patient: {
    nombre: string
    apellido: string
    cedula: string
    celular: string | null
  }
  doctor: {
    nombre: string | null
    apellido: string | null
    email: string
  }
}

interface AppointmentSearchProps {
  /** Callback when an appointment is selected */
  onSelect: (appointment: SearchResult) => void
}

/**
 * Format date for display
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return new Intl.DateTimeFormat('es-CO', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function AppointmentSearch({ onSelect }: AppointmentSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Search with debounce
  const search = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setResults([])
      setIsOpen(false)
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch(`/api/appointments/search?q=${encodeURIComponent(searchQuery)}`)
      if (response.ok) {
        const data = await response.json()
        setResults(data.appointments || [])
        setIsOpen(true)
      }
    } catch (error) {
      console.error('Search error:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Handle input change with debounce
  const handleInputChange = (value: string) => {
    setQuery(value)

    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    debounceRef.current = setTimeout(() => {
      search(value)
    }, 300)
  }

  // Handle selection
  const handleSelect = (appointment: SearchResult) => {
    setIsOpen(false)
    setQuery('')
    setResults([])
    onSelect(appointment)
  }

  // Clear search
  const handleClear = () => {
    setQuery('')
    setResults([])
    setIsOpen(false)
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Buscar cita por nombre, cedula o telefono..."
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

      {/* Loading indicator */}
      {isLoading && (
        <div className="absolute right-12 top-1/2 -translate-y-1/2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
        </div>
      )}

      {/* Results Dropdown */}
      {isOpen && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg">
          <ul className="max-h-80 overflow-auto py-1">
            {results.map((appointment) => (
              <li key={appointment.id}>
                <button
                  type="button"
                  onClick={() => handleSelect(appointment)}
                  className="flex w-full flex-col gap-1 px-3 py-2 text-left hover:bg-accent"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      {appointment.patient.nombre} {appointment.patient.apellido}
                    </span>
                    <StatusBadge status={appointment.estado} size="sm" />
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {appointment.patient.cedula}
                    </span>
                    {appointment.patient.celular && (
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {appointment.patient.celular}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {formatDate(appointment.fecha_hora_inicio)}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* No results message */}
      {isOpen && query.length >= 2 && results.length === 0 && !isLoading && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover p-4 text-center text-sm text-muted-foreground shadow-lg">
          No se encontraron citas
        </div>
      )}
    </div>
  )
}

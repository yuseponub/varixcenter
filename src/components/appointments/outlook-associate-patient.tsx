'use client'

/**
 * Panel para asociar/crear el paciente de una cita de Outlook que aún no tiene
 * paciente en Varix. Dos modos:
 *  - Buscar: busca un paciente existente (por nombre/cédula) y lo asocia.
 *  - Crear: crea un paciente nuevo (cédula, nombre, apellido, celular) al vuelo.
 * En ambos casos, al confirmar, convierte el evento en una cita nativa.
 */

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Search, UserPlus, CalendarPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { convertOutlookEventToAppointment } from '@/app/(protected)/citas/outlook-convert-actions'
import type { CalendarEvent } from '@/types/appointments'

interface Props {
  event: CalendarEvent
  onDone: () => void
}

interface PatientResult {
  id: string
  cedula: string
  nombre: string
  apellido: string
  celular: string | null
}

const inputCls =
  'w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring'

export function OutlookAssociatePatient({ event, onDone }: Props) {
  const [tab, setTab] = useState<'buscar' | 'crear'>('buscar')
  const [submitting, setSubmitting] = useState(false)

  // --- Buscar existente ---
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PatientResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<PatientResult | null>(null)

  // --- Crear nuevo (prefill del asunto de Outlook) ---
  const prefill = useMemo(() => {
    const words = (event.extendedProps.patientName || '').trim().split(/\s+/)
    return {
      nombre: words[0] ?? '',
      apellido: words.slice(1).join(' '),
    }
  }, [event.extendedProps.patientName])
  const [cedula, setCedula] = useState('')
  const [nombre, setNombre] = useState(prefill.nombre)
  const [apellido, setApellido] = useState(prefill.apellido)
  const [celular, setCelular] = useState('')

  useEffect(() => {
    if (tab !== 'buscar') return
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      return
    }
    let active = true
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/patients/search?q=${encodeURIComponent(q)}`, {
          cache: 'no-store',
        })
        const data = await res.json()
        if (active) setResults(Array.isArray(data.patients) ? data.patients : [])
      } catch {
        if (active) setResults([])
      } finally {
        if (active) setSearching(false)
      }
    }, 300)
    return () => {
      active = false
      clearTimeout(t)
    }
  }, [query, tab])

  const motivo = event.extendedProps.patientName || undefined
  const startISO = new Date(event.start).toISOString()
  const endISO = new Date(event.end).toISOString()

  async function convertWith(
    payload:
      | { patientId: string }
      | { newPatient: { cedula: string; nombre: string; apellido: string; celular: string } }
  ) {
    setSubmitting(true)
    const result = await convertOutlookEventToAppointment({
      eventId: event.id,
      start: startISO,
      end: endISO,
      motivo,
      ...payload,
    })
    setSubmitting(false)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success('Cita creada en Varix. Ya puedes confirmarla y moverla de estado.')
    onDone()
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/40 p-3">
      <p className="text-sm font-semibold">Asociar paciente</p>

      {/* Tabs */}
      <div className="flex items-center gap-0.5 rounded-md border border-input p-0.5 text-xs w-fit">
        <button
          type="button"
          onClick={() => setTab('buscar')}
          className={`flex h-7 items-center gap-1 rounded px-2.5 font-medium ${
            tab === 'buscar' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
          }`}
        >
          <Search className="h-3.5 w-3.5" /> Buscar existente
        </button>
        <button
          type="button"
          onClick={() => setTab('crear')}
          className={`flex h-7 items-center gap-1 rounded px-2.5 font-medium ${
            tab === 'crear' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
          }`}
        >
          <UserPlus className="h-3.5 w-3.5" /> Crear nuevo
        </button>
      </div>

      {tab === 'buscar' ? (
        <div className="space-y-2">
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelected(null)
            }}
            placeholder="Nombre o cédula…"
            className={inputCls}
            autoFocus
          />
          {searching && <p className="text-xs text-muted-foreground">Buscando…</p>}
          {!selected && results.length > 0 && (
            <ul className="max-h-44 divide-y divide-border overflow-auto rounded-md border border-border bg-card">
              {results.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(p)}
                    className="flex w-full flex-col items-start px-2.5 py-1.5 text-left text-sm hover:bg-accent"
                  >
                    <span className="font-medium">
                      {p.nombre} {p.apellido}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      CC {p.cedula}
                      {p.celular ? ` · ${p.celular}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!selected && !searching && query.trim().length >= 2 && results.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Sin resultados. Prueba con la cédula o crea uno nuevo.
            </p>
          )}
          {selected && (
            <div className="flex items-center justify-between rounded-md border border-primary/40 bg-primary/5 px-2.5 py-1.5 text-sm">
              <span>
                <span className="font-medium">
                  {selected.nombre} {selected.apellido}
                </span>
                <span className="text-xs text-muted-foreground"> · CC {selected.cedula}</span>
              </span>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-xs text-muted-foreground underline"
              >
                Cambiar
              </button>
            </div>
          )}
          <Button
            className="w-full"
            disabled={!selected || submitting}
            onClick={() => selected && convertWith({ patientId: selected.id })}
          >
            <CalendarPlus className="mr-2 h-4 w-4" />
            {submitting ? 'Creando…' : 'Asociar y crear cita'}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre"
              className={inputCls}
            />
            <input
              value={apellido}
              onChange={(e) => setApellido(e.target.value)}
              placeholder="Apellido"
              className={inputCls}
            />
            <input
              value={cedula}
              onChange={(e) => setCedula(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              placeholder="Cédula"
              className={inputCls}
            />
            <input
              value={celular}
              onChange={(e) => setCelular(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              placeholder="Celular (10 dígitos)"
              className={inputCls}
            />
          </div>
          <Button
            className="w-full"
            disabled={submitting}
            onClick={() =>
              convertWith({
                newPatient: {
                  cedula: cedula.trim(),
                  nombre: nombre.trim(),
                  apellido: apellido.trim(),
                  celular: celular.trim(),
                },
              })
            }
          >
            <UserPlus className="mr-2 h-4 w-4" />
            {submitting ? 'Creando…' : 'Crear paciente y cita'}
          </Button>
        </div>
      )}
    </div>
  )
}

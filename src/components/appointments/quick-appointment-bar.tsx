'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Zap, Loader2, UserPlus, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { QuickCreateResult } from '@/lib/appointments/quick-create'

/**
 * Barra de "cita en un renglon": la secretaria llena un solo renglon
 * (paciente + fecha + hora + duracion + servicio/doctor opcionales),
 * presiona Enter y la cita queda creada.
 * Si el paciente no existe, se despliegan 3 campos minimos para crearlo inline.
 *
 * El agendado no bloquea: el renglon se limpia de inmediato y la peticion viaja
 * con `keepalive`, asi termina en el servidor aunque se cambie de pagina. Cada
 * envio lleva un `request_id`; repetir el mismo renglon reusa ese id, de modo
 * que un doble Enter nunca agenda dos veces (indice unico, migracion 079).
 */

/** Ventana en la que un renglon identico se considera el mismo agendamiento. */
const DEDUP_WINDOW_MS = 60_000

function newRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Navegadores sin contexto seguro (ej. el PC de recepcion por IP local).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

interface Doctor {
  id: string
  nombre: string | null
  apellido: string | null
}

interface Service {
  id: string
  nombre: string
  precio_base?: number
  precio_variable?: boolean
  precio_minimo?: number | null
  precio_maximo?: number | null
}

/**
 * Una fila de "motivo / procedimiento" en la barra. `serviceId` es un servicio
 * del catalogo (se factura) o uno de los motivos sin precio de abajo, que se
 * guardan como texto en `motivo_consulta` de la cita.
 */
interface ProcRow {
  serviceId: string
  cantidad: number
  /** Solo aplica para servicios de precio variable (ej. ECOR); '' = precio base. */
  precio: string
  /** Texto del motivo cuando se elige "Otro motivo". */
  motivoTexto: string
}

/** Motivos sin precio, pedidos por la clinica: "Residuos" y un motivo libre. */
const MOTIVO_RESIDUOS = 'motivo:residuos'
const MOTIVO_OTRO = 'motivo:otro'
const MOTIVO_LABELS: Record<string, string> = { [MOTIVO_RESIDUOS]: 'Residuos' }

const EMPTY_ROW: ProcRow = { serviceId: '', cantidad: 1, precio: '', motivoTexto: '' }

interface PatientHit {
  id: string
  cedula: string | null
  nombre: string
  apellido: string
}

interface QuickAppointmentBarProps {
  doctors: Doctor[]
  services: Service[]
  onCreated?: () => void
}

function todayBogota(): string {
  // Colombia es UTC-5 fijo
  const now = new Date(Date.now() - 5 * 3600_000)
  return now.toISOString().slice(0, 10)
}

export function QuickAppointmentBar({ doctors, services, onCreated }: QuickAppointmentBarProps) {
  // Citas viajando al servidor. No bloquea el renglon: se puede seguir
  // agendando mientras la anterior termina de guardarse.
  const [inFlight, setInFlight] = useState(0)
  /** Renglones enviados hace poco → su request_id, para no duplicar. */
  const recentRef = useRef<{ key: string; requestId: string; at: number }[]>([])

  // Paciente
  const [patientQuery, setPatientQuery] = useState('')
  const [patientId, setPatientId] = useState('')
  const [hits, setHits] = useState<PatientHit[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [newPatientMode, setNewPatientMode] = useState(false)
  const [nuevoCelular, setNuevoCelular] = useState('')
  const [nuevaCedula, setNuevaCedula] = useState('')
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Cita
  const [fecha, setFecha] = useState(todayBogota())
  const [hora, setHora] = useState('')
  const [duracion, setDuracion] = useState('30')
  const [procs, setProcs] = useState<ProcRow[]>([{ ...EMPTY_ROW }])
  const [doctorId, setDoctorId] = useState('')

  const updateProc = useCallback((index: number, patch: Partial<ProcRow>) => {
    setProcs((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }, [])
  const addProc = useCallback(() => {
    setProcs((prev) => (prev.length >= 5 ? prev : [...prev, { ...EMPTY_ROW }]))
  }, [])
  const removeProc = useCallback((index: number) => {
    setProcs((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)))
  }, [])

  // Busqueda con debounce
  useEffect(() => {
    if (patientId || newPatientMode) return
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (patientQuery.trim().length < 2) {
      setHits([])
      return
    }
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/patients/search?q=${encodeURIComponent(patientQuery)}`)
        if (!res.ok) return
        const json = await res.json()
        setHits((json.patients ?? []).slice(0, 8))
        setShowDropdown(true)
      } catch {
        // silencioso: la busqueda es best-effort
      }
    }, 250)
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current)
    }
  }, [patientQuery, patientId, newPatientMode])

  // Cerrar dropdown al hacer click afuera
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const selectPatient = useCallback((p: PatientHit) => {
    setPatientId(p.id)
    setPatientQuery(`${p.nombre} ${p.apellido}${p.cedula ? ` (${p.cedula})` : ''}`)
    setNewPatientMode(false)
    setShowDropdown(false)
  }, [])

  const enableNewPatient = useCallback(() => {
    setPatientId('')
    setNewPatientMode(true)
    setShowDropdown(false)
  }, [])

  const clearPatient = useCallback(() => {
    setPatientId('')
    setNewPatientMode(false)
    setPatientQuery('')
    setNuevoCelular('')
    setNuevaCedula('')
  }, [])

  const submit = useCallback(() => {
    if (!patientId && !newPatientMode) {
      toast.error('Busque un paciente o cree uno nuevo')
      return
    }
    if (!fecha || !hora) {
      toast.error('Complete fecha y hora')
      return
    }

    // Derivar nombre/apellido del texto escrito para paciente nuevo
    let nuevoNombre = ''
    let nuevoApellido = ''
    if (newPatientMode) {
      const words = patientQuery.trim().split(/\s+/)
      if (words.length < 2) {
        toast.error('Escriba nombre y apellido del paciente nuevo')
        return
      }
      const mid = Math.ceil(words.length / 2)
      nuevoNombre = words.slice(0, mid).join(' ')
      nuevoApellido = words.slice(mid).join(' ')
    }

    // Procedimientos del catalogo (filas con servicio); cantidad y precio libre.
    const servicios = procs
      .filter((row) => services.some((s) => s.id === row.serviceId))
      .map((row) => ({
        service_id: row.serviceId,
        cantidad: row.cantidad || 1,
        precio_unitario: row.precio ? Number(row.precio) : undefined,
      }))

    // Motivos sin precio: "Residuos" o el texto libre, al motivo de la cita.
    const motivos: string[] = []
    for (const row of procs) {
      if (row.serviceId === MOTIVO_RESIDUOS) motivos.push(MOTIVO_LABELS[MOTIVO_RESIDUOS])
      if (row.serviceId === MOTIVO_OTRO) {
        const texto = row.motivoTexto.trim()
        if (!texto) {
          toast.error('Escriba el motivo de la cita')
          return
        }
        motivos.push(texto)
      }
    }
    const motivo = motivos.join(' · ').slice(0, 500)

    // Mismo renglon enviado dos veces seguidas (doble Enter, clic + Enter) →
    // se reusa el request_id, y el servidor devuelve la cita que ya creo.
    const now = Date.now()
    recentRef.current = recentRef.current.filter((r) => now - r.at < DEDUP_WINDOW_MS)
    const key = [
      patientId || `${nuevoNombre} ${nuevoApellido}`.toLowerCase(),
      fecha,
      hora,
      doctorId,
    ].join('|')
    const previous = recentRef.current.find((r) => r.key === key)
    const requestId = previous?.requestId ?? newRequestId()
    if (previous) previous.at = now
    else recentRef.current.push({ key, requestId, at: now })

    const payload = {
      request_id: requestId,
      patient_id: patientId,
      nuevo_nombre: nuevoNombre,
      nuevo_apellido: nuevoApellido,
      nuevo_celular: nuevoCelular,
      nueva_cedula: nuevaCedula,
      fecha,
      hora,
      duracion_min: Number(duracion),
      doctor_id: doctorId,
      servicios,
      motivo,
    }

    // El renglon se libera ya: la cita se termina de guardar en segundo plano.
    const etiqueta = patientQuery.trim() || 'la cita'
    clearPatient()
    setHora('')
    setProcs([{ ...EMPTY_ROW }])
    setInFlight((n) => n + 1)

    const enviar = () =>
      fetch('/citas/api/rapida', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        // Sobrevive a cerrar la pestana o navegar a otra pagina.
        keepalive: true,
      })

    enviar()
      .then(async (res) => {
        const result = (await res.json().catch(() => ({}))) as QuickCreateResult

        if (!res.ok || result.error) {
          toast.error(result.error || 'Error al crear la cita', {
            description: `${etiqueta} · ${fecha} ${hora}`,
            duration: 15_000,
            action: {
              label: 'Reintentar',
              onClick: () => {
                void enviar()
                  .then(async (r) => {
                    const again = (await r.json().catch(() => ({}))) as QuickCreateResult
                    if (r.ok && !again.error) {
                      toast.success('Cita creada')
                      onCreated?.()
                    } else {
                      toast.error(again.error || 'Error al crear la cita')
                    }
                  })
                  .catch(() => toast.error('Sin conexion con el servidor'))
              },
            },
          })
          return
        }

        if (result.data?.duplicate) {
          // El mismo renglon ya estaba agendado; no se creo una segunda cita.
          toast.info('Esa cita ya estaba agendada')
        } else {
          toast.success(
            result.data?.created_patient
              ? 'Cita creada y paciente nuevo registrado'
              : 'Cita creada'
          )
        }
        if (result.warning) {
          toast.warning(result.warning, { duration: 8_000 })
        }
        onCreated?.()
      })
      .catch(() => {
        toast.error('No se pudo confirmar el agendado', {
          description: `${etiqueta} · ${fecha} ${hora} — revise la agenda antes de repetirlo`,
          duration: 15_000,
        })
      })
      .finally(() => setInFlight((n) => Math.max(0, n - 1)))
  }, [
    patientId, newPatientMode, patientQuery, nuevoCelular, nuevaCedula,
    fecha, hora, duracion, doctorId, procs, services, clearPatient, onCreated,
  ])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'Enter' || showDropdown) return
      // Los desplegables (duracion, procedimiento, doctor) se pintan en un
      // portal: su Enter llega hasta aca por el arbol de React aunque no este
      // dentro del renglon. Ese Enter elige una opcion, no agenda.
      if (e.defaultPrevented) return
      if (!e.currentTarget.contains(e.target as Node)) return
      e.preventDefault()
      submit()
    },
    [showDropdown, submit]
  )

  return (
    <div className="mb-4 rounded-lg border bg-card p-3 shadow-sm" onKeyDown={onKeyDown}>
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Zap className="h-4 w-4 text-warning-foreground" />
        Cita rapida — llene el renglon y presione Enter
        {inFlight > 0 && (
          <span className="flex items-center gap-1 text-xs font-normal">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Guardando {inFlight > 1 ? `${inFlight} citas` : 'la cita'} en segundo plano…
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Paciente con autocompletado */}
        <div className="relative min-w-[220px] flex-1" ref={containerRef}>
          <Input
            placeholder="Paciente: nombre o cedula..."
            value={patientQuery}
            onChange={(e) => {
              setPatientQuery(e.target.value)
              setPatientId('')
            }}
            onFocus={() => hits.length > 0 && !patientId && setShowDropdown(true)}
            className={patientId ? 'border-success-foreground/60' : newPatientMode ? 'border-warning-foreground/60' : ''}
          />
          {showDropdown && (
            <div className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover shadow-md">
              {hits.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
                  onClick={() => selectPatient(p)}
                >
                  {p.nombre} {p.apellido}
                  {p.cedula && (
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      {p.cedula}
                    </span>
                  )}
                </button>
              ))}
              <button
                type="button"
                className="flex w-full items-center gap-2 border-t px-3 py-2 text-left text-sm font-medium text-warning-foreground hover:bg-accent"
                onClick={enableNewPatient}
              >
                <UserPlus className="h-4 w-4" />
                Crear &quot;{patientQuery}&quot; como paciente nuevo
              </button>
            </div>
          )}
        </div>

        {/* Fecha y hora */}
        <Input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className="w-[150px]"
        />
        <Input
          type="time"
          value={hora}
          onChange={(e) => setHora(e.target.value)}
          className="w-[110px]"
        />

        {/* Duracion */}
        <Select value={duracion} onValueChange={setDuracion}>
          <SelectTrigger className="w-[110px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="15">15 min</SelectItem>
            <SelectItem value="20">20 min</SelectItem>
            <SelectItem value="30">30 min</SelectItem>
            <SelectItem value="45">45 min</SelectItem>
            <SelectItem value="60">1 hora</SelectItem>
            <SelectItem value="90">1.5 horas</SelectItem>
          </SelectContent>
        </Select>

        {/* Motivo / procedimiento: servicio del catalogo (+ cantidad y precio
            libre en los variables) o un motivo sin precio (Residuos / libre). */}
        {procs.map((row, i) => {
          const svc = services.find((s) => s.id === row.serviceId)
          return (
            <div key={i} className="flex items-center gap-1">
              <Select
                value={row.serviceId || 'none'}
                onValueChange={(v) => {
                  const nextId = v === 'none' ? '' : v
                  const nextSvc = services.find((s) => s.id === nextId)
                  updateProc(i, {
                    serviceId: nextId,
                    // Prefill del precio base solo para servicios variables (editable).
                    precio: nextSvc?.precio_variable ? String(nextSvc.precio_base ?? '') : '',
                    motivoTexto: nextId === MOTIVO_OTRO ? row.motivoTexto : '',
                  })
                }}
              >
                <SelectTrigger className="w-[190px]">
                  <SelectValue placeholder={i === 0 ? 'Motivo / procedimiento' : 'Motivo / procedimiento...'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{i === 0 ? 'Sin motivo' : 'Quitar'}</SelectItem>
                  {services.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.nombre}
                    </SelectItem>
                  ))}
                  <SelectItem value={MOTIVO_RESIDUOS}>{MOTIVO_LABELS[MOTIVO_RESIDUOS]}</SelectItem>
                  <SelectItem value={MOTIVO_OTRO}>Otro motivo (escribir)…</SelectItem>
                </SelectContent>
              </Select>
              {row.serviceId === MOTIVO_OTRO && (
                <Input
                  value={row.motivoTexto}
                  onChange={(e) => updateProc(i, { motivoTexto: e.target.value.slice(0, 200) })}
                  placeholder="Motivo de la cita"
                  title="Motivo libre (queda en la cita, no se factura)"
                  className="w-[200px]"
                  autoFocus
                />
              )}
              {svc && (
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={row.cantidad}
                  onChange={(e) => updateProc(i, { cantidad: Math.max(1, parseInt(e.target.value) || 1) })}
                  title="Cantidad (ej. 2 sesiones)"
                  className="w-[58px] px-1 text-center"
                />
              )}
              {svc?.precio_variable && (
                <Input
                  type="number"
                  min={0}
                  value={row.precio}
                  onChange={(e) => updateProc(i, { precio: e.target.value })}
                  title="Precio (libre para este procedimiento)"
                  placeholder="Precio"
                  className="w-[100px] px-1"
                />
              )}
              {i > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeProc(i)}
                  className="h-7 w-7 text-muted-foreground"
                  title="Quitar procedimiento"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )
        })}
        {/* Boton discreto para agregar otro procedimiento (uso ocasional) */}
        {procs.length < 5 && procs[procs.length - 1].serviceId && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={addProc}
            className="h-7 w-7 text-muted-foreground"
            title="Agregar otro procedimiento"
          >
            <Plus className="h-4 w-4" />
          </Button>
        )}

        {/* Doctor (opcional) */}
        <Select value={doctorId || 'none'} onValueChange={(v) => setDoctorId(v === 'none' ? '' : v)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Doctor (opcional)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sin doctor</SelectItem>
            {doctors.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {[d.nombre, d.apellido].filter(Boolean).join(' ') || 'Doctor'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button onClick={submit} className="min-w-[90px]">
          Crear
        </Button>
      </div>

      {/* Campos minimos para paciente nuevo */}
      {newPatientMode && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-warning p-2 ">
          <span className="flex items-center gap-1 text-xs font-medium text-warning-foreground">
            <UserPlus className="h-3.5 w-3.5" />
            Paciente nuevo: &quot;{patientQuery}&quot;
          </span>
          <Input
            placeholder="Celular (10 digitos)"
            value={nuevoCelular}
            onChange={(e) => setNuevoCelular(e.target.value.replace(/\D/g, '').slice(0, 10))}
            className="w-[170px]"
            inputMode="numeric"
          />
          <Input
            placeholder="Cedula (opcional)"
            value={nuevaCedula}
            onChange={(e) => setNuevaCedula(e.target.value.replace(/\D/g, '').slice(0, 10))}
            className="w-[160px]"
            inputMode="numeric"
          />
          <Button variant="ghost" size="sm" onClick={clearPatient}>
            Cancelar
          </Button>
        </div>
      )}
    </div>
  )
}

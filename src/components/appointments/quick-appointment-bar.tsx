'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Zap, Loader2, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { quickCreateAppointment } from '@/app/(protected)/citas/quick-actions'

/**
 * Barra de "cita en un renglon": la secretaria llena un solo renglon
 * (paciente + fecha + hora + duracion + servicio/doctor opcionales),
 * presiona Enter y la cita queda creada.
 * Si el paciente no existe, se despliegan 3 campos minimos para crearlo inline.
 */

interface Doctor {
  id: string
  nombre: string | null
  apellido: string | null
}

interface Service {
  id: string
  nombre: string
}

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
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

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
  const [serviceId, setServiceId] = useState('')
  const [doctorId, setDoctorId] = useState('')

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

    startTransition(async () => {
      const result = await quickCreateAppointment({
        patient_id: patientId,
        nuevo_nombre: nuevoNombre,
        nuevo_apellido: nuevoApellido,
        nuevo_celular: nuevoCelular,
        nueva_cedula: nuevaCedula,
        fecha,
        hora,
        duracion_min: Number(duracion),
        doctor_id: doctorId,
        service_id: serviceId,
      })

      if (result.error) {
        toast.error(result.error)
        return
      }

      toast.success(
        result.data?.created_patient
          ? 'Cita creada y paciente nuevo registrado'
          : 'Cita creada'
      )
      // Limpiar solo el paciente y la hora: la secretaria suele agendar
      // varias citas seguidas el mismo dia
      clearPatient()
      setHora('')
      setServiceId('')
      router.refresh()
      onCreated?.()
    })
  }, [
    patientId, newPatientMode, patientQuery, nuevoCelular, nuevaCedula,
    fecha, hora, duracion, doctorId, serviceId, startTransition, router,
    clearPatient, onCreated,
  ])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !showDropdown) {
        e.preventDefault()
        submit()
      }
    },
    [showDropdown, submit]
  )

  return (
    <div className="mb-4 rounded-lg border bg-card p-3 shadow-sm" onKeyDown={onKeyDown}>
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Zap className="h-4 w-4 text-warning-foreground" />
        Cita rapida — llene el renglon y presione Enter
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

        {/* Servicio (opcional) */}
        <Select value={serviceId || 'none'} onValueChange={(v) => setServiceId(v === 'none' ? '' : v)}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Servicio (opcional)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sin servicio</SelectItem>
            {services.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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

        <Button onClick={submit} disabled={isPending} className="min-w-[90px]">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Crear'}
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

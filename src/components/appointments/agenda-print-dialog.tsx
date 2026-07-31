'use client'

/**
 * Imprimir el horario de un dia.
 *
 * La recepcion trabaja sobre papel: se elige hoy, el siguiente dia habil o
 * cualquier fecha, y sale una hoja con una fila por cita (hora, paciente,
 * telefono, procedimientos, doctor) y una casilla para marcar a mano.
 *
 * Las citas se piden a /citas/api, la misma ruta que alimenta la agenda, para
 * que la hoja incluya tambien los eventos del Outlook de recepcion. Las citas
 * canceladas quedan fuera: la hoja es de lo que se va a atender.
 *
 * Zona horaria: Colombia es UTC-5 fijo; el dia civil elegido va de las 00:00 a
 * las 24:00 de Bogota (05:00 UTC a 05:00 UTC del dia siguiente).
 */

import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { Printer, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import type { CalendarEvent, Doctor } from '@/types/appointments'

const TZ = 'America/Bogota'

const dayKeyFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const longDateFmt = new Intl.DateTimeFormat('es-CO', {
  timeZone: TZ,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})
const timeFmt = new Intl.DateTimeFormat('es-CO', {
  timeZone: TZ,
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})
const stampFmt = new Intl.DateTimeFormat('es-CO', {
  timeZone: TZ,
  dateStyle: 'short',
  timeStyle: 'short',
})

/** 'YYYY-MM-DD' de hoy en Bogota. */
function todayKey(): string {
  return dayKeyFmt.format(new Date())
}

/** Suma dias a una clave 'YYYY-MM-DD' sin arrastrar zona horaria. */
function addDays(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number)
  const noon = new Date(Date.UTC(y, m - 1, d, 12))
  noon.setUTCDate(noon.getUTCDate() + days)
  return noon.toISOString().slice(0, 10)
}

/** Dia de la semana (0 domingo … 6 sabado) de una clave 'YYYY-MM-DD'. */
function weekday(key: string): number {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()
}

/**
 * Siguiente dia habil. La clinica atiende de lunes a sabado, asi que solo se
 * salta el domingo. No contempla festivos: no existe calendario de festivos en
 * el sistema y agregarlo seria adivinar.
 */
function nextBusinessDay(from: string): string {
  let next = addDays(from, 1)
  while (weekday(next) === 0) next = addDays(next, 1)
  return next
}

/** 00:00 y 24:00 de Bogota del dia elegido, en ISO UTC. */
function dayRange(key: string): { start: string; end: string } {
  const [y, m, d] = key.split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1, d, 5, 0, 0))
  return {
    start: start.toISOString(),
    end: new Date(start.getTime() + 86_400_000).toISOString(),
  }
}

/** "Gustavo Rincon" → "G. Rincon"; sin doctor asignado → "—". */
function doctorLabel(doctorId: string | null, doctors: Doctor[]): string {
  if (!doctorId) return '—'
  const doctor = doctors.find((d) => d.id === doctorId)
  if (!doctor) return '—'
  const nombre = (doctor.nombre ?? '').trim()
  const apellido = (doctor.apellido ?? '').trim()
  if (nombre && apellido) return `${nombre.charAt(0)}. ${apellido}`
  return nombre || apellido || 'Doctor'
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

interface AgendaPrintDialogProps {
  doctors: Doctor[]
  /** Filtro de doctor activo en la agenda ('all' = sin filtro). */
  doctorId: string
}

export function AgendaPrintDialog({ doctors, doctorId }: AgendaPrintDialogProps) {
  const [open, setOpen] = useState(false)
  const [fecha, setFecha] = useState(todayKey)
  const [loading, setLoading] = useState(false)

  const buildSheet = useCallback(
    (events: CalendarEvent[], dia: string): string => {
      const [y, m, d] = dia.split('-').map(Number)
      const titleDate = longDateFmt.format(new Date(Date.UTC(y, m - 1, d, 12)))

      const rows = events
        .filter((ev) => ev.extendedProps.estado !== 'cancelada')
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
        .map((ev) => {
          const isOutlook = ev.extendedProps.source === 'outlook'
          const nombre =
            ev.extendedProps.matchedPatientName ||
            ev.extendedProps.patientName ||
            ev.title
          const procedimientos =
            ev.extendedProps.servicios?.join(', ') ||
            ev.extendedProps.motivoConsulta ||
            ''
          return `
            <tr>
              <td class="hora">${escapeHtml(timeFmt.format(new Date(ev.start)))}</td>
              <td>${escapeHtml(nombre)}${isOutlook ? ' <span class="tag">Outlook</span>' : ''}</td>
              <td class="tel">${escapeHtml(ev.extendedProps.patientCelular || '')}</td>
              <td>${escapeHtml(procedimientos)}</td>
              <td class="dr">${escapeHtml(doctorLabel(ev.extendedProps.doctorId, doctors))}</td>
              <td class="check"></td>
            </tr>`
        })

      const filtro =
        doctorId !== 'all'
          ? `<p class="filtro">Filtrado por doctor: ${escapeHtml(
              doctorLabel(doctorId, doctors)
            )}</p>`
          : ''

      return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Agenda ${escapeHtml(dia)}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    body { font-family: Arial, Helvetica, sans-serif; color: #000; font-size: 13px; }
    h1 { font-size: 18px; margin: 0 0 2px; }
    .fecha { font-size: 15px; font-weight: bold; text-transform: capitalize; margin: 0 0 2px; }
    .filtro { margin: 0 0 6px; color: #444; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th { text-align: left; font-size: 12px; border-bottom: 2px solid #000; padding: 5px 6px; }
    td { padding: 7px 6px; border-bottom: 1px solid #ddd; vertical-align: top; }
    tr { page-break-inside: avoid; }
    .hora { white-space: nowrap; font-weight: bold; width: 70px; }
    .tel { white-space: nowrap; width: 110px; }
    .dr { white-space: nowrap; width: 90px; }
    .check { width: 26px; border: 1px solid #999; }
    .tag { font-size: 10px; border: 1px solid #666; border-radius: 6px; padding: 0 4px; color: #444; }
    .total { margin-top: 10px; font-weight: bold; }
    .pie { margin-top: 4px; color: #666; font-size: 11px; }
    .vacio { margin-top: 16px; font-style: italic; color: #555; }
  </style>
</head>
<body>
  <h1>VarixCenter · Agenda del día</h1>
  <p class="fecha">${escapeHtml(titleDate)}</p>
  ${filtro}
  ${
    rows.length === 0
      ? '<p class="vacio">No hay citas agendadas para este día.</p>'
      : `<table>
    <thead>
      <tr>
        <th>Hora</th><th>Paciente</th><th>Teléfono</th>
        <th>Procedimientos</th><th>Dr.</th><th></th>
      </tr>
    </thead>
    <tbody>${rows.join('')}</tbody>
  </table>
  <p class="total">Total: ${rows.length} cita${rows.length === 1 ? '' : 's'}</p>`
  }
  <p class="pie">Impreso ${escapeHtml(stampFmt.format(new Date()))}</p>
</body>
</html>`
    },
    [doctors, doctorId]
  )

  const handlePrint = useCallback(async () => {
    if (!fecha) {
      toast.error('Elija una fecha')
      return
    }
    setLoading(true)
    try {
      const { start, end } = dayRange(fecha)
      const params = new URLSearchParams({ start, end })
      if (doctorId !== 'all') params.set('doctor_id', doctorId)

      const res = await fetch(`/citas/api?${params}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('respuesta no valida')
      const data = (await res.json()) as { events: CalendarEvent[] }

      const win = window.open('', '_blank')
      if (!win) {
        toast.error('El navegador bloqueó la ventana de impresión')
        return
      }
      win.document.write(buildSheet(data.events ?? [], fecha))
      win.document.close()
      win.focus()
      win.print()
      setOpen(false)
    } catch (error) {
      console.error('Error al preparar la impresión:', error)
      toast.error('No se pudo preparar la hoja de la agenda')
    } finally {
      setLoading(false)
    }
  }, [fecha, doctorId, buildSheet])

  const hoy = todayKey()

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Printer className="mr-2 h-4 w-4" />
          Imprimir
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Imprimir horario</DialogTitle>
          <DialogDescription>
            Una hoja con las citas del día: hora, paciente, teléfono,
            procedimientos y doctor. No incluye las canceladas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={fecha === hoy ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFecha(hoy)}
            >
              Hoy
            </Button>
            <Button
              type="button"
              variant={fecha === nextBusinessDay(hoy) ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFecha(nextBusinessDay(hoy))}
            >
              Siguiente día hábil
            </Button>
          </div>

          <div>
            <Label htmlFor="agenda-print-fecha" className="text-sm">
              Otro día
            </Label>
            <Input
              id="agenda-print-fecha"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="mt-1 w-[190px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={handlePrint} disabled={loading}>
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Printer className="mr-2 h-4 w-4" />
            )}
            Imprimir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

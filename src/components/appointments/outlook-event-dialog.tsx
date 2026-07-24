'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarPlus, CalendarSync, ExternalLink } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { convertOutlookEventToAppointment } from '@/app/(protected)/citas/outlook-convert-actions'
import type { CalendarEvent } from '@/types/appointments'

interface OutlookEventDialogProps {
  event: CalendarEvent | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

const dateTimeFormatter = new Intl.DateTimeFormat('es-CO', {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Bogota',
})

const dateFormatter = new Intl.DateTimeFormat('es-CO', {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'America/Bogota',
})

export function OutlookEventDialog({ event, open, onOpenChange }: OutlookEventDialogProps) {
  const router = useRouter()
  const [converting, setConverting] = useState(false)
  const [confirming, setConfirming] = useState(false)

  if (!event || event.extendedProps.source !== 'outlook') return null

  const props = event.extendedProps
  // Se puede convertir a cita nativa si ya identificamos el paciente y aún no
  // está convertida (sin cita nativa vinculada) y no es evento de todo el día.
  const canConvert = Boolean(props.patientId) && !props.appointmentId && !props.outlookAllDay

  // Cierra el diálogo asegurando que el paso de confirmación quede reseteado.
  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) setConfirming(false)
    onOpenChange(nextOpen)
  }

  async function handleConvert() {
    if (!event) return
    setConverting(true)
    const result = await convertOutlookEventToAppointment({
      eventId: event.id,
      patientId: event.extendedProps.patientId,
      start: new Date(event.start).toISOString(),
      end: new Date(event.end).toISOString(),
      motivo: event.extendedProps.patientName || undefined,
    })
    setConverting(false)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success('Cita creada en Varix. Ya puedes confirmarla y moverla de estado.')
    setConfirming(false)
    onOpenChange(false)
    router.refresh()
  }
  const allDayDate = typeof event.start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(event.start)
    ? new Date(`${event.start}T12:00:00.000Z`)
    : new Date(event.start)
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarSync className="h-5 w-5 text-[oklch(0.45_0.12_210)]" />
            {props.patientName}
          </DialogTitle>
          <DialogDescription>Evento sincronizado desde Outlook</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 text-sm">
          <div>
            <p className="font-medium text-muted-foreground">Fecha y hora</p>
            {props.outlookAllDay ? (
              <p className="capitalize">Todo el día · {dateFormatter.format(allDayDate)}</p>
            ) : (
              <>
                <p className="capitalize">{dateTimeFormatter.format(new Date(event.start))}</p>
                <p className="text-muted-foreground">
                  Hasta {dateTimeFormatter.format(new Date(event.end))}
                </p>
              </>
            )}
          </div>

          {props.outlookLocation && (
            <div>
              <p className="font-medium text-muted-foreground">Ubicación</p>
              <p>{props.outlookLocation}</p>
            </div>
          )}

          {props.outlookConflict && (
            <div className="rounded-md border border-destructive/30 bg-destructive-soft p-3 text-destructive">
              Outlook y Varix tienen horarios incompatibles para esta cita. El evento se muestra
              por separado para que no se pierda mientras se resuelve el conflicto.
            </div>
          )}

          {props.patientId && (
            <div>
              <p className="font-medium text-muted-foreground">Paciente en Varix</p>
              <Link
                href={`/pacientes/${props.patientId}`}
                className="inline-flex items-center gap-1 font-medium text-[oklch(0.45_0.12_210)] hover:underline"
              >
                {props.matchedPatientName || props.patientName}
                {props.patientCedula ? ` · CC ${props.patientCedula}` : ''}
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}

          {!props.patientId && !props.appointmentId && (
            <div className="rounded-md border border-info-foreground/20 bg-info p-3 text-info-foreground">
              Esta cita todavía no está asociada a un paciente de Varix, pero permanece visible en
              la agenda sincronizada.
            </div>
          )}

          {confirming && (
            <div className="space-y-2 rounded-md border border-[oklch(0.75_0.15_85)]/50 bg-[oklch(0.98_0.04_90)] p-3 text-[oklch(0.4_0.1_60)]">
              <p className="font-semibold">Confirma que es el paciente correcto</p>
              <p>
                En Outlook: <span className="font-medium">{props.patientName}</span>
              </p>
              <p>
                Paciente en Varix:{' '}
                <span className="font-medium">
                  {props.matchedPatientName || props.patientName}
                  {props.patientCedula ? ` · CC ${props.patientCedula}` : ''}
                </span>
              </p>
              <p className="text-xs">
                Se creará una cita de Varix para este paciente en la fecha y hora mostradas. Si no
                es la persona correcta, cancela y verifica en{' '}
                <Link href={`/pacientes/${props.patientId}`} className="underline">
                  su ficha
                </Link>
                .
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          {confirming ? (
            <>
              <Button variant="outline" onClick={() => setConfirming(false)} disabled={converting}>
                Cancelar
              </Button>
              <Button onClick={handleConvert} disabled={converting}>
                <CalendarPlus className="mr-2 h-4 w-4" />
                {converting ? 'Creando…' : 'Sí, es correcto — crear cita'}
              </Button>
            </>
          ) : (
            <>
              {props.outlookWebLink && (
                <Button asChild variant="outline">
                  <a href={props.outlookWebLink} target="_blank" rel="noreferrer">
                    Abrir en Outlook
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </a>
                </Button>
              )}
              {canConvert && (
                <Button onClick={() => setConfirming(true)}>
                  <CalendarPlus className="mr-2 h-4 w-4" />
                  Convertir a cita de Varix
                </Button>
              )}
              <Button
                variant={canConvert ? 'outline' : 'default'}
                onClick={() => handleOpenChange(false)}
              >
                Cerrar
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

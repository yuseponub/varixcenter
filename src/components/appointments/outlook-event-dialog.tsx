'use client'

import { CalendarSync, ExternalLink } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
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
  if (!event || event.extendedProps.source !== 'outlook') return null

  const props = event.extendedProps
  const allDayDate = typeof event.start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(event.start)
    ? new Date(`${event.start}T12:00:00.000Z`)
    : new Date(event.start)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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

          {!props.appointmentId && (
            <div className="rounded-md border border-info-foreground/20 bg-info p-3 text-info-foreground">
              Esta cita todavía no está asociada a un paciente de Varix, pero permanece visible en
              la agenda sincronizada.
            </div>
          )}
        </div>

        <DialogFooter>
          {props.outlookWebLink && (
            <Button asChild variant="outline">
              <a href={props.outlookWebLink} target="_blank" rel="noreferrer">
                Abrir en Outlook
                <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </Button>
          )}
          <Button onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

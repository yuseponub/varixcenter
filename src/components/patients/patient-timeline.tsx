import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type TimelineEvent = {
  id: string
  type: 'patient_record' | 'payment' | 'appointment' | 'procedure' | 'sms_reminder'
  action: string
  timestamp: string
  details: string
  changedFields?: string[] | null
}

interface PatientTimelineProps {
  events: TimelineEvent[]
}

/**
 * Timeline component showing patient events
 *
 * Phase 2: Shows only patient record changes from audit_log
 * Future phases will add:
 * - Phase 3: Appointments
 * - Phase 4: Payments
 * - Phase 6: Medical procedures
 */
export function PatientTimeline({ events }: PatientTimelineProps) {
  if (events.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Historial de Actividad</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
            <svg
              className="mb-4 h-12 w-12 text-muted-foreground/40"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-sm">No hay eventos registrados</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Los pagos, citas y procedimientos apareceran aqui
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Historial de Actividad</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-[oklch(0.93_0.02_200)]" />

          {/* Events */}
          <div className="space-y-6">
            {events.map((event) => (
              <div key={event.id} className="relative pl-10">
                {/* Timeline dot */}
                <div
                  className={`absolute left-2.5 top-1 h-3 w-3 rounded-full border-2 border-white ${getEventColor(event.type)}`}
                />

                {/* Event content */}
                <div className="rounded-lg border bg-white p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-foreground">
                        {getEventTitle(event)}
                      </p>
                      <p className="text-sm text-muted-foreground">{event.details}</p>
                    </div>
                    <time className="shrink-0 text-xs text-muted-foreground">
                      {formatTimestamp(event.timestamp)}
                    </time>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Get color class based on event type
 */
function getEventColor(type: TimelineEvent['type']): string {
  switch (type) {
    case 'patient_record':
      return 'bg-primary'
    case 'payment':
      return 'bg-[oklch(0.62_0.15_165)]'
    case 'appointment':
      return 'bg-[oklch(0.45_0.12_210)]'
    case 'procedure':
      return 'bg-[oklch(0.75_0.15_85)]'
    case 'sms_reminder':
      return 'bg-[oklch(0.55_0.1_205)]'
    default:
      return 'bg-muted-foreground'
  }
}

/**
 * Get human-readable title for event
 */
function getEventTitle(event: TimelineEvent): string {
  switch (event.type) {
    case 'patient_record':
      return event.action === 'INSERT' ? 'Registro creado' : 'Datos actualizados'
    case 'payment':
      return 'Pago registrado'
    case 'appointment':
      return 'Cita'
    case 'procedure':
      return 'Procedimiento'
    case 'sms_reminder':
      return 'Recordatorio SMS'
    default:
      return 'Evento'
  }
}

/**
 * Format timestamp for display in Spanish locale
 */
function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp)
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

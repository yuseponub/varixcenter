import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getAlerts } from '@/lib/queries/alerts'
import {
  getTodayAppointments,
  getTodayPaymentsSummary,
  getLastSyncRun,
} from '@/lib/queries/dashboard'
import { AlertsWidget } from '@/components/alerts/alerts-widget'
import { getPendingInvoicingSummary } from '@/lib/queries/invoicing'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ShieldAlert,
  CalendarDays,
  Banknote,
  UserPlus,
  CalendarPlus,
  CreditCard,
  DatabaseZap,
  FileClock,
} from 'lucide-react'

const ESTADO_BADGE: Record<string, { label: string; className: string }> = {
  programada: { label: 'Programada', className: 'bg-info text-info-foreground' },
  confirmada: { label: 'Confirmada', className: 'bg-success text-success-foreground' },
  en_curso: { label: 'En curso', className: 'bg-warning text-warning-foreground' },
  completada: { label: 'Completada', className: 'bg-neutral-badge text-neutral-badge-foreground' },
  no_asistio: { label: 'No asistio', className: 'bg-destructive-soft text-destructive' },
}

function formatHoraBogota(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/Bogota',
  })
}

function formatCOP(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value)
}

function relativeTimeEs(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 2) return 'hace un momento'
  if (mins < 60) return `hace ${mins} minutos`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `hace ${hours} ${hours === 1 ? 'hora' : 'horas'}`
  const days = Math.floor(hours / 24)
  return `hace ${days} ${days === 1 ? 'dia' : 'dias'}`
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  // El rol viene del JWT (Custom Access Token Hook lo inyecta)
  let role = 'none'
  if (session?.access_token) {
    try {
      const payload = JSON.parse(Buffer.from(session.access_token.split('.')[1], 'base64').toString())
      role = payload.app_metadata?.role ?? 'none'
    } catch {
      role = 'none'
    }
  }

  const showAlerts = role === 'admin' || role === 'medico'

  const [appointments, paymentsSummary, alerts, lastSync, invoicingSummary] = await Promise.all([
    getTodayAppointments(),
    getTodayPaymentsSummary(),
    showAlerts ? getAlerts({ resuelta: false, limit: 10 }) : Promise.resolve([]),
    role === 'admin' ? getLastSyncRun() : Promise.resolve(null),
    role === 'admin'
      ? getPendingInvoicingSummary()
      : Promise.resolve({ count: 0, oldestDays: null }),
  ])

  const syncStale =
    lastSync && Date.now() - new Date(lastSync.started_at).getTime() > 24 * 3600_000

  return (
    <div className="space-y-6">
      {/* Encabezado + accesos rapidos */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold capitalize">
            {new Date().toLocaleDateString('es-CO', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              timeZone: 'America/Bogota',
            })}
          </h1>
          <p className="text-[13px] text-muted-foreground">
            Resumen del día en la clínica
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/citas">
            <Button size="sm">
              <CalendarPlus className="mr-1.5 h-4 w-4" />
              Nueva Cita
            </Button>
          </Link>
          <Link href="/pagos/nuevo">
            <Button size="sm" variant="outline">
              <CreditCard className="mr-1.5 h-4 w-4" />
              Nuevo Pago
            </Button>
          </Link>
          <Link href="/pacientes/nuevo">
            <Button size="sm" variant="outline">
              <UserPlus className="mr-1.5 h-4 w-4" />
              Nuevo Paciente
            </Button>
          </Link>
        </div>
      </div>

      {role === 'none' && (
        <div className="rounded-xl bg-warning p-4 shadow-card">
          <p className="text-warning-foreground">
            <strong>Nota:</strong> Tu cuenta no tiene un rol asignado. Contacta al
            administrador para obtener permisos.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Citas de hoy */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-5 w-5" />
              Citas de hoy
              <Badge variant="secondary" className="ml-1">{appointments.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {appointments.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No hay citas programadas para hoy.
              </p>
            ) : (
              <ul className="divide-y">
                {appointments.map((a) => {
                  const badge = ESTADO_BADGE[a.estado] ?? {
                    label: a.estado,
                    className: 'bg-neutral-badge text-foreground',
                  }
                  return (
                    <li key={a.id} className="flex items-center gap-3 py-2.5">
                      <span className="w-20 shrink-0 font-mono text-sm tabular-nums">
                        {formatHoraBogota(a.fecha_hora_inicio)}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {a.patient ? (
                          <Link
                            href={`/pacientes/${a.patient.id}`}
                            className="font-medium hover:underline"
                          >
                            {a.patient.nombre} {a.patient.apellido}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">Paciente</span>
                        )}
                        {a.motivo_consulta && (
                          <span className="ml-2 text-sm text-muted-foreground">
                            {a.motivo_consulta}
                          </span>
                        )}
                      </span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${badge.className}`}>
                        {badge.label}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
            <div className="mt-3 text-right">
              <Link href="/citas" className="text-[12.5px] font-semibold text-primary hover:underline">
                Ver agenda completa →
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Columna derecha: pagos de hoy + sync */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Banknote className="h-5 w-5" />
                Pagos de hoy
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-mono text-[26px] font-bold tabular-nums">{formatCOP(paymentsSummary.total)}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {paymentsSummary.count} {paymentsSummary.count === 1 ? 'pago registrado' : 'pagos registrados'}
              </p>
              <div className="mt-3 text-right">
                <Link href="/pagos" className="text-[12.5px] font-semibold text-primary hover:underline">
                  Ver pagos →
                </Link>
              </div>
            </CardContent>
          </Card>

          {role === 'admin' && (
            <Card className={invoicingSummary.count > 0 ? 'border border-warning-foreground/40' : ''}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileClock className="h-5 w-5" />
                  Facturacion WiMAX
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-[22px] font-bold tabular-nums">
                  <span className="font-mono">{invoicingSummary.count}</span> pagos por facturar
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {invoicingSummary.oldestDays === null
                    ? 'No hay pagos pendientes.'
                    : `El mas viejo hace ${invoicingSummary.oldestDays} ${
                        invoicingSummary.oldestDays === 1 ? 'dia' : 'dias'
                      }.`}
                </p>
                <div className="mt-3 text-right">
                  <Link href="/facturacion" className="text-[12.5px] font-semibold text-primary hover:underline">
                    Abrir cola →
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Estado del sync con Access (solo admin) */}
          {role === 'admin' && lastSync && (
            <Card className={syncStale ? 'border border-warning-foreground/40' : ''}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <DatabaseZap className="h-5 w-5" />
                  Sincronizacion Access
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <p>
                  Ultima corrida:{' '}
                  <span className="font-medium">{relativeTimeEs(lastSync.started_at)}</span>{' '}
                  {lastSync.ok === false ? (
                    <Badge variant="destructive">con errores</Badge>
                  ) : lastSync.finished_at ? (
                    <Badge variant="success">OK</Badge>
                  ) : null}
                </p>
                {lastSync.stats && (
                  <p className="mt-1 text-muted-foreground">
                    {lastSync.stats.patients_new ?? 0} pacientes nuevos,{' '}
                    {lastSync.stats.legacy_new ?? 0} historias nuevas,{' '}
                    {lastSync.stats.legacy_updated ?? 0} actualizadas
                  </p>
                )}
                {syncStale && (
                  <p className="mt-2 text-warning-foreground">
                    ⚠ Hace mas de 24 horas que no sincroniza. Revisar el PC de la clinica.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Panel de seguridad - solo admin/medico */}
      {showAlerts && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5" />
              Panel de Seguridad
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AlertsWidget alerts={alerts} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

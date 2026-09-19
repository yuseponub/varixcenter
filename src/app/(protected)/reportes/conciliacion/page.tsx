/**
 * Conciliación diaria agenda vs pagos (solo admin).
 *
 * Cruza las citas del día con los pagos y la marca "atendido" del médico
 * para detectar asistidos sin pago, pagos sin cita, pagos dobles y citas cuya
 * asistencia no quedó registrada. Es la revisión previa al cierre de caja.
 */
import Link from 'next/link'
import { AlertTriangle, CalendarDays, CheckCircle2, CreditCard, Scale, UserCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { bogotaToday, getDailyReconciliation, isValidIsoDate } from '@/lib/queries/reconciliation'
import {
  RECONCILIATION_CATEGORY_LABELS,
  RECONCILIATION_DISCREPANCY_CATEGORIES,
  rowsByCategory,
} from '@/lib/reconciliation/classify'
import type { ReconciliationReport, ReconciliationRow } from '@/types/reconciliation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { SendEmailButton } from './send-email-button'

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(amount)

const formatDate = (fecha: string) =>
  new Intl.DateTimeFormat('es-CO', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Bogota',
  }).format(new Date(`${fecha}T12:00:00-05:00`))

const ESTADO_LABEL: Record<string, string> = {
  programada: 'Programada',
  confirmada: 'Confirmada',
  en_sala: 'En sala',
  en_atencion: 'En atención',
  completada: 'Asistió',
  cancelada: 'Cancelada',
  no_asistio: 'No asistió',
}

async function getUserRole(): Promise<string> {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) return 'none'
  try {
    const payload = JSON.parse(Buffer.from(session.access_token.split('.')[1], 'base64').toString())
    return payload.app_metadata?.role ?? 'none'
  } catch {
    return 'none'
  }
}

function PatientCell({ nombre, apellido, cedula, patientId }: { nombre: string; apellido: string; cedula?: string | null; patientId: string }) {
  return (
    <div>
      <Link href={`/pacientes/${patientId}`} className="font-medium hover:underline">
        {nombre} {apellido}
      </Link>
      {cedula && <div className="text-xs text-muted-foreground">{cedula}</div>}
    </div>
  )
}

function PaymentCell({ row }: { row: ReconciliationRow }) {
  const p = row.payment
  if (!p) return <span className="text-muted-foreground">—</span>
  return (
    <div>
      <Link href={`/pagos/${p.id}`} className="font-medium hover:underline">
        {p.numero_factura}
      </Link>{' '}
      <span>{formatCurrency(p.total)}</span>
      <span className="text-muted-foreground"> · {p.hora}</span>
      <div className="text-xs text-muted-foreground">
        {p.servicios}
        {!row.payment_linked && ' · coincide por paciente, sin enlace a la cita'}
      </div>
    </div>
  )
}

function RowsTable({ rows }: { rows: ReconciliationRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-16">Hora</TableHead>
          <TableHead>Paciente</TableHead>
          <TableHead>Agenda</TableHead>
          <TableHead>Médico</TableHead>
          <TableHead>Servicios agendados</TableHead>
          <TableHead>Marcado por médico</TableHead>
          <TableHead>Pago</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.appointment.id}>
            <TableCell>{r.appointment.hora}</TableCell>
            <TableCell>
              <PatientCell
                nombre={r.appointment.patient_nombre}
                apellido={r.appointment.patient_apellido}
                cedula={r.appointment.patient_cedula}
                patientId={r.appointment.patient_id}
              />
            </TableCell>
            <TableCell>
              <Badge variant="outline">{ESTADO_LABEL[r.appointment.estado] ?? r.appointment.estado}</Badge>
            </TableCell>
            <TableCell>{r.appointment.doctor_nombre}</TableCell>
            <TableCell className="max-w-[220px] whitespace-normal">
              {r.appointment.servicios || r.appointment.motivo_consulta || <span className="text-muted-foreground">—</span>}
            </TableCell>
            <TableCell>
              {r.attendance ? (
                <span>
                  {r.attendance.hora} <span className="text-muted-foreground">{r.attendance.marked_by_nombre}</span>
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell className="whitespace-normal">
              <PaymentCell row={r} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function Section({ title, count, tone, children }: { title: string; count: number; tone: 'warning' | 'success' | 'neutral'; children: React.ReactNode }) {
  const color =
    tone === 'warning' ? 'text-warning-foreground' : tone === 'success' ? 'text-success-foreground' : 'text-foreground'
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className={`text-base ${color}`}>
          {title} <span className="text-muted-foreground font-normal">({count})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">{children}</CardContent>
    </Card>
  )
}

function Report({ report }: { report: ReconciliationReport }) {
  const t = report.totals
  const ok = t.discrepancias === 0
  const okRows = rowsByCategory(report, 'ok')
  const okNoAsistio = rowsByCategory(report, 'ok_no_asistio')

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Citas del día</CardTitle>
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-[22px] font-bold">{t.citas}</div>
            <p className="text-xs text-muted-foreground">
              {Object.entries(t.por_estado)
                .map(([e, n]) => `${n} ${ESTADO_LABEL[e]?.toLowerCase() ?? e}`)
                .join(' · ') || 'sin citas'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Marcados por médico</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-[22px] font-bold">{t.marcados_por_medico}</div>
            <p className="text-xs text-muted-foreground">desde la historia clínica</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pagos activos</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-[22px] font-bold">{t.pagos_activos}</div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(t.pagos_activos_total)} · {t.pagos_enlazados_a_cita} enlazados a cita · {t.pagos_anulados} anulados
              {t.medias_ventas_count > 0 && ` · medias: ${t.medias_ventas_count} (${formatCurrency(t.medias_ventas_total)})`}
            </p>
          </CardContent>
        </Card>
        <Card className={ok ? 'border-success' : 'border-warning'}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Discrepancias</CardTitle>
            {ok ? (
              <CheckCircle2 className="h-4 w-4 text-success-foreground" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-warning-foreground" />
            )}
          </CardHeader>
          <CardContent>
            <div className={`text-[22px] font-bold ${ok ? 'text-success-foreground' : 'text-warning-foreground'}`}>
              {t.discrepancias}
            </div>
            <p className="text-xs text-muted-foreground">{ok ? 'todo cuadra' : 'por revisar antes del cierre'}</p>
          </CardContent>
        </Card>
      </div>

      {RECONCILIATION_DISCREPANCY_CATEGORIES.map((category) => {
        const rows = rowsByCategory(report, category)
        if (!rows.length) return null
        return (
          <Section key={category} title={RECONCILIATION_CATEGORY_LABELS[category]} count={rows.length} tone="warning">
            <RowsTable rows={rows} />
          </Section>
        )
      })}

      {report.pagos_dobles.length > 0 && (
        <Section title="Pacientes con más de un pago el mismo día" count={report.pagos_dobles.length} tone="warning">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Paciente</TableHead>
                <TableHead>Facturas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.pagos_dobles.map((d) => (
                <TableRow key={d.patient_id}>
                  <TableCell>
                    <PatientCell nombre={d.patient_nombre} apellido={d.patient_apellido} patientId={d.patient_id} />
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    {d.payments.map((p) => (
                      <div key={p.id}>
                        <Link href={`/pagos/${p.id}`} className="font-medium hover:underline">
                          {p.numero_factura}
                        </Link>{' '}
                        {formatCurrency(p.total)} <span className="text-muted-foreground">· {p.hora} · {p.servicios}</span>
                      </div>
                    ))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>
      )}

      {report.pagos_sin_cita.length > 0 && (
        <Section title="Pagos de pacientes sin cita ese día" count={report.pagos_sin_cita.length} tone="warning">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Hora</TableHead>
                <TableHead>Paciente</TableHead>
                <TableHead>Factura</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Servicios</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.pagos_sin_cita.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.hora}</TableCell>
                  <TableCell>
                    <PatientCell nombre={p.patient_nombre} apellido={p.patient_apellido} patientId={p.patient_id} />
                  </TableCell>
                  <TableCell>
                    <Link href={`/pagos/${p.id}`} className="font-medium hover:underline">
                      {p.numero_factura}
                    </Link>
                  </TableCell>
                  <TableCell>{formatCurrency(p.total)}</TableCell>
                  <TableCell className="whitespace-normal">{p.servicios}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>
      )}

      {okRows.length > 0 && (
        <Section title={RECONCILIATION_CATEGORY_LABELS.ok} count={okRows.length} tone="success">
          <RowsTable rows={okRows} />
        </Section>
      )}

      {okNoAsistio.length > 0 && (
        <Section title={RECONCILIATION_CATEGORY_LABELS.ok_no_asistio} count={okNoAsistio.length} tone="neutral">
          <RowsTable rows={okNoAsistio} />
        </Section>
      )}

      {report.pagos_anulados.length > 0 && (
        <Section title="Pagos anulados" count={report.pagos_anulados.length} tone="neutral">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Hora</TableHead>
                <TableHead>Paciente</TableHead>
                <TableHead>Factura</TableHead>
                <TableHead>Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.pagos_anulados.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.hora}</TableCell>
                  <TableCell>
                    <PatientCell nombre={p.patient_nombre} apellido={p.patient_apellido} patientId={p.patient_id} />
                  </TableCell>
                  <TableCell>
                    <Link href={`/pagos/${p.id}`} className="font-medium hover:underline">
                      {p.numero_factura}
                    </Link>
                  </TableCell>
                  <TableCell>{formatCurrency(p.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>
      )}
    </div>
  )
}

interface PageProps {
  searchParams: Promise<{ fecha?: string }>
}

export default async function ConciliacionPage({ searchParams }: PageProps) {
  const role = await getUserRole()
  const params = await searchParams
  const fecha = isValidIsoDate(params.fecha) ? params.fecha : bogotaToday()

  if (role !== 'admin') {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center gap-3 text-warning-foreground">
          <AlertTriangle className="h-6 w-6" />
          <div>
            <h2 className="text-lg font-semibold">Acceso Denegado</h2>
            <p className="text-sm">Solo el administrador puede ver la conciliación diaria.</p>
          </div>
        </div>
      </div>
    )
  }

  let report: ReconciliationReport | null = null
  let loadError: string | null = null
  try {
    report = await getDailyReconciliation(fecha)
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Error al cargar la conciliación.'
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[22px] font-bold flex items-center gap-2">
            <Scale className="h-6 w-6" />
            Conciliación agenda vs pagos
          </h1>
          <p className="text-muted-foreground capitalize">{formatDate(fecha)}</p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <form method="get" className="flex items-center gap-2">
            <Input type="date" name="fecha" defaultValue={fecha} max={bogotaToday()} className="w-44" />
            <Button type="submit" variant="outline" size="sm">
              Ver
            </Button>
          </form>
          <SendEmailButton fecha={fecha} />
        </div>
      </div>

      {loadError && (
        <div className="bg-destructive/10 text-destructive rounded-lg p-4 text-sm">{loadError}</div>
      )}
      {report && <Report report={report} />}
    </div>
  )
}

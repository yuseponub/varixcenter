import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { getCashClosingById, getPaymentsForDate } from '@/lib/queries/cash-closings'
import { getReceiptPublicUrl } from '@/lib/storage/receipts'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ReopenDialog } from '@/components/cash-closing/reopen-dialog'
import { DeleteDialog } from '@/components/cash-closing/delete-dialog'
import { ClosingPrintReport } from '@/components/cash-closing/closing-print-report'
import { CIERRE_ESTADO_LABELS, CIERRE_ESTADO_VARIANTS } from '@/types'
import { Banknote, CreditCard, Building2, Smartphone, AlertTriangle, CheckCircle2 } from 'lucide-react'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

interface CierreDetailPageProps {
  params: Promise<{ id: string }>
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(amount)

const formatDate = (dateStr: string) =>
  new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'full'
  }).format(new Date(dateStr + 'T12:00:00'))

const formatDateTime = (dateStr: string) =>
  new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(dateStr))

async function getUserRole(): Promise<string> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) return 'none'

  try {
    const payload = JSON.parse(Buffer.from(session.access_token.split('.')[1], 'base64').toString())
    return payload.app_metadata?.role ?? 'none'
  } catch {
    return 'none'
  }
}

async function canReopen(): Promise<boolean> {
  const role = await getUserRole()
  return role === 'admin'
}

async function canDelete(): Promise<boolean> {
  const role = await getUserRole()
  return role === 'admin' || role === 'medico'
}

export default async function CierreDetailPage({ params }: CierreDetailPageProps) {
  const { id } = await params
  const [closing, userCanReopen, userCanDelete] = await Promise.all([
    getCashClosingById(id),
    canReopen(),
    canDelete()
  ])

  if (!closing) {
    notFound()
  }

  // Get payments for this closing date and photo URL
  const [payments, photoUrl] = await Promise.all([
    getPaymentsForDate(closing.fecha_cierre),
    closing.cierre_photo_path
      ? getReceiptPublicUrl(closing.cierre_photo_path)
      : Promise.resolve(null)
  ])

  const hasDiferencia = closing.diferencia !== 0

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/dashboard">Inicio</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/cierres">Cierres</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{closing.cierre_numero}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight font-mono">
              {closing.cierre_numero}
            </h1>
            <Badge variant={CIERRE_ESTADO_VARIANTS[closing.estado]}>
              {CIERRE_ESTADO_LABELS[closing.estado]}
            </Badge>
          </div>
          <p className="text-muted-foreground">
            {formatDate(closing.fecha_cierre)}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {userCanDelete && (
            <DeleteDialog
              cierreId={closing.id}
              cierreNumero={closing.cierre_numero}
            />
          )}
          {userCanReopen && closing.estado === 'cerrado' && (
            <ReopenDialog
              cierreId={closing.id}
              cierreNumero={closing.cierre_numero}
            />
          )}
        </div>
      </div>

      {/* Reopen info */}
      {closing.estado === 'reabierto' && closing.reopen_justificacion && (
        <Card className="border-amber-500 bg-amber-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-amber-700">Cierre Reabierto</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{closing.reopen_justificacion}</p>
            <p className="text-xs text-muted-foreground mt-2">
              Reabierto el {closing.reopened_at ? formatDateTime(closing.reopened_at) : 'N/A'}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Totals Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Totales del Dia</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <Banknote className="h-4 w-4 text-green-600" />
                <span className="text-sm">Efectivo</span>
              </div>
              <span className="text-right font-medium">{formatCurrency(closing.total_efectivo)}</span>

              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-blue-600" />
                <span className="text-sm">Tarjeta</span>
              </div>
              <span className="text-right font-medium">{formatCurrency(closing.total_tarjeta)}</span>

              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-purple-600" />
                <span className="text-sm">Transferencia</span>
              </div>
              <span className="text-right font-medium">{formatCurrency(closing.total_transferencia)}</span>

              <div className="flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-teal-600" />
                <span className="text-sm">Nequi</span>
              </div>
              <span className="text-right font-medium">{formatCurrency(closing.total_nequi)}</span>
            </div>

            <Separator />

            <div className="flex justify-between items-center">
              <span className="font-medium">Total Recaudado</span>
              <span className="text-2xl font-bold">{formatCurrency(closing.grand_total)}</span>
            </div>

            {(closing.total_descuentos > 0 || closing.total_anulaciones > 0) && (
              <>
                <Separator />
                <div className="space-y-2 text-sm">
                  {closing.total_descuentos > 0 && (
                    <div className="flex justify-between text-amber-600">
                      <span>Descuentos aplicados</span>
                      <span>-{formatCurrency(closing.total_descuentos)}</span>
                    </div>
                  )}
                  {closing.total_anulaciones > 0 && (
                    <div className="flex justify-between text-red-600">
                      <span>Pagos anulados</span>
                      <span>{formatCurrency(closing.total_anulaciones)}</span>
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Cash Count Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Conteo de Efectivo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Conteo Fisico</span>
                <span className="font-medium">{formatCurrency(closing.conteo_fisico_efectivo)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Calculado</span>
                <span className="font-medium">{formatCurrency(closing.total_efectivo)}</span>
              </div>
            </div>

            <Separator />

            <div className={`flex items-center justify-between p-3 rounded-lg ${hasDiferencia ? 'bg-red-50' : 'bg-green-50'}`}>
              <div className="flex items-center gap-2">
                {hasDiferencia ? (
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                ) : (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                )}
                <span className={`font-medium ${hasDiferencia ? 'text-red-700' : 'text-green-700'}`}>
                  Diferencia
                </span>
              </div>
              <span className={`font-bold ${hasDiferencia ? 'text-red-700' : 'text-green-700'}`}>
                {formatCurrency(closing.diferencia)}
              </span>
            </div>

            {closing.diferencia_justificacion && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs font-medium text-muted-foreground mb-1">Justificacion:</p>
                <p className="text-sm">{closing.diferencia_justificacion}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Notes */}
      {closing.notas && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Notas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{closing.notas}</p>
          </CardContent>
        </Card>
      )}

      {/* Payments List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Pagos del Dia ({payments.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay pagos registrados para este dia</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 font-medium">Factura</th>
                    <th className="text-left py-2 font-medium">Paciente</th>
                    <th className="text-right py-2 font-medium">Total</th>
                    <th className="text-left py-2 font-medium">Metodos</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment: {
                    id: string
                    numero_factura: string
                    total: number
                    descuento: number
                    estado: string
                    patients: { nombre: string; apellido: string; cedula: string }
                    payment_methods: { metodo: string; monto: number }[]
                  }) => (
                    <tr key={payment.id} className="border-b last:border-0">
                      <td className="py-2">
                        <Link
                          href={`/pagos/${payment.id}`}
                          className="font-mono text-primary hover:underline"
                        >
                          {payment.numero_factura}
                        </Link>
                        {payment.estado === 'anulado' && (
                          <Badge variant="destructive" className="ml-2 text-xs">Anulado</Badge>
                        )}
                      </td>
                      <td className="py-2">
                        {payment.patients.nombre} {payment.patients.apellido}
                      </td>
                      <td className="py-2 text-right font-medium">
                        {formatCurrency(payment.total)}
                        {payment.descuento > 0 && (
                          <span className="text-xs text-amber-600 ml-1">
                            (-{formatCurrency(payment.descuento)})
                          </span>
                        )}
                      </td>
                      <td className="py-2">
                        <div className="flex flex-wrap gap-1">
                          {payment.payment_methods.map((pm, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {pm.metodo}: {formatCurrency(pm.monto)}
                            </Badge>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Photo */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Foto del Reporte Firmado</CardTitle>
        </CardHeader>
        <CardContent>
          {photoUrl ? (
            <div className="relative w-full max-w-md">
              <Image
                src={photoUrl}
                alt="Reporte firmado"
                width={400}
                height={300}
                className="rounded-lg border object-cover"
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No hay foto disponible</p>
          )}
        </CardContent>
      </Card>

      {/* Print Report */}
      <ClosingPrintReport closing={closing} />

      {/* Audit info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Informacion de Auditoria</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Creado</span>
            <span>{formatDateTime(closing.created_at)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Ultima actualizacion</span>
            <span>{formatDateTime(closing.updated_at)}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

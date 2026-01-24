import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getPaymentWithDetails } from '@/lib/queries/payments'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { AnulacionDialog } from '@/components/payments/anulacion-dialog'
import { PAYMENT_METHOD_LABELS } from '@/types/payments'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

interface PaymentDetailPageProps {
  params: Promise<{ id: string }>
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(amount)

const formatDate = (dateStr: string) =>
  new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'full',
    timeStyle: 'short'
  }).format(new Date(dateStr))

async function canAnular(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const role = user.app_metadata?.role
  return role === 'admin' || role === 'medico'
}

export default async function PaymentDetailPage({ params }: PaymentDetailPageProps) {
  const { id } = await params
  const [payment, userCanAnular] = await Promise.all([
    getPaymentWithDetails(id),
    canAnular()
  ])

  if (!payment) {
    notFound()
  }

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
            <BreadcrumbLink href="/pagos">Pagos</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{payment.numero_factura}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight font-mono">
              {payment.numero_factura}
            </h1>
            <Badge variant={payment.estado === 'activo' ? 'default' : 'destructive'}>
              {payment.estado === 'activo' ? 'Activo' : 'Anulado'}
            </Badge>
          </div>
          <p className="text-muted-foreground">
            {formatDate(payment.created_at)}
          </p>
        </div>

        {userCanAnular && payment.estado === 'activo' && (
          <AnulacionDialog
            paymentId={payment.id}
            numeroFactura={payment.numero_factura}
          />
        )}
      </div>

      {/* Anulacion info */}
      {payment.estado === 'anulado' && payment.anulacion_justificacion && (
        <Card className="border-destructive">
          <CardHeader className="pb-2">
            <CardTitle className="text-destructive">Pago Anulado</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{payment.anulacion_justificacion}</p>
            <p className="text-xs text-muted-foreground mt-2">
              Anulado el {payment.anulado_at ? formatDate(payment.anulado_at) : 'N/A'}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Patient info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Paciente</CardTitle>
          </CardHeader>
          <CardContent>
            <Link href={`/pacientes/${payment.patient_id}`} className="hover:underline font-medium">
              {payment.patients.nombre} {payment.patients.apellido}
            </Link>
            <p className="text-sm text-muted-foreground">{payment.patients.cedula}</p>
          </CardContent>
        </Card>

        {/* Total */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{formatCurrency(payment.total)}</p>
            {payment.descuento > 0 && (
              <p className="text-sm text-amber-600">
                Descuento: -{formatCurrency(payment.descuento)}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Servicios</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {payment.payment_items.map(item => (
              <div key={item.id} className="flex justify-between">
                <span>
                  {item.service_name}
                  {item.quantity > 1 && ` x${item.quantity}`}
                </span>
                <span className="font-medium">{formatCurrency(item.subtotal)}</span>
              </div>
            ))}
            <Separator />
            <div className="flex justify-between font-medium">
              <span>Subtotal</span>
              <span>{formatCurrency(payment.subtotal)}</span>
            </div>
            {payment.descuento > 0 && (
              <>
                <div className="flex justify-between text-amber-600">
                  <span>Descuento</span>
                  <span>-{formatCurrency(payment.descuento)}</span>
                </div>
                {payment.descuento_justificacion && (
                  <p className="text-xs text-muted-foreground italic">
                    &quot;{payment.descuento_justificacion}&quot;
                  </p>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Payment methods */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Metodos de Pago</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {payment.payment_methods.map(method => (
              <div key={method.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span>{PAYMENT_METHOD_LABELS[method.metodo]}</span>
                  {method.comprobante_path && (
                    <Badge variant="outline" className="text-xs">
                      Con comprobante
                    </Badge>
                  )}
                </div>
                <span className="font-medium">{formatCurrency(method.monto)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

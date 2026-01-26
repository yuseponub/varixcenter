import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getSaleById } from '@/lib/queries/medias/sales'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ReceiptPreview } from '@/components/medias/sales/receipt-preview'
import { DeleteSaleDialog } from '@/components/medias/sales/delete-sale-dialog'
import { PAYMENT_METHOD_LABELS } from '@/types/medias/sales'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

interface SaleDetailPageProps {
  params: Promise<{ id: string }>
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(amount)

const formatDate = (dateStr: string) =>
  new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date(dateStr))

async function getUserRole(): Promise<string> {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) return 'none'

  try {
    const payload = JSON.parse(
      Buffer.from(session.access_token.split('.')[1], 'base64').toString()
    )
    return payload.app_metadata?.role ?? 'none'
  } catch {
    return 'none'
  }
}

async function isAdmin(): Promise<boolean> {
  const role = await getUserRole()
  return role === 'admin'
}

export default async function SaleDetailPage({ params }: SaleDetailPageProps) {
  const { id } = await params
  const [sale, userIsAdmin] = await Promise.all([getSaleById(id), isAdmin()])

  if (!sale) {
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
            <BreadcrumbLink href="/medias/ventas">Ventas Medias</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{sale.numero_venta}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight font-mono">
              {sale.numero_venta}
            </h1>
            <Badge variant={sale.estado === 'activo' ? 'default' : 'destructive'}>
              {sale.estado === 'activo' ? 'Activo' : 'Anulado'}
            </Badge>
          </div>
          <p className="text-muted-foreground">{formatDate(sale.created_at)}</p>
        </div>

        {/* Admin delete button - only for active sales */}
        {userIsAdmin && sale.estado === 'activo' && (
          <DeleteSaleDialog
            saleId={sale.id}
            numeroVenta={sale.numero_venta}
          />
        )}
      </div>

      {/* Anulacion info */}
      {sale.estado === 'anulado' && sale.eliminacion_justificacion && (
        <Card className="border-destructive">
          <CardHeader className="pb-2">
            <CardTitle className="text-destructive">Venta Anulada</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{sale.eliminacion_justificacion}</p>
            <p className="text-xs text-muted-foreground mt-2">
              Anulada el{' '}
              {sale.eliminado_at ? formatDate(sale.eliminado_at) : 'N/A'}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column - Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Patient info */}
          {sale.patient && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Cliente</CardTitle>
              </CardHeader>
              <CardContent>
                <Link
                  href={`/pacientes/${sale.patient.id}`}
                  className="hover:underline font-medium"
                >
                  {`${sale.patient.nombre} ${sale.patient.apellido}`}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {sale.patient.cedula}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Items */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Productos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {sale.items.map((item) => (
                  <div key={item.id} className="flex justify-between">
                    <span>
                      {item.product_tipo} {item.product_talla}
                      {item.quantity > 1 && ` x${item.quantity}`}
                    </span>
                    <span className="font-medium">
                      {formatCurrency(item.subtotal)}
                    </span>
                  </div>
                ))}
                <Separator />
                <div className="flex justify-between font-medium">
                  <span>Subtotal</span>
                  <span>{formatCurrency(sale.subtotal)}</span>
                </div>
                <div className="flex justify-between font-bold text-lg">
                  <span>Total</span>
                  <span>{formatCurrency(sale.total)}</span>
                </div>
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
                {sale.methods.map((method) => (
                  <div
                    key={method.id}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <span>{PAYMENT_METHOD_LABELS[method.metodo]}</span>
                      {method.comprobante_path && (
                        <Badge variant="outline" className="text-xs">
                          Con comprobante
                        </Badge>
                      )}
                    </div>
                    <span className="font-medium">
                      {formatCurrency(method.monto)}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right column - Receipt preview */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recibo</CardTitle>
            </CardHeader>
            <CardContent>
              <ReceiptPreview sale={sale} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

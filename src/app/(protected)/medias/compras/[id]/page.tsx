import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ArrowLeft, FileText, PackageCheck, Trash2 } from 'lucide-react'
import { getPurchaseById, getInvoicePublicUrl } from '@/lib/queries/medias-purchases'
import { PurchaseStatusBadge } from '@/components/medias/compras/purchase-status-badge'
import { PurchaseDetailActions } from './purchase-detail-actions'

export const metadata: Metadata = {
  title: 'Detalle de Compra | VarixClinic',
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function CompraDetailPage({ params }: PageProps) {
  const { id } = await params
  const purchase = await getPurchaseById(id)

  if (!purchase) {
    notFound()
  }

  const invoiceUrl = purchase.factura_path
    ? await getInvoicePublicUrl(purchase.factura_path)
    : null

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(amount)
  }

  return (
    <div className="container mx-auto py-6 max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/medias/compras">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold font-mono">
              {purchase.numero_compra}
            </h1>
            <p className="text-gray-500">
              {format(new Date(purchase.created_at), "dd 'de' MMMM, yyyy", {
                locale: es,
              })}
            </p>
          </div>
        </div>
        <PurchaseStatusBadge estado={purchase.estado} />
      </div>

      {/* Actions (client component) */}
      <PurchaseDetailActions
        purchaseId={purchase.id}
        numeroCompra={purchase.numero_compra}
        estado={purchase.estado}
        itemCount={purchase.items.length}
      />

      {/* Purchase Info */}
      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Informacion de Factura</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm text-gray-500">Proveedor</p>
              <p className="font-medium">{purchase.proveedor}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Fecha de Factura</p>
              <p className="font-medium">
                {format(new Date(purchase.fecha_factura), 'dd/MM/yyyy')}
              </p>
            </div>
            {purchase.numero_factura && (
              <div>
                <p className="text-sm text-gray-500">Numero de Factura</p>
                <p className="font-medium">{purchase.numero_factura}</p>
              </div>
            )}
            <div>
              <p className="text-sm text-gray-500">Total</p>
              <p className="text-xl font-bold">{formatCurrency(purchase.total)}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Documento</CardTitle>
          </CardHeader>
          <CardContent>
            {invoiceUrl ? (
              <a
                href={invoiceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-4 border rounded-lg hover:bg-gray-50 transition-colors"
              >
                <FileText className="h-10 w-10 text-red-500" />
                <div>
                  <p className="font-medium">Ver Factura</p>
                  <p className="text-sm text-gray-500">
                    Abrir en nueva pestana
                  </p>
                </div>
              </a>
            ) : (
              <p className="text-gray-500">No hay documento adjunto</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Reception Info (if received) */}
      {purchase.estado === 'recibido' && purchase.recibido_at && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PackageCheck className="h-5 w-5 text-green-600" />
              Recepcion Confirmada
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500">
              Confirmado el{' '}
              {format(new Date(purchase.recibido_at), "dd/MM/yyyy 'a las' HH:mm", {
                locale: es,
              })}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Anulacion Info (if cancelled) */}
      {purchase.estado === 'anulado' && purchase.anulado_at && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-700">
              <Trash2 className="h-5 w-5" />
              Compra Anulada
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              Anulada el{' '}
              {format(new Date(purchase.anulado_at), "dd/MM/yyyy 'a las' HH:mm", {
                locale: es,
              })}
            </p>
            {purchase.anulacion_justificacion && (
              <p className="mt-2 text-sm">
                <span className="font-medium">Motivo:</span>{' '}
                {purchase.anulacion_justificacion}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Items Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            Productos ({purchase.items.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Codigo</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Talla</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead className="text-right">Costo Unit.</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchase.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-mono">{item.product_codigo}</TableCell>
                  <TableCell>{item.product_tipo}</TableCell>
                  <TableCell>{item.product_talla}</TableCell>
                  <TableCell className="text-right">{item.cantidad}</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(item.costo_unitario)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(item.subtotal)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Notes */}
      {purchase.notas && (
        <Card>
          <CardHeader>
            <CardTitle>Notas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap">{purchase.notas}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

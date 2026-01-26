import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  ArrowLeft,
  Banknote,
  CreditCard,
  Building2,
  Smartphone,
  AlertTriangle,
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  getMediasCierreById,
  getMediasSalesForDate,
} from '@/lib/queries/medias/cierres'
import { createClient } from '@/lib/supabase/server'
import { CIERRE_ESTADO_LABELS, CIERRE_ESTADO_VARIANTS } from '@/types'
import { MediasReopenDialog } from '@/components/medias/cierres/reopen-dialog'
import { PrintButton } from '@/components/medias/cierres/print-button'

export const metadata = {
  title: 'Detalle de Cierre - Medias | VarixClinic',
  description: 'Detalle del cierre de caja de medias',
}

interface Props {
  params: Promise<{ id: string }>
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(amount)

export default async function MediasCierreDetailPage({ params }: Props) {
  const { id } = await params
  const cierre = await getMediasCierreById(id)

  if (!cierre) {
    notFound()
  }

  // Fetch sales for this date
  const sales = await getMediasSalesForDate(cierre.fecha_cierre)

  // Check if user is admin
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let isAdmin = false
  if (user) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: roleData } = await (supabase as any)
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single()
    isAdmin = roleData?.role === 'admin'
  }

  // Get signed URL for photo
  let photoUrl: string | null = null
  if (cierre.cierre_photo_path) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: signedUrlData } = await (supabase as any).storage
      .from('cierres')
      .createSignedUrl(cierre.cierre_photo_path, 3600)
    photoUrl = signedUrlData?.signedUrl || null
  }

  return (
    <div className="space-y-6">
      {/* Header - buttons hidden in print */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild className="no-print">
            <Link href="/medias/cierres">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Volver
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Cierre {cierre.cierre_numero}
            </h1>
            <p className="text-muted-foreground">
              {format(new Date(cierre.fecha_cierre), 'EEEE, dd MMMM yyyy', {
                locale: es,
              })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={CIERRE_ESTADO_VARIANTS[cierre.estado]}>
            {CIERRE_ESTADO_LABELS[cierre.estado]}
          </Badge>
          <div className="no-print">
            <PrintButton />
          </div>
          {isAdmin && cierre.estado === 'cerrado' && (
            <div className="no-print">
              <MediasReopenDialog
                cierreId={cierre.id}
                cierreNumero={cierre.cierre_numero}
              />
            </div>
          )}
        </div>
      </div>

      {/* Totals */}
      <Card>
        <CardHeader>
          <CardTitle>Resumen de Ventas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-2">
              <Banknote className="h-4 w-4 text-green-600" />
              <div>
                <p className="text-xs text-muted-foreground">Efectivo</p>
                <p className="font-medium">
                  {formatCurrency(cierre.total_efectivo)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-blue-600" />
              <div>
                <p className="text-xs text-muted-foreground">Tarjeta</p>
                <p className="font-medium">
                  {formatCurrency(cierre.total_tarjeta)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-purple-600" />
              <div>
                <p className="text-xs text-muted-foreground">Transferencia</p>
                <p className="font-medium">
                  {formatCurrency(cierre.total_transferencia)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-teal-600" />
              <div>
                <p className="text-xs text-muted-foreground">Nequi</p>
                <p className="font-medium">
                  {formatCurrency(cierre.total_nequi)}
                </p>
              </div>
            </div>
          </div>

          <Separator />

          <div className="flex justify-between items-center">
            <span className="font-medium">Total del Dia</span>
            <span className="text-xl font-bold">
              {formatCurrency(cierre.grand_total)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Cash reconciliation */}
      <Card>
        <CardHeader>
          <CardTitle>Reconciliacion de Efectivo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Efectivo Esperado</p>
              <p className="font-medium">
                {formatCurrency(cierre.total_efectivo)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Conteo Fisico</p>
              <p className="font-medium">
                {formatCurrency(cierre.conteo_fisico_efectivo)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Diferencia</p>
              <p
                className={`font-medium ${
                  cierre.diferencia !== 0 ? 'text-red-600' : 'text-green-600'
                }`}
              >
                {formatCurrency(cierre.diferencia)}
              </p>
            </div>
          </div>

          {cierre.diferencia !== 0 && cierre.diferencia_justificacion && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-700">
                    Justificacion de Diferencia
                  </p>
                  <p className="text-sm text-red-600 mt-1">
                    {cierre.diferencia_justificacion}
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Photo */}
      {photoUrl && (
        <Card>
          <CardHeader>
            <CardTitle>Foto del Cierre</CardTitle>
          </CardHeader>
          <CardContent>
            <Image
              src={photoUrl}
              alt="Foto del cierre"
              width={400}
              height={300}
              className="rounded-lg border"
            />
          </CardContent>
        </Card>
      )}

      {/* Reopen info */}
      {cierre.estado === 'reabierto' && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <CardTitle className="text-amber-800">Cierre Reabierto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-amber-700">
              <strong>Reabierto:</strong>{' '}
              {cierre.reopened_at
                ? format(new Date(cierre.reopened_at), 'dd/MM/yyyy HH:mm', {
                    locale: es,
                  })
                : 'N/A'}
            </p>
            <p className="text-sm text-amber-700">
              <strong>Justificacion:</strong> {cierre.reopen_justificacion}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Notes */}
      {cierre.notas && (
        <Card>
          <CardHeader>
            <CardTitle>Notas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{cierre.notas}</p>
          </CardContent>
        </Card>
      )}

      {/* Sales list */}
      <Card>
        <CardHeader>
          <CardTitle>Ventas del Dia ({sales.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {sales.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">
              No hay ventas registradas para esta fecha
            </p>
          ) : (
            <div className="space-y-2">
              {sales.map((sale: {
                id: string
                numero_venta: string
                total: number
                estado: string
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                patients?: any
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                medias_sale_methods?: any[]
              }) => (
                <div
                  key={sale.id}
                  className="flex justify-between items-center p-2 border rounded"
                >
                  <div>
                    <span className="font-mono text-sm">
                      {sale.numero_venta}
                    </span>
                    {sale.patients && (
                      <span className="text-sm text-muted-foreground ml-2">
                        - {sale.patients.nombre} {sale.patients.apellido}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-medium ${
                        sale.estado === 'anulado'
                          ? 'text-red-500 line-through'
                          : ''
                      }`}
                    >
                      {formatCurrency(sale.total)}
                    </span>
                    {sale.estado === 'anulado' && (
                      <Badge variant="destructive" className="text-xs">
                        Anulada
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

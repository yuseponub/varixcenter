import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { getReturnById } from '@/lib/queries/medias/returns'
import { createClient } from '@/lib/supabase/server'
import { ReturnStatusBadge } from '@/components/medias/returns/return-status-badge'
import { ApproveDialog } from '@/components/medias/returns/approve-dialog'
import { RejectDialog } from '@/components/medias/returns/reject-dialog'
import { REEMBOLSO_METODO_LABELS } from '@/types/medias/returns'

export const metadata = {
  title: 'Detalle Devolucion | Varix Medias',
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

export default async function ReturnDetailPage({ params }: Props) {
  const { id } = await params
  const [ret, userRole] = await Promise.all([
    getReturnById(id),
    getUserRole(),
  ])

  if (!ret) {
    notFound()
  }

  const canApprove = ['admin', 'medico'].includes(userRole)

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/dashboard">Inicio</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/medias/devoluciones">Devoluciones</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{ret.numero_devolucion}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/medias/devoluciones">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight font-mono">
                {ret.numero_devolucion}
              </h1>
              <ReturnStatusBadge estado={ret.estado} />
            </div>
            <p className="text-muted-foreground">
              Solicitada el {format(new Date(ret.created_at), "d 'de' MMMM, yyyy HH:mm", { locale: es })}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Return Details */}
        <Card>
          <CardHeader>
            <CardTitle>Detalles de la Devolucion</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Venta Original</p>
              <Link
                href={`/medias/ventas/${ret.sale_id}`}
                className="font-mono hover:underline flex items-center gap-1 text-primary"
              >
                {ret.sale?.numero_venta || 'N/A'}
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Producto</p>
              <p className="font-medium">
                {ret.product_codigo} - {ret.product_tipo} {ret.product_talla}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Cantidad</p>
                <p className="font-medium">{ret.cantidad}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Monto</p>
                <p className="font-medium text-lg">{formatCurrency(ret.monto_devolucion)}</p>
              </div>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Metodo de Reembolso</p>
              <p className="font-medium">{REEMBOLSO_METODO_LABELS[ret.metodo_reembolso]}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Motivo</p>
              <p className="text-sm bg-muted p-3 rounded-md">{ret.motivo}</p>
            </div>
            {ret.foto_path && (
              <div>
                <p className="text-sm text-muted-foreground">Foto</p>
                <p className="text-sm text-muted-foreground italic">Foto adjunta</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Approval Info */}
        <Card>
          <CardHeader>
            <CardTitle>Estado de Aprobacion</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Solicitante</p>
              <p className="font-medium">{ret.solicitante?.email || 'Desconocido'}</p>
            </div>

            {ret.estado === 'pendiente' ? (
              canApprove ? (
                <div className="space-y-4">
                  <div className="rounded-lg border border-dashed p-4 text-center">
                    <p className="text-sm text-muted-foreground mb-4">
                      Esta devolucion requiere aprobacion
                    </p>
                    <div className="flex justify-center gap-2">
                      <ApproveDialog returnId={ret.id} numeroDevolucion={ret.numero_devolucion} />
                      <RejectDialog returnId={ret.id} numeroDevolucion={ret.numero_devolucion} />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-4 text-center">
                  <p className="text-muted-foreground italic">
                    Esperando aprobacion de Admin o Medico
                  </p>
                </div>
              )
            ) : (
              <>
                <div>
                  <p className="text-sm text-muted-foreground">
                    {ret.estado === 'aprobada' ? 'Aprobado por' : 'Rechazado por'}
                  </p>
                  <p className="font-medium">{ret.aprobador?.email || 'Desconocido'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Fecha</p>
                  <p className="font-medium">
                    {ret.aprobado_at
                      ? format(new Date(ret.aprobado_at), "d 'de' MMMM, yyyy HH:mm", { locale: es })
                      : 'N/A'}
                  </p>
                </div>
                {ret.notas_aprobador && (
                  <div>
                    <p className="text-sm text-muted-foreground">Notas del aprobador</p>
                    <p className="text-sm bg-muted p-3 rounded-md">{ret.notas_aprobador}</p>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

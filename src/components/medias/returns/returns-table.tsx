'use client'

import Link from 'next/link'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Eye } from 'lucide-react'
import { ReturnStatusBadge } from './return-status-badge'
import { ApproveDialog } from './approve-dialog'
import { RejectDialog } from './reject-dialog'
import {
  type MediasReturnWithDetails,
  REEMBOLSO_METODO_LABELS,
} from '@/types/medias/returns'

interface ReturnsTableProps {
  returns: MediasReturnWithDetails[]
  userRole: string
  showActions?: boolean
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(amount)

/**
 * Table component displaying returns with status badges and action buttons
 * Approve/reject buttons only shown for admin/medico users and pendiente returns
 */
export function ReturnsTable({
  returns,
  userRole,
  showActions = true,
}: ReturnsTableProps) {
  const canApprove = ['admin', 'medico'].includes(userRole)

  if (returns.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No hay devoluciones registradas
      </div>
    )
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Numero</TableHead>
            <TableHead>Venta</TableHead>
            <TableHead>Producto</TableHead>
            <TableHead className="text-right">Cantidad</TableHead>
            <TableHead className="text-right">Monto</TableHead>
            <TableHead>Reembolso</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Fecha</TableHead>
            {showActions && <TableHead className="text-right">Acciones</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {returns.map((ret) => (
            <TableRow key={ret.id}>
              <TableCell className="font-mono font-medium">
                {ret.numero_devolucion}
              </TableCell>
              <TableCell>
                <Link
                  href={`/medias/ventas/${ret.sale_id}`}
                  className="hover:underline text-primary"
                >
                  {ret.sale?.numero_venta || '-'}
                </Link>
              </TableCell>
              <TableCell>
                {ret.product_codigo} - {ret.product_tipo} {ret.product_talla}
              </TableCell>
              <TableCell className="text-right">{ret.cantidad}</TableCell>
              <TableCell className="text-right font-medium">
                {formatCurrency(ret.monto_devolucion)}
              </TableCell>
              <TableCell>
                {REEMBOLSO_METODO_LABELS[ret.metodo_reembolso]}
              </TableCell>
              <TableCell>
                <ReturnStatusBadge estado={ret.estado} />
              </TableCell>
              <TableCell>
                {format(new Date(ret.created_at), 'dd/MM/yyyy', { locale: es })}
              </TableCell>
              {showActions && (
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" asChild>
                      <Link href={`/medias/devoluciones/${ret.id}`}>
                        <Eye className="h-4 w-4" />
                      </Link>
                    </Button>
                    {canApprove && ret.estado === 'pendiente' && (
                      <>
                        <ApproveDialog
                          returnId={ret.id}
                          numeroDevolucion={ret.numero_devolucion}
                        />
                        <RejectDialog
                          returnId={ret.id}
                          numeroDevolucion={ret.numero_devolucion}
                        />
                      </>
                    )}
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

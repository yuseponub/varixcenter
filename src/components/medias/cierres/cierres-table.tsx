'use client'

import Link from 'next/link'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Eye } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { MediasCierre } from '@/types/medias/cierres'
import { CIERRE_ESTADO_LABELS, CIERRE_ESTADO_VARIANTS } from '@/types/medias/cierres'
import { MediasReopenDialog } from './reopen-dialog'

interface MediasCierresTableProps {
  closings: MediasCierre[]
  isAdmin?: boolean
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(amount)

export function MediasCierresTable({
  closings,
  isAdmin = false,
}: MediasCierresTableProps) {
  if (closings.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        No hay cierres de medias registrados
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Numero</TableHead>
          <TableHead>Fecha</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead className="text-right">Diferencia</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {closings.map((cierre) => (
          <TableRow key={cierre.id}>
            <TableCell className="font-mono">{cierre.cierre_numero}</TableCell>
            <TableCell>
              {format(new Date(cierre.fecha_cierre), 'dd MMM yyyy', {
                locale: es,
              })}
            </TableCell>
            <TableCell className="text-right">
              {formatCurrency(cierre.grand_total)}
            </TableCell>
            <TableCell
              className={`text-right ${
                cierre.diferencia !== 0 ? 'text-red-600 font-medium' : ''
              }`}
            >
              {formatCurrency(cierre.diferencia)}
            </TableCell>
            <TableCell>
              <Badge variant={CIERRE_ESTADO_VARIANTS[cierre.estado]}>
                {CIERRE_ESTADO_LABELS[cierre.estado]}
              </Badge>
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/medias/cierres/${cierre.id}`}>
                    <Eye className="h-4 w-4" />
                  </Link>
                </Button>
                {isAdmin && cierre.estado === 'cerrado' && (
                  <MediasReopenDialog
                    cierreId={cierre.id}
                    cierreNumero={cierre.cierre_numero}
                  />
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

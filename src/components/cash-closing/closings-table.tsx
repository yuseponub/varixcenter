'use client'

import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Eye } from 'lucide-react'
import type { CashClosing } from '@/types'
import { CIERRE_ESTADO_LABELS, CIERRE_ESTADO_VARIANTS } from '@/types'

interface ClosingsTableProps {
  closings: CashClosing[]
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(amount)

const formatDate = (dateStr: string) =>
  new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium'
  }).format(new Date(dateStr + 'T12:00:00'))

export function ClosingsTable({ closings }: ClosingsTableProps) {
  if (closings.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No hay cierres registrados
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
          <TableHead className="text-right">Efectivo</TableHead>
          <TableHead className="text-right">Diferencia</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead className="w-[80px]"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {closings.map(closing => (
          <TableRow
            key={closing.id}
            className={closing.estado === 'reabierto' ? 'bg-amber-50' : ''}
          >
            <TableCell className="font-mono text-sm">
              {closing.cierre_numero}
            </TableCell>
            <TableCell className="text-sm">
              {formatDate(closing.fecha_cierre)}
            </TableCell>
            <TableCell className="text-right font-medium">
              {formatCurrency(closing.grand_total)}
            </TableCell>
            <TableCell className="text-right">
              {formatCurrency(closing.total_efectivo)}
            </TableCell>
            <TableCell className={`text-right ${closing.diferencia !== 0 ? 'text-red-600' : 'text-green-600'}`}>
              {formatCurrency(closing.diferencia)}
            </TableCell>
            <TableCell>
              <Badge variant={CIERRE_ESTADO_VARIANTS[closing.estado]}>
                {CIERRE_ESTADO_LABELS[closing.estado]}
              </Badge>
            </TableCell>
            <TableCell>
              <Button asChild variant="ghost" size="icon">
                <Link href={`/cierres/${closing.id}`}>
                  <Eye className="h-4 w-4" />
                  <span className="sr-only">Ver detalle</span>
                </Link>
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

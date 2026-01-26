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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Eye } from 'lucide-react'
import type { MediasSaleWithDetails } from '@/types/medias/sales'

interface SalesTableProps {
  sales: MediasSaleWithDetails[]
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(amount)

export function SalesTable({ sales }: SalesTableProps) {
  if (sales.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No hay ventas registradas
      </div>
    )
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>No. Venta</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead>Paciente</TableHead>
            <TableHead>Items</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sales.map((sale) => (
            <TableRow key={sale.id}>
              <TableCell className="font-medium">{sale.numero_venta}</TableCell>
              <TableCell>
                {format(new Date(sale.created_at), 'dd MMM yyyy HH:mm', {
                  locale: es,
                })}
              </TableCell>
              <TableCell>
                {sale.patient?.nombre_completo || (
                  <span className="text-muted-foreground">Sin paciente</span>
                )}
              </TableCell>
              <TableCell>
                {sale.items.length} producto(s)
              </TableCell>
              <TableCell className="text-right font-medium">
                {formatCurrency(sale.total)}
              </TableCell>
              <TableCell>
                <Badge
                  variant={sale.estado === 'activo' ? 'default' : 'destructive'}
                >
                  {sale.estado === 'activo' ? 'Activo' : 'Anulado'}
                </Badge>
              </TableCell>
              <TableCell>
                <Button variant="ghost" size="icon" asChild>
                  <Link href={`/medias/ventas/${sale.id}`}>
                    <Eye className="h-4 w-4" />
                  </Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

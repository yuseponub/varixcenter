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
import type { AttendanceComparisonItem } from '@/types'

interface AtendidosTableProps {
  items: AttendanceComparisonItem[]
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(amount)

const formatTime = (timeStr: string) => timeStr.substring(0, 5)

export function AtendidosTable({ items }: AtendidosTableProps) {
  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No hay pacientes atendidos hoy
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Paciente</TableHead>
          <TableHead>Cedula</TableHead>
          <TableHead>Hora</TableHead>
          <TableHead>Marcado Por</TableHead>
          <TableHead>Estado Pago</TableHead>
          <TableHead className="text-right">Monto</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.attendance_id}>
            <TableCell className="font-medium">
              <Link
                href={`/pacientes/${item.patient_id}`}
                className="hover:underline"
              >
                {item.patient_nombre} {item.patient_apellido}
              </Link>
            </TableCell>
            <TableCell>{item.patient_cedula}</TableCell>
            <TableCell>{formatTime(item.hora_atendido)}</TableCell>
            <TableCell>
              {item.marked_by_nombre} {item.marked_by_apellido}
            </TableCell>
            <TableCell>
              {item.tiene_pago ? (
                <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                  Pagado
                </Badge>
              ) : (
                <Badge variant="destructive">
                  Sin Pago
                </Badge>
              )}
            </TableCell>
            <TableCell className="text-right">
              {item.tiene_pago && item.payment_total ? (
                <Link
                  href={`/pagos/${item.payment_id}`}
                  className="hover:underline"
                >
                  {formatCurrency(item.payment_total)}
                </Link>
              ) : (
                <span className="text-muted-foreground">-</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

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
import { PAYMENT_METHOD_LABELS, type PaymentWithDetails } from '@/types/payments'
import { CreateWimaxInvoiceDialog } from '@/components/payments/create-wimax-invoice-dialog'

interface PaymentsTableProps {
  payments: PaymentWithDetails[]
  canManageWimax: boolean
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(amount)

const formatDate = (dateStr: string) =>
  new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(dateStr))

export function PaymentsTable({ payments, canManageWimax }: PaymentsTableProps) {
  if (payments.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No hay pagos registrados
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Factura</TableHead>
          <TableHead>Paciente</TableHead>
          <TableHead>Fecha</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead>Método de pago</TableHead>
          <TableHead>Notas</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Factura DIAN</TableHead>
          <TableHead className="w-[80px]"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {payments.map(payment => (
          <TableRow
            key={payment.id}
            className={payment.estado === 'anulado' ? 'opacity-60' : ''}
          >
            <TableCell className="font-mono text-sm">
              {payment.numero_factura}
            </TableCell>
            <TableCell>
              <Link
                href={`/pacientes/${payment.patient_id}`}
                className="hover:underline"
              >
                {payment.patients.nombre} {payment.patients.apellido}
              </Link>
              <p className="text-xs text-muted-foreground">{payment.patients.cedula}</p>
            </TableCell>
            <TableCell className="text-sm">
              {formatDate(payment.created_at)}
            </TableCell>
            <TableCell className="text-right font-medium">
              {formatCurrency(payment.total)}
            </TableCell>
            <TableCell className="text-sm">
              {payment.payment_methods.length > 0
                ? payment.payment_methods
                    .map((m) => PAYMENT_METHOD_LABELS[m.metodo])
                    .join(' + ')
                : <span className="text-muted-foreground">—</span>}
            </TableCell>
            <TableCell
              className="max-w-[220px] truncate text-sm text-muted-foreground"
              title={payment.nota ?? undefined}
            >
              {payment.nota ?? <span>—</span>}
            </TableCell>
            <TableCell>
              <Badge variant={payment.estado === 'activo' ? 'default' : 'destructive'}>
                {payment.estado === 'activo' ? 'Activo' : 'Anulado'}
              </Badge>
            </TableCell>
            <TableCell>
              <CreateWimaxInvoiceDialog
                payment={payment}
                canManage={canManageWimax}
                autoRefresh={false}
              />
            </TableCell>
            <TableCell>
              <Button asChild variant="ghost" size="icon">
                <Link href={`/pagos/${payment.id}`}>
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

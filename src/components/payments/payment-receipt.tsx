'use client'

import { Button } from '@/components/ui/button'
import { Printer } from 'lucide-react'
import type { PaymentWithDetails } from '@/types/payments'
import { PAYMENT_METHOD_LABELS } from '@/types/payments'

interface PaymentReceiptProps {
  payment: PaymentWithDetails
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(amount)

const formatDate = (dateStr: string) =>
  new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(dateStr))

export function PaymentReceipt({ payment }: PaymentReceiptProps) {
  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="space-y-4">
      {/* Print button - hidden in print */}
      <div className="no-print">
        <Button onClick={handlePrint} variant="outline" size="sm">
          <Printer className="mr-2 h-4 w-4" />
          Imprimir Recibo
        </Button>
      </div>

      {/* Receipt content - optimized for 58mm thermal printer */}
      <div className="receipt bg-white text-black p-2 border rounded-lg">
        {/* Header */}
        <div className="text-center mb-3">
          <h1 className="text-lg font-bold">VARIX CENTER</h1>
          <p className="text-xs">Centro de Flebologia</p>
        </div>

        {/* Separator */}
        <div className="border-t border-dashed border-black my-2" />

        {/* Payment info */}
        <div className="text-xs space-y-1 mb-3">
          <div className="flex justify-between">
            <span>Factura:</span>
            <span className="font-bold">{payment.numero_factura}</span>
          </div>
          <div className="flex justify-between">
            <span>Fecha:</span>
            <span>{formatDate(payment.created_at)}</span>
          </div>
          <div className="flex justify-between">
            <span>Paciente:</span>
            <span className="truncate ml-2 max-w-[60%] text-right">
              {payment.patients.nombre} {payment.patients.apellido}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Cedula:</span>
            <span>{payment.patients.cedula}</span>
          </div>
        </div>

        {/* Separator */}
        <div className="border-t border-dashed border-black my-2" />

        {/* Items */}
        <div className="text-xs space-y-1 mb-3">
          {payment.payment_items.map((item) => (
            <div key={item.id} className="flex justify-between">
              <span>
                {item.service_name}
                {item.quantity > 1 && ` x${item.quantity}`}
              </span>
              <span>{formatCurrency(item.subtotal)}</span>
            </div>
          ))}
        </div>

        {/* Separator */}
        <div className="border-t border-dashed border-black my-2" />

        {/* Totals */}
        <div className="text-xs space-y-1 mb-1">
          <div className="flex justify-between">
            <span>Subtotal:</span>
            <span>{formatCurrency(payment.subtotal)}</span>
          </div>
          {payment.descuento > 0 && (
            <div className="flex justify-between">
              <span>Descuento:</span>
              <span>-{formatCurrency(payment.descuento)}</span>
            </div>
          )}
        </div>
        <div className="text-sm font-bold flex justify-between mb-3">
          <span>TOTAL:</span>
          <span>{formatCurrency(payment.total)}</span>
        </div>

        {/* Payment methods */}
        <div className="text-xs space-y-1 mb-3">
          <span className="font-medium">Pagos:</span>
          {payment.payment_methods.map((method) => (
            <div key={method.id} className="flex justify-between pl-2">
              <span>{PAYMENT_METHOD_LABELS[method.metodo]}</span>
              <span>{formatCurrency(method.monto)}</span>
            </div>
          ))}
        </div>

        {/* Separator */}
        <div className="border-t border-dashed border-black my-2" />

        {/* Footer */}
        <div className="text-center text-xs">
          <p>Gracias por su visita</p>
          <p className="mt-1 text-[10px] text-gray-600">
            Este documento no es factura legal
          </p>
        </div>
      </div>
    </div>
  )
}

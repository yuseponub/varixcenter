'use client'

import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Printer } from 'lucide-react'
import type { MediasSaleWithDetails } from '@/types/medias/sales'
import { PAYMENT_METHOD_LABELS } from '@/types/medias/sales'

interface ReceiptPreviewProps {
  sale: MediasSaleWithDetails
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

export function ReceiptPreview({ sale }: ReceiptPreviewProps) {
  const receiptRef = useRef<HTMLDivElement>(null)

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="space-y-4">
      {/* Print button - hidden in print */}
      <div className="no-print">
        <Button onClick={handlePrint} className="w-full">
          <Printer className="mr-2 h-4 w-4" />
          Imprimir Recibo
        </Button>
      </div>

      {/* Receipt content - optimized for 58mm thermal printer */}
      <div
        ref={receiptRef}
        className="receipt bg-white text-black p-2 border rounded-lg"
      >
        {/* Header */}
        <div className="text-center mb-3">
          <h1 className="text-lg font-bold">VARIX MEDIAS</h1>
          <p className="text-xs">Medias de Compresion</p>
        </div>

        {/* Separator */}
        <div className="border-t border-dashed border-black my-2" />

        {/* Sale info */}
        <div className="text-xs space-y-1 mb-3">
          <div className="flex justify-between">
            <span>Venta:</span>
            <span className="font-bold">{sale.numero_venta}</span>
          </div>
          <div className="flex justify-between">
            <span>Fecha:</span>
            <span>{formatDate(sale.created_at)}</span>
          </div>
          {sale.patient && (
            <div className="flex justify-between">
              <span>Cliente:</span>
              <span className="truncate ml-2 max-w-[60%] text-right">
                {`${sale.patient.nombre} ${sale.patient.apellido}`}
              </span>
            </div>
          )}
        </div>

        {/* Separator */}
        <div className="border-t border-dashed border-black my-2" />

        {/* Items */}
        <div className="text-xs space-y-1 mb-3">
          {sale.items.map((item) => (
            <div key={item.id} className="flex justify-between">
              <span>
                {item.product_tipo} {item.product_talla} x{item.quantity}
              </span>
              <span>{formatCurrency(item.subtotal)}</span>
            </div>
          ))}
        </div>

        {/* Separator */}
        <div className="border-t border-dashed border-black my-2" />

        {/* Total */}
        <div className="text-sm font-bold flex justify-between mb-3">
          <span>TOTAL:</span>
          <span>{formatCurrency(sale.total)}</span>
        </div>

        {/* Payment methods */}
        <div className="text-xs space-y-1 mb-3">
          <span className="font-medium">Pagos:</span>
          {sale.methods.map((method) => (
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
          <p>Gracias por su compra</p>
          <p className="mt-1 text-[10px] text-gray-600">
            Este documento no es factura legal
          </p>
        </div>
      </div>
    </div>
  )
}

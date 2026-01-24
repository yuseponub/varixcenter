'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { PAYMENT_METHOD_LABELS, type PaymentMethodInput } from '@/types/payments'
import type { PaymentItemInput } from '@/types/payments'

interface PaymentSummaryProps {
  items: PaymentItemInput[]
  methods: PaymentMethodInput[]
  descuento: number
  descuentoJustificacion: string | null
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(amount)

export function PaymentSummary({
  items,
  methods,
  descuento,
  descuentoJustificacion
}: PaymentSummaryProps) {
  const subtotal = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0)
  const total = subtotal - descuento
  const methodsTotal = methods.reduce((sum, m) => sum + m.monto, 0)
  const isBalanced = Math.abs(total - methodsTotal) < 0.01

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Resumen del Pago</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Services */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Servicios</p>
          {items.map((item, i) => (
            <div key={i} className="flex justify-between text-sm">
              <span>
                {item.service_name}
                {item.quantity > 1 && ` x${item.quantity}`}
              </span>
              <span>{formatCurrency(item.unit_price * item.quantity)}</span>
            </div>
          ))}
        </div>

        <Separator />

        {/* Subtotal */}
        <div className="flex justify-between text-sm">
          <span>Subtotal</span>
          <span>{formatCurrency(subtotal)}</span>
        </div>

        {/* Descuento */}
        {descuento > 0 && (
          <>
            <div className="flex justify-between text-sm text-amber-600">
              <span>Descuento</span>
              <span>-{formatCurrency(descuento)}</span>
            </div>
            {descuentoJustificacion && (
              <p className="text-xs text-muted-foreground italic">
                &quot;{descuentoJustificacion}&quot;
              </p>
            )}
          </>
        )}

        <Separator />

        {/* Total */}
        <div className="flex justify-between font-bold">
          <span>Total</span>
          <span>{formatCurrency(total)}</span>
        </div>

        <Separator />

        {/* Payment methods */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Metodos de Pago</p>
          {methods.map((method, i) => (
            <div key={i} className="flex justify-between items-center text-sm">
              <div className="flex items-center gap-2">
                <span>{PAYMENT_METHOD_LABELS[method.metodo]}</span>
                {method.comprobante_path && (
                  <Badge variant="outline" className="text-xs">
                    Con comprobante
                  </Badge>
                )}
              </div>
              <span>{formatCurrency(method.monto)}</span>
            </div>
          ))}
        </div>

        {/* Balance check */}
        {!isBalanced && (
          <div className="text-sm text-red-600 font-medium">
            {methodsTotal > total
              ? `Los metodos exceden el total por ${formatCurrency(methodsTotal - total)}`
              : `Faltan ${formatCurrency(total - methodsTotal)} por asignar`
            }
          </div>
        )}
      </CardContent>
    </Card>
  )
}

'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import type { CartItem, MediasSaleMethodInput } from '@/types/medias/sales'
import { PAYMENT_METHOD_LABELS } from '@/types/medias/sales'

interface SaleSummaryProps {
  cart: CartItem[]
  methods: MediasSaleMethodInput[]
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(amount)

export function SaleSummary({ cart, methods }: SaleSummaryProps) {
  const subtotal = cart.reduce((sum, item) => sum + item.subtotal, 0)
  const total = subtotal // No discounts in medias sales
  const methodsTotal = methods.reduce((sum, m) => sum + m.monto, 0)
  const difference = total - methodsTotal

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Resumen de Venta</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Items */}
        <div className="space-y-2">
          {cart.map((item) => (
            <div
              key={item.product_id}
              className="flex justify-between text-sm"
            >
              <span>
                {item.tipo} {item.talla} x{item.quantity}
              </span>
              <span>{formatCurrency(item.subtotal)}</span>
            </div>
          ))}
        </div>

        <Separator />

        {/* Subtotal/Total */}
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span>Subtotal</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          <div className="flex justify-between font-bold text-lg">
            <span>Total</span>
            <span>{formatCurrency(total)}</span>
          </div>
        </div>

        {/* Payment Methods */}
        {methods.length > 0 && (
          <>
            <Separator />
            <div className="space-y-1">
              <span className="text-sm font-medium">Pagos:</span>
              {methods.map((m, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span>{PAYMENT_METHOD_LABELS[m.metodo]}</span>
                  <span>{formatCurrency(m.monto)}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Difference warning */}
        {methods.length > 0 && Math.abs(difference) > 0.01 && (
          <div
            className={`text-sm font-medium ${
              difference > 0 ? 'text-amber-600' : 'text-red-600'
            }`}
          >
            {difference > 0
              ? `Falta por pagar: ${formatCurrency(difference)}`
              : `Excede el total: ${formatCurrency(Math.abs(difference))}`}
          </div>
        )}

        {/* Empty cart message */}
        {cart.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Seleccione productos para comenzar
          </p>
        )}
      </CardContent>
    </Card>
  )
}

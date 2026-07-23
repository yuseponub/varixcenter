'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Banknote, CreditCard, Building2, Smartphone, Tag, XCircle } from 'lucide-react'
import type { ClosingSummary } from '@/types'

interface ClosingSummaryCardProps {
  summary: ClosingSummary
  conteoFisico?: number
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(amount)

export function ClosingSummaryCard({ summary, conteoFisico }: ClosingSummaryCardProps) {
  const diferencia = conteoFisico !== undefined ? conteoFisico - summary.total_efectivo : null
  const hasDiferencia = diferencia !== null && diferencia !== 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Resumen del Dia</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Payment count */}
        <p className="text-sm text-muted-foreground">
          {summary.payment_count} pagos registrados
        </p>

        {/* Totals by method */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-2">
            <Banknote className="h-4 w-4 text-success-foreground" />
            <span className="text-sm">Efectivo</span>
          </div>
          <span className="text-right font-medium">{formatCurrency(summary.total_efectivo)}</span>

          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary" />
            <span className="text-sm">Tarjeta</span>
          </div>
          <span className="text-right font-medium">{formatCurrency(summary.total_tarjeta)}</span>

          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-[oklch(0.45_0.12_210)]" />
            <span className="text-sm">Transferencia</span>
          </div>
          <span className="text-right font-medium">{formatCurrency(summary.total_transferencia)}</span>

          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-primary" />
            <span className="text-sm">Nequi</span>
          </div>
          <span className="text-right font-medium">{formatCurrency(summary.total_nequi)}</span>
        </div>

        <Separator />

        {/* Total */}
        <div className="flex justify-between items-center">
          <span className="font-medium">Total Recaudado</span>
          <span className="text-xl font-bold">{formatCurrency(summary.grand_total)}</span>
        </div>

        {/* Discounts and voids */}
        {(summary.total_descuentos > 0 || summary.total_anulaciones > 0) && (
          <>
            <Separator />
            <div className="space-y-2 text-sm">
              {summary.total_descuentos > 0 && (
                <div className="flex items-center justify-between text-warning-foreground">
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4" />
                    <span>Descuentos aplicados</span>
                  </div>
                  <span>-{formatCurrency(summary.total_descuentos)}</span>
                </div>
              )}
              {summary.total_anulaciones > 0 && (
                <div className="flex items-center justify-between text-destructive">
                  <div className="flex items-center gap-2">
                    <XCircle className="h-4 w-4" />
                    <span>Pagos anulados</span>
                  </div>
                  <span>{formatCurrency(summary.total_anulaciones)}</span>
                </div>
              )}
            </div>
          </>
        )}

        {/* Diferencia (if conteo provided) */}
        {conteoFisico !== undefined && (
          <>
            <Separator />
            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span>Conteo fisico efectivo</span>
                <span className="font-medium">{formatCurrency(conteoFisico)}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span>Total efectivo calculado</span>
                <span className="font-medium">{formatCurrency(summary.total_efectivo)}</span>
              </div>
              <div className={`flex justify-between items-center font-medium ${hasDiferencia ? 'text-destructive' : 'text-success-foreground'}`}>
                <span>Diferencia</span>
                <span>{formatCurrency(diferencia!)}</span>
              </div>
              {hasDiferencia && (
                <p className="text-xs text-destructive">
                  Hay una diferencia. Se requiere justificacion.
                </p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

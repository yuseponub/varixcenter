'use client'

import { useState, useEffect, useCallback } from 'react'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Receipt, Loader2, AlertTriangle, Save, Printer } from 'lucide-react'
import { toast } from 'sonner'
import { createQuotation, type QuotationActionState } from '@/app/(protected)/historias/actions'
import type { QuotationItem, Quotation } from '@/types'

interface QuotationPanelProps {
  medicalRecordId: string
  items: QuotationItem[]
  existingQuotation?: Quotation | null
  onQuotationSaved?: (quotation: { id: string; total: number }) => void
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(amount)

/**
 * Quotation panel for viewing and editing quotation from medical record
 * Shows items with quantity, notes, subtotals, and total
 */
export function QuotationPanel({
  medicalRecordId,
  items: initialItems,
  existingQuotation,
  onQuotationSaved,
}: QuotationPanelProps) {
  const [items, setItems] = useState<QuotationItem[]>(
    existingQuotation?.items || initialItems
  )
  const [notas, setNotas] = useState<string>(existingQuotation?.notas || '')

  const [state, formAction, isPending] = useActionState<QuotationActionState | null, FormData>(
    createQuotation,
    null
  )

  // Calculate total
  const total = items.reduce((sum, item) => sum + item.precio * item.cantidad, 0)

  // Update items when initialItems change (e.g., when treatments are updated)
  useEffect(() => {
    if (!existingQuotation) {
      setItems(initialItems)
    }
  }, [initialItems, existingQuotation])

  // Handle success/error
  useEffect(() => {
    if (state?.success && state.data) {
      toast.success('Cotizacion guardada exitosamente')
      onQuotationSaved?.(state.data)
    } else if (state?.error) {
      toast.error(state.error)
    }
  }, [state, onQuotationSaved])

  // Update item price
  const handlePriceChange = (index: number, newPrice: number) => {
    const newItems = [...items]
    newItems[index] = { ...newItems[index], precio: newPrice }
    setItems(newItems)
  }

  // Update item quantity
  const handleQuantityChange = (index: number, newQuantity: number) => {
    const newItems = [...items]
    newItems[index] = { ...newItems[index], cantidad: Math.max(1, newQuantity) }
    setItems(newItems)
  }

  // Handle form submission
  const handleSubmit = useCallback(
    (formData: FormData) => {
      formData.set('medical_record_id', medicalRecordId)
      formData.set('items', JSON.stringify(items))
      formData.set('notas', notas)
      formAction(formData)
    },
    [medicalRecordId, items, notas, formAction]
  )

  // Print quotation
  const handlePrint = () => {
    window.print()
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Cotizacion
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            Seleccione tratamientos en el programa terapeutico para generar una cotizacion
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Cotizacion
            </CardTitle>
            <CardDescription>
              Cotizacion generada automaticamente desde el programa terapeutico
            </CardDescription>
          </div>
          {existingQuotation && (
            <Badge variant="secondary">Guardada</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <form action={handleSubmit} className="space-y-4">
          {/* Error display */}
          {state?.error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

          {/* Items list */}
          <div className="space-y-3">
            {items.map((item, index) => {
              const subtotal = item.precio * item.cantidad
              return (
                <div
                  key={item.id || `${item.service_id}-${index}`}
                  className="p-4 bg-muted/30 rounded-lg border space-y-3"
                >
                  {/* Service name and note */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="font-medium">{item.nombre}</p>
                      {item.nota && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {item.nota}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-primary">
                        {formatCurrency(subtotal)}
                      </p>
                    </div>
                  </div>

                  {/* Price and quantity row */}
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <Label className="text-muted-foreground">Precio:</Label>
                      <Input
                        type="number"
                        min="0"
                        step="1000"
                        value={item.precio}
                        onChange={(e) => handlePriceChange(index, parseFloat(e.target.value) || 0)}
                        disabled={isPending}
                        className="w-32 h-8 text-right"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-muted-foreground">Cantidad:</Label>
                      <Input
                        type="number"
                        min="1"
                        value={item.cantidad}
                        onChange={(e) => handleQuantityChange(index, parseInt(e.target.value) || 1)}
                        disabled={isPending}
                        className="w-20 h-8 text-center"
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Total */}
          <Separator />
          <div className="flex items-center justify-between py-2">
            <span className="text-lg font-semibold">Total</span>
            <span className="text-2xl font-bold text-primary">
              {formatCurrency(total)}
            </span>
          </div>

          {/* Notes */}
          <div className="space-y-2 pt-2">
            <Label htmlFor="notas">Notas adicionales (opcional)</Label>
            <Textarea
              id="notas"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Notas adicionales para la cotizacion..."
              rows={2}
              disabled={isPending}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-4 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handlePrint}
              disabled={isPending}
            >
              <Printer className="mr-2 h-4 w-4" />
              Imprimir
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Guardar Cotizacion
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

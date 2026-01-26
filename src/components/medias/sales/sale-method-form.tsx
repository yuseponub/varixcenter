'use client'

import { useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Trash2, Plus } from 'lucide-react'
import { ReceiptUpload } from '@/components/payments/receipt-upload'
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  requiresComprobante,
  type PaymentMethodType,
  type MediasSaleMethodInput,
} from '@/types/medias/sales'

interface SaleMethodFormProps {
  methods: MediasSaleMethodInput[]
  onChange: (methods: MediasSaleMethodInput[]) => void
  totalRequired: number
  disabled?: boolean
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(amount)

export function SaleMethodForm({
  methods,
  onChange,
  totalRequired,
  disabled,
}: SaleMethodFormProps) {
  const handleAddMethod = useCallback(() => {
    const currentTotal = methods.reduce((sum, m) => sum + m.monto, 0)
    const remaining = Math.max(0, totalRequired - currentTotal)

    onChange([
      ...methods,
      {
        metodo: 'efectivo',
        monto: remaining,
        comprobante_path: null,
      },
    ])
  }, [methods, onChange, totalRequired])

  const handleRemoveMethod = useCallback(
    (index: number) => {
      onChange(methods.filter((_, i) => i !== index))
    },
    [methods, onChange]
  )

  const handleMethodChange = useCallback(
    (index: number, metodo: PaymentMethodType) => {
      onChange(
        methods.map((m, i) =>
          i === index ? { ...m, metodo, comprobante_path: null } : m
        )
      )
    },
    [methods, onChange]
  )

  const handleAmountChange = useCallback(
    (index: number, monto: number) => {
      onChange(methods.map((m, i) => (i === index ? { ...m, monto } : m)))
    },
    [methods, onChange]
  )

  const handleComprobanteChange = useCallback(
    (index: number, path: string | null) => {
      onChange(
        methods.map((m, i) => (i === index ? { ...m, comprobante_path: path } : m))
      )
    },
    [methods, onChange]
  )

  const currentTotal = methods.reduce((sum, m) => sum + m.monto, 0)
  const difference = totalRequired - currentTotal

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label>Metodos de Pago</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddMethod}
          disabled={disabled}
        >
          <Plus className="h-4 w-4 mr-1" />
          Agregar metodo
        </Button>
      </div>

      {methods.map((method, index) => (
        <Card key={index}>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Metodo {index + 1}</CardTitle>
              {methods.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveMethod(index)}
                  disabled={disabled}
                  className="h-6 w-6 text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-0 px-4 pb-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor={`method-type-${index}`}>Tipo</Label>
                <Select
                  value={method.metodo}
                  onValueChange={(v) =>
                    handleMethodChange(index, v as PaymentMethodType)
                  }
                  disabled={disabled}
                >
                  <SelectTrigger id={`method-type-${index}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {PAYMENT_METHOD_LABELS[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor={`method-amount-${index}`}>Monto</Label>
                <Input
                  id={`method-amount-${index}`}
                  type="number"
                  value={method.monto}
                  onChange={(e) =>
                    handleAmountChange(index, parseFloat(e.target.value) || 0)
                  }
                  disabled={disabled}
                  min={0}
                />
              </div>
            </div>

            {/* VTA-05: Receipt upload for electronic methods */}
            {requiresComprobante(method.metodo) && (
              <ReceiptUpload
                onUploadComplete={(path) => handleComprobanteChange(index, path)}
                onRemove={() => handleComprobanteChange(index, null)}
                initialPath={method.comprobante_path}
                disabled={disabled}
                required
                error={
                  !method.comprobante_path ? 'Comprobante requerido' : undefined
                }
              />
            )}
          </CardContent>
        </Card>
      ))}

      {methods.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          Agregue al menos un metodo de pago
        </p>
      )}

      {methods.length > 0 && Math.abs(difference) > 0.01 && (
        <p
          className={`text-sm ${difference > 0 ? 'text-amber-600' : 'text-red-600'}`}
        >
          {difference > 0
            ? `Falta: ${formatCurrency(difference)}`
            : `Excede: ${formatCurrency(Math.abs(difference))}`}
        </p>
      )}
    </div>
  )
}

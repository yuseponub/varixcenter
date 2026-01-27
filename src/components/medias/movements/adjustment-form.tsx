'use client'

import { useActionState, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import {
  createAdjustment,
  type AdjustmentActionState,
} from '@/app/(protected)/medias/movimientos/actions'
import { ADJUSTMENT_TYPES, STOCK_TYPES } from '@/types/medias/dashboard'

interface ProductForAdjustment {
  id: string
  codigo: string
  tipo: string
  talla: string
  stock_normal: number
  stock_devoluciones: number
}

interface AdjustmentFormProps {
  products: ProductForAdjustment[]
  onSuccess?: () => void
}

const ADJUSTMENT_TYPE_LABELS: Record<string, string> = {
  entrada: 'Entrada (agregar stock)',
  salida: 'Salida (quitar stock)',
}

const STOCK_TYPE_LABELS: Record<string, string> = {
  normal: 'Stock Normal',
  devoluciones: 'Stock Devoluciones',
}

/**
 * Form for creating inventory adjustments
 * Allows selecting product, cantidad, tipo (entrada/salida),
 * stock_type (normal/devoluciones), and razon
 */
export function AdjustmentForm({ products, onSuccess }: AdjustmentFormProps) {
  const [state, formAction, isPending] = useActionState<
    AdjustmentActionState | null,
    FormData
  >(createAdjustment, null)

  const [selectedProductId, setSelectedProductId] = useState<string>('')
  const [cantidad, setCantidad] = useState(1)
  const [tipo, setTipo] = useState<string>('entrada')
  const [stockType, setStockType] = useState<string>('normal')
  const [razon, setRazon] = useState('')

  const selectedProduct = products.find((p) => p.id === selectedProductId)

  // Get current stock based on selected stock type
  const currentStock = selectedProduct
    ? stockType === 'normal'
      ? selectedProduct.stock_normal
      : selectedProduct.stock_devoluciones
    : 0

  // Validation
  const isValidRazon = razon.trim().length >= 10
  const isValidCantidad = cantidad >= 1
  const canSubmit = selectedProductId && isValidCantidad && isValidRazon

  // Handle successful submission
  useEffect(() => {
    if (state?.success) {
      toast.success('Ajuste de inventario registrado')
      // Reset form
      setSelectedProductId('')
      setCantidad(1)
      setTipo('entrada')
      setStockType('normal')
      setRazon('')
      onSuccess?.()
    } else if (state?.error) {
      toast.error(state.error)
    }
  }, [state, onSuccess])

  const handleSubmit = (formData: FormData) => {
    formData.set('product_id', selectedProductId)
    formData.set('cantidad', cantidad.toString())
    formData.set('tipo', tipo)
    formData.set('stock_type', stockType)
    formData.set('razon', razon)
    formAction(formData)
  }

  return (
    <form action={handleSubmit} className="space-y-6">
      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      {/* Product selection */}
      <div className="space-y-2">
        <Label htmlFor="product">Producto</Label>
        <Select value={selectedProductId} onValueChange={setSelectedProductId}>
          <SelectTrigger id="product">
            <SelectValue placeholder="Seleccione producto" />
          </SelectTrigger>
          <SelectContent>
            {products.map((product) => (
              <SelectItem key={product.id} value={product.id}>
                <span className="font-medium">{product.codigo}</span>
                <span className="ml-2">
                  - {product.tipo} {product.talla}
                </span>
                <span className="ml-2 text-muted-foreground">
                  (N: {product.stock_normal} | D: {product.stock_devoluciones})
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {state?.errors?.product_id && (
          <p className="text-sm text-destructive">{state.errors.product_id[0]}</p>
        )}
      </div>

      {/* Cantidad */}
      <div className="space-y-2">
        <Label htmlFor="cantidad">Cantidad</Label>
        <Input
          id="cantidad"
          type="number"
          min={1}
          value={cantidad}
          onChange={(e) => setCantidad(Math.max(1, parseInt(e.target.value) || 1))}
          disabled={isPending}
        />
        {selectedProduct && tipo === 'salida' && (
          <p className="text-xs text-muted-foreground">
            Stock actual ({stockType}): {currentStock}
          </p>
        )}
        {state?.errors?.cantidad && (
          <p className="text-sm text-destructive">{state.errors.cantidad[0]}</p>
        )}
      </div>

      {/* Tipo de ajuste */}
      <div className="space-y-3">
        <Label>Tipo de ajuste</Label>
        <RadioGroup
          value={tipo}
          onValueChange={setTipo}
          disabled={isPending}
        >
          {ADJUSTMENT_TYPES.map((t) => (
            <div key={t} className="flex items-center space-x-2">
              <RadioGroupItem value={t} id={`tipo-${t}`} />
              <Label htmlFor={`tipo-${t}`} className="font-normal cursor-pointer">
                {ADJUSTMENT_TYPE_LABELS[t]}
              </Label>
            </div>
          ))}
        </RadioGroup>
        {state?.errors?.tipo && (
          <p className="text-sm text-destructive">{state.errors.tipo[0]}</p>
        )}
      </div>

      {/* Tipo de stock */}
      <div className="space-y-3">
        <Label>Tipo de stock a modificar</Label>
        <RadioGroup
          value={stockType}
          onValueChange={setStockType}
          disabled={isPending}
        >
          {STOCK_TYPES.map((st) => (
            <div key={st} className="flex items-center space-x-2">
              <RadioGroupItem value={st} id={`stock-${st}`} />
              <Label htmlFor={`stock-${st}`} className="font-normal cursor-pointer">
                {STOCK_TYPE_LABELS[st]}
              </Label>
            </div>
          ))}
        </RadioGroup>
        {state?.errors?.stock_type && (
          <p className="text-sm text-destructive">{state.errors.stock_type[0]}</p>
        )}
      </div>

      {/* Razon */}
      <div className="space-y-2">
        <Label htmlFor="razon" className="after:content-['*'] after:ml-0.5 after:text-red-500">
          Razon del ajuste
        </Label>
        <Textarea
          id="razon"
          value={razon}
          onChange={(e) => setRazon(e.target.value)}
          placeholder="Motivo del ajuste..."
          rows={3}
          disabled={isPending}
        />
        <p className="text-xs text-muted-foreground">
          {razon.length}/10 caracteres minimos
        </p>
        {state?.errors?.razon && (
          <p className="text-sm text-destructive">{state.errors.razon[0]}</p>
        )}
      </div>

      <Button
        type="submit"
        className="w-full"
        size="lg"
        disabled={!canSubmit || isPending}
      >
        {isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Registrando...
          </>
        ) : (
          'Registrar Ajuste'
        )}
      </Button>

      {!canSubmit && selectedProductId && (
        <p className="text-sm text-muted-foreground text-center">
          {!isValidRazon && 'La razon debe tener al menos 10 caracteres'}
        </p>
      )}
    </form>
  )
}

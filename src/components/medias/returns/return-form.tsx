'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
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
  createReturn,
  type ReturnActionState,
} from '@/app/(protected)/medias/devoluciones/actions'
import type { MediasSaleWithDetails } from '@/types/medias/sales'
import { REEMBOLSO_METODOS, REEMBOLSO_METODO_LABELS } from '@/types/medias/returns'

interface ReturnFormProps {
  sale: MediasSaleWithDetails
  /** Map of sale_item_id -> max returnable quantity */
  returnableQuantities: Record<string, number>
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(amount)

/**
 * Form for creating a return request
 * Filters to only show items with returnable quantity > 0
 * Validates quantity against max returnable
 */
export function ReturnForm({ sale, returnableQuantities }: ReturnFormProps) {
  const router = useRouter()
  const [state, formAction, isPending] = useActionState<
    ReturnActionState | null,
    FormData
  >(createReturn, null)

  const [selectedItemId, setSelectedItemId] = useState<string>('')
  const [cantidad, setCantidad] = useState(1)
  const [metodoReembolso, setMetodoReembolso] = useState<string>('efectivo')
  const [motivo, setMotivo] = useState('')

  // Filter to items with returnable quantity > 0
  const returnableItems = sale.items.filter(
    (item) => (returnableQuantities[item.id] ?? 0) > 0
  )

  const selectedItem = sale.items.find((item) => item.id === selectedItemId)
  const maxQuantity = selectedItem
    ? (returnableQuantities[selectedItem.id] ?? 0)
    : 0

  // Calculate refund amount
  const refundAmount = selectedItem ? selectedItem.unit_price * cantidad : 0

  // Handle successful submission
  useEffect(() => {
    if (state?.success && state.data) {
      toast.success(`Devolucion ${state.data.numero_devolucion} creada`)
      router.push('/medias/devoluciones')
    } else if (state?.error) {
      toast.error(state.error)
    }
  }, [state, router])

  // Auto-select first returnable item
  useEffect(() => {
    if (returnableItems.length > 0 && !selectedItemId) {
      setSelectedItemId(returnableItems[0].id)
    }
  }, [returnableItems, selectedItemId])

  // Reset cantidad when item changes
  useEffect(() => {
    setCantidad(1)
  }, [selectedItemId])

  // Validation
  const isValidMotivo = motivo.trim().length >= 10
  const canSubmit = selectedItemId && cantidad > 0 && cantidad <= maxQuantity && isValidMotivo

  if (returnableItems.length === 0) {
    return (
      <Alert>
        <AlertDescription>
          No hay productos disponibles para devolucion en esta venta.
          <br />
          (Todos los productos ya han sido devueltos o tienen solicitudes pendientes)
        </AlertDescription>
      </Alert>
    )
  }

  const handleSubmit = (formData: FormData) => {
    formData.set('sale_id', sale.id)
    formData.set('sale_item_id', selectedItemId)
    formData.set('cantidad', cantidad.toString())
    formData.set('metodo_reembolso', metodoReembolso)
    formData.set('motivo', motivo)
    formData.set('foto_path', '') // Optional, empty for now
    formAction(formData)
  }

  return (
    <form action={handleSubmit} className="space-y-6">
      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      {/* Sale info */}
      <div className="rounded-lg border p-4 bg-muted/50">
        <p className="text-sm text-muted-foreground">Venta</p>
        <p className="font-medium">{sale.numero_venta}</p>
        {sale.patient && (
          <p className="text-sm">
            {sale.patient.nombre} {sale.patient.apellido} - {sale.patient.cedula}
          </p>
        )}
      </div>

      {/* Item selection */}
      <div className="space-y-2">
        <Label htmlFor="item">Producto a devolver</Label>
        <Select value={selectedItemId} onValueChange={setSelectedItemId}>
          <SelectTrigger id="item">
            <SelectValue placeholder="Seleccione producto" />
          </SelectTrigger>
          <SelectContent>
            {returnableItems.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                <span className="font-medium">{item.product_codigo}</span>
                <span className="ml-2">
                  - {item.product_tipo} {item.product_talla}
                </span>
                <span className="ml-2 text-muted-foreground">
                  (Max: {returnableQuantities[item.id]})
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Quantity */}
      <div className="space-y-2">
        <Label htmlFor="cantidad">
          Cantidad (max: {maxQuantity})
        </Label>
        <Input
          id="cantidad"
          type="number"
          min={1}
          max={maxQuantity}
          value={cantidad}
          onChange={(e) => {
            const val = parseInt(e.target.value) || 1
            setCantidad(Math.min(Math.max(1, val), maxQuantity))
          }}
          disabled={isPending}
        />
        {state?.errors?.cantidad && (
          <p className="text-sm text-destructive">{state.errors.cantidad[0]}</p>
        )}
      </div>

      {/* Refund amount preview */}
      {selectedItem && (
        <div className="rounded-lg border p-4 bg-green-50 dark:bg-green-950">
          <p className="text-sm text-muted-foreground">Monto a reembolsar</p>
          <p className="text-2xl font-bold text-green-600">
            {formatCurrency(refundAmount)}
          </p>
          <p className="text-xs text-muted-foreground">
            {cantidad} x {formatCurrency(selectedItem.unit_price)}
          </p>
        </div>
      )}

      {/* Refund method */}
      <div className="space-y-3">
        <Label>Metodo de reembolso</Label>
        <RadioGroup
          value={metodoReembolso}
          onValueChange={setMetodoReembolso}
          disabled={isPending}
        >
          {REEMBOLSO_METODOS.map((metodo) => (
            <div key={metodo} className="flex items-center space-x-2">
              <RadioGroupItem value={metodo} id={`metodo-${metodo}`} />
              <Label htmlFor={`metodo-${metodo}`} className="font-normal cursor-pointer">
                {REEMBOLSO_METODO_LABELS[metodo]}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      {/* Motivo */}
      <div className="space-y-2">
        <Label htmlFor="motivo" className="after:content-['*'] after:ml-0.5 after:text-red-500">
          Motivo de la devolucion
        </Label>
        <Textarea
          id="motivo"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Describa el motivo de la devolucion..."
          rows={3}
          disabled={isPending}
        />
        <p className="text-xs text-muted-foreground">
          {motivo.length}/10 caracteres minimos
        </p>
        {state?.errors?.motivo && (
          <p className="text-sm text-destructive">{state.errors.motivo[0]}</p>
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
            Creando...
          </>
        ) : (
          'Crear Solicitud de Devolucion'
        )}
      </Button>

      {!canSubmit && selectedItemId && (
        <p className="text-sm text-muted-foreground text-center">
          {!isValidMotivo && 'El motivo debe tener al menos 10 caracteres'}
          {isValidMotivo && cantidad > maxQuantity && 'La cantidad excede el maximo disponible'}
        </p>
      )}
    </form>
  )
}

'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Trash2 } from 'lucide-react'
import type { PurchaseItemInput } from '@/types/medias/purchases'

interface Product {
  id: string
  codigo: string
  tipo: string
  talla: string
  precio: number
}

interface PurchaseFormProps {
  products: Product[]
  // Controlled form values
  proveedor: string
  setProveedor: (value: string) => void
  fechaFactura: string
  setFechaFactura: (value: string) => void
  numeroFactura: string
  setNumeroFactura: (value: string) => void
  notas: string
  setNotas: (value: string) => void
  items: PurchaseItemInput[]
  setItems: (items: PurchaseItemInput[]) => void
  disabled?: boolean
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(amount)

export function PurchaseForm({
  products,
  proveedor,
  setProveedor,
  fechaFactura,
  setFechaFactura,
  numeroFactura,
  setNumeroFactura,
  notas,
  setNotas,
  items,
  setItems,
  disabled = false,
}: PurchaseFormProps) {
  const addItem = () => {
    setItems([...items, { product_id: '', cantidad: 1, costo_unitario: 0 }])
  }

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index))
  }

  const updateItem = (index: number, updates: Partial<PurchaseItemInput>) => {
    setItems(
      items.map((item, i) => (i === index ? { ...item, ...updates } : item))
    )
  }

  const calculateTotal = () => {
    return items.reduce((sum, item) => sum + item.cantidad * item.costo_unitario, 0)
  }

  return (
    <div className="space-y-6">
      {/* Invoice info */}
      <Card>
        <CardHeader>
          <CardTitle>Datos de la Factura</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>
                Proveedor <span className="text-red-500">*</span>
              </Label>
              <Input
                value={proveedor}
                onChange={(e) => setProveedor(e.target.value)}
                placeholder="Nombre del proveedor"
                disabled={disabled}
              />
            </div>
            <div>
              <Label>
                Fecha de Factura <span className="text-red-500">*</span>
              </Label>
              <Input
                type="date"
                value={fechaFactura}
                onChange={(e) => setFechaFactura(e.target.value)}
                disabled={disabled}
              />
            </div>
            <div>
              <Label>Numero de Factura</Label>
              <Input
                value={numeroFactura}
                onChange={(e) => setNumeroFactura(e.target.value)}
                placeholder="Opcional"
                disabled={disabled}
              />
            </div>
          </div>
          <div>
            <Label>Notas</Label>
            <Textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Notas adicionales (opcional)"
              disabled={disabled}
            />
          </div>
        </CardContent>
      </Card>

      {/* Products */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Productos</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={addItem}
            disabled={disabled}
          >
            <Plus className="h-4 w-4 mr-1" />
            Agregar
          </Button>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-center text-gray-500 py-4">
              No hay productos. Haga clic en "Agregar" para comenzar.
            </p>
          ) : (
            <div className="space-y-3">
              {items.map((item, index) => (
                <div
                  key={index}
                  className="grid grid-cols-12 gap-2 items-end border-b pb-3"
                >
                  <div className="col-span-5">
                    <Label className="text-xs">Producto</Label>
                    <Select
                      value={item.product_id}
                      onValueChange={(v) => updateItem(index, { product_id: v })}
                      disabled={disabled}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar..." />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.codigo} - {p.tipo} {p.talla}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Cantidad</Label>
                    <Input
                      type="number"
                      min={1}
                      value={item.cantidad}
                      onChange={(e) =>
                        updateItem(index, {
                          cantidad: parseInt(e.target.value) || 1,
                        })
                      }
                      disabled={disabled}
                    />
                  </div>
                  <div className="col-span-3">
                    <Label className="text-xs">Costo Unitario</Label>
                    <Input
                      type="number"
                      min={0}
                      value={item.costo_unitario}
                      onChange={(e) =>
                        updateItem(index, {
                          costo_unitario: parseFloat(e.target.value) || 0,
                        })
                      }
                      disabled={disabled}
                    />
                  </div>
                  <div className="col-span-1 text-right">
                    <p className="text-xs text-gray-500 mb-1">Subtotal</p>
                    <p className="font-medium text-sm">
                      {formatCurrency(item.cantidad * item.costo_unitario)}
                    </p>
                  </div>
                  <div className="col-span-1 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeItem(index)}
                      disabled={disabled}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Total */}
          {items.length > 0 && (
            <div className="flex justify-end pt-4 border-t mt-4">
              <div className="text-right">
                <p className="text-sm text-gray-500">Total</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(calculateTotal())}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * Calculate total for purchase items
 * Exported as utility for parent components
 */
export function calculatePurchaseTotal(items: PurchaseItemInput[]): number {
  return items.reduce((sum, item) => sum + item.cantidad * item.costo_unitario, 0)
}

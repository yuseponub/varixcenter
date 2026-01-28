'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { MOVEMENT_TYPES, type MediasMovementType } from '@/types/medias/products'
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

interface ProductOption {
  id: string
  codigo: string
  tipo: string
  talla: string
}

interface MovementFiltersProps {
  products: ProductOption[]
}

/**
 * Movement type labels in Spanish
 */
const MOVEMENT_TYPE_LABELS: Record<MediasMovementType, string> = {
  compra: 'Compra',
  venta: 'Venta',
  devolucion: 'Devolucion',
  ajuste_entrada: 'Ajuste Entrada',
  ajuste_salida: 'Ajuste Salida',
  transferencia: 'Transferencia',
}

/**
 * Filter form for movements history
 * Uses URL searchParams for server-side filtering
 */
export function MovementFilters({ products }: MovementFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Initialize state from URL params
  const [productId, setProductId] = useState(searchParams.get('product_id') || 'all')
  const [tipo, setTipo] = useState(searchParams.get('tipo') || 'all')
  const [fromDate, setFromDate] = useState(searchParams.get('from_date') || '')
  const [toDate, setToDate] = useState(searchParams.get('to_date') || '')

  const handleApply = () => {
    const params = new URLSearchParams()

    if (productId && productId !== 'all') params.set('product_id', productId)
    if (tipo && tipo !== 'all') params.set('tipo', tipo)
    if (fromDate) params.set('from_date', fromDate)
    if (toDate) params.set('to_date', toDate)

    const queryString = params.toString()
    router.push(`/medias/movimientos${queryString ? `?${queryString}` : ''}`)
  }

  const handleClear = () => {
    setProductId('all')
    setTipo('all')
    setFromDate('')
    setToDate('')
    router.push('/medias/movimientos')
  }

  const hasFilters = (productId && productId !== 'all') || (tipo && tipo !== 'all') || fromDate || toDate

  return (
    <div className="flex flex-wrap items-end gap-4">
      {/* Product select */}
      <div className="space-y-1.5">
        <Label htmlFor="product">Producto</Label>
        <Select value={productId} onValueChange={setProductId}>
          <SelectTrigger id="product" className="w-[200px]">
            <SelectValue placeholder="Todos los productos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los productos</SelectItem>
            {products.map((product) => (
              <SelectItem key={product.id} value={product.id}>
                {product.codigo} - {product.tipo} {product.talla}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Type select */}
      <div className="space-y-1.5">
        <Label htmlFor="tipo">Tipo</Label>
        <Select value={tipo} onValueChange={setTipo}>
          <SelectTrigger id="tipo" className="w-[180px]">
            <SelectValue placeholder="Todos los tipos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            {MOVEMENT_TYPES.map((movementType) => (
              <SelectItem key={movementType} value={movementType}>
                {MOVEMENT_TYPE_LABELS[movementType]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* From date */}
      <div className="space-y-1.5">
        <Label htmlFor="from_date">Desde</Label>
        <Input
          id="from_date"
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          className="w-[150px]"
        />
      </div>

      {/* To date */}
      <div className="space-y-1.5">
        <Label htmlFor="to_date">Hasta</Label>
        <Input
          id="to_date"
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          className="w-[150px]"
        />
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <Button onClick={handleApply}>Aplicar</Button>
        {hasFilters && (
          <Button variant="outline" onClick={handleClear}>
            Limpiar
          </Button>
        )}
      </div>
    </div>
  )
}

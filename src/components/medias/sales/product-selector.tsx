'use client'

import { useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Plus, Minus, Trash2 } from 'lucide-react'
import type { MediasProduct } from '@/types/medias/products'
import type { CartItem } from '@/types/medias/sales'

interface ProductSelectorProps {
  products: MediasProduct[]
  cart: CartItem[]
  onChange: (cart: CartItem[]) => void
  disabled?: boolean
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(amount)

export function ProductSelector({
  products,
  cart,
  onChange,
  disabled,
}: ProductSelectorProps) {
  const handleAddProduct = useCallback(
    (product: MediasProduct) => {
      const existing = cart.find((item) => item.product_id === product.id)

      if (existing) {
        // Increment quantity if stock available
        if (existing.quantity < product.stock_normal) {
          onChange(
            cart.map((item) =>
              item.product_id === product.id
                ? {
                    ...item,
                    quantity: item.quantity + 1,
                    subtotal: (item.quantity + 1) * item.precio,
                  }
                : item
            )
          )
        }
      } else {
        // Add new item
        onChange([
          ...cart,
          {
            product_id: product.id,
            codigo: product.codigo,
            tipo: product.tipo,
            talla: product.talla,
            precio: product.precio,
            quantity: 1,
            subtotal: product.precio,
            stock_available: product.stock_normal,
          },
        ])
      }
    },
    [cart, onChange]
  )

  const handleQuantityChange = useCallback(
    (productId: string, quantity: number) => {
      const item = cart.find((i) => i.product_id === productId)
      if (!item) return

      if (quantity <= 0) {
        // Remove item
        onChange(cart.filter((i) => i.product_id !== productId))
      } else if (quantity <= item.stock_available) {
        // Update quantity
        onChange(
          cart.map((i) =>
            i.product_id === productId
              ? { ...i, quantity, subtotal: quantity * i.precio }
              : i
          )
        )
      }
    },
    [cart, onChange]
  )

  const handleRemoveItem = useCallback(
    (productId: string) => {
      onChange(cart.filter((i) => i.product_id !== productId))
    },
    [cart, onChange]
  )

  // Group products by tipo
  const productsByType = products.reduce(
    (acc, p) => {
      if (!acc[p.tipo]) acc[p.tipo] = []
      acc[p.tipo].push(p)
      return acc
    },
    {} as Record<string, MediasProduct[]>
  )

  return (
    <div className="space-y-6">
      {/* Product Grid */}
      <div className="space-y-4">
        {Object.entries(productsByType).map(([tipo, prods]) => (
          <div key={tipo}>
            <h3 className="font-medium mb-2">{tipo}</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {prods.map((product) => {
                const inCart = cart.find((i) => i.product_id === product.id)
                const stockAvailable = product.stock_normal - (inCart?.quantity || 0)

                return (
                  <Button
                    key={product.id}
                    variant={inCart ? 'default' : 'outline'}
                    className="h-auto py-2 px-3 flex flex-col items-start"
                    onClick={() => handleAddProduct(product)}
                    disabled={disabled || stockAvailable <= 0}
                  >
                    <span className="font-medium">
                      {product.tipo} {product.talla}
                    </span>
                    <span className="text-xs opacity-80">
                      {formatCurrency(product.precio)}
                    </span>
                    <Badge
                      variant={stockAvailable > 0 ? 'secondary' : 'destructive'}
                      className="mt-1 text-xs"
                    >
                      Stock: {product.stock_normal}
                    </Badge>
                  </Button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Cart Items */}
      {cart.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-medium">Productos Seleccionados</h3>
          {cart.map((item) => (
            <Card key={item.product_id}>
              <CardContent className="py-3 px-4 flex items-center justify-between">
                <div>
                  <span className="font-medium">
                    {item.tipo} {item.talla}
                  </span>
                  <span className="text-sm text-muted-foreground ml-2">
                    {formatCurrency(item.precio)} c/u
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() =>
                      handleQuantityChange(item.product_id, item.quantity - 1)
                    }
                    disabled={disabled}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <Input
                    type="number"
                    value={item.quantity}
                    onChange={(e) =>
                      handleQuantityChange(
                        item.product_id,
                        parseInt(e.target.value) || 0
                      )
                    }
                    className="w-16 text-center"
                    min={1}
                    max={item.stock_available}
                    disabled={disabled}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() =>
                      handleQuantityChange(item.product_id, item.quantity + 1)
                    }
                    disabled={disabled || item.quantity >= item.stock_available}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => handleRemoveItem(item.product_id)}
                    disabled={disabled}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <span className="w-24 text-right font-medium">
                    {formatCurrency(item.subtotal)}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

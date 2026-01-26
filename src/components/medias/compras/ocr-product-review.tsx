'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Check, X, AlertTriangle } from 'lucide-react'
import type { OCRInvoiceResult, MatchedProduct, PurchaseItemInput } from '@/types/medias/purchases'

interface Product {
  id: string
  codigo: string
  tipo: string
  talla: string
  precio: number
}

interface OCRProductReviewProps {
  ocrResult: OCRInvoiceResult
  products: Product[]
  onConfirm: (items: PurchaseItemInput[], metadata: {
    proveedor?: string
    fecha_factura?: string
    numero_factura?: string
    total?: number
  }) => void
  onSkip: () => void
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(amount)

export function OCRProductReview({
  ocrResult,
  products,
  onConfirm,
  onSkip,
}: OCRProductReviewProps) {
  const [matchedProducts, setMatchedProducts] = useState<MatchedProduct[]>([])

  // Initialize matched products from OCR result
  useEffect(() => {
    const initial: MatchedProduct[] = ocrResult.productos.map((p, index) => {
      // Try to auto-match by codigo
      const match = products.find(
        (prod) =>
          p.codigo_producto &&
          prod.codigo.toLowerCase() === p.codigo_producto.toLowerCase()
      )

      return {
        ocr_index: index,
        product_id: match?.id || null,
        product_codigo: match?.codigo || null,
        cantidad: p.cantidad,
        costo_unitario: p.costo_unitario || 0,
        matched: !!match,
      }
    })
    setMatchedProducts(initial)
  }, [ocrResult, products])

  const handleProductMatch = (index: number, productId: string | null) => {
    setMatchedProducts((prev) =>
      prev.map((m, i) => {
        if (i !== index) return m
        const product = products.find((p) => p.id === productId)
        return {
          ...m,
          product_id: productId,
          product_codigo: product?.codigo || null,
          matched: !!productId,
        }
      })
    )
  }

  const handleQuantityChange = (index: number, cantidad: number) => {
    setMatchedProducts((prev) =>
      prev.map((m, i) => (i === index ? { ...m, cantidad } : m))
    )
  }

  const handleCostChange = (index: number, costo_unitario: number) => {
    setMatchedProducts((prev) =>
      prev.map((m, i) => (i === index ? { ...m, costo_unitario } : m))
    )
  }

  const handleRemoveItem = (index: number) => {
    setMatchedProducts((prev) => prev.filter((_, i) => i !== index))
  }

  const handleConfirm = () => {
    // Filter only matched products
    const items: PurchaseItemInput[] = matchedProducts
      .filter((m) => m.matched && m.product_id)
      .map((m) => ({
        product_id: m.product_id!,
        cantidad: m.cantidad,
        costo_unitario: m.costo_unitario,
      }))

    onConfirm(items, {
      proveedor: ocrResult.proveedor || undefined,
      fecha_factura: ocrResult.fecha_factura || undefined,
      numero_factura: ocrResult.numero_factura || undefined,
      total: ocrResult.total || undefined,
    })
  }

  const matchedCount = matchedProducts.filter((m) => m.matched).length
  const totalCount = matchedProducts.length

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Productos Detectados por OCR</span>
          <span className="text-sm font-normal text-gray-500">
            {matchedCount}/{totalCount} asignados
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* OCR Metadata */}
        {(ocrResult.proveedor || ocrResult.fecha_factura || ocrResult.total) && (
          <div className="bg-blue-50 p-3 rounded-lg text-sm">
            <p className="font-medium text-blue-800 mb-1">Datos detectados:</p>
            {ocrResult.proveedor && (
              <p>Proveedor: {ocrResult.proveedor}</p>
            )}
            {ocrResult.fecha_factura && (
              <p>Fecha: {ocrResult.fecha_factura}</p>
            )}
            {ocrResult.numero_factura && (
              <p>No. Factura: {ocrResult.numero_factura}</p>
            )}
            {ocrResult.total && (
              <p>Total: {formatCurrency(ocrResult.total)}</p>
            )}
          </div>
        )}

        {/* Products list */}
        <div className="space-y-3">
          {matchedProducts.map((item, index) => {
            const ocrProduct = ocrResult.productos[item.ocr_index]
            return (
              <div
                key={index}
                className={`border rounded-lg p-3 ${
                  item.matched ? 'border-green-300 bg-green-50' : 'border-yellow-300 bg-yellow-50'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      {ocrProduct.descripcion}
                    </p>
                    {ocrProduct.codigo_producto && (
                      <p className="text-xs text-gray-500">
                        Codigo OCR: {ocrProduct.codigo_producto}
                      </p>
                    )}
                    {ocrProduct.needs_review && (
                      <p className="text-xs text-yellow-600">
                        Requiere revision (confianza baja)
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {item.matched ? (
                      <Check className="h-5 w-5 text-green-600" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-yellow-600" />
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveItem(index)}
                      type="button"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {/* Product selector */}
                  <div>
                    <Label className="text-xs">Producto</Label>
                    <Select
                      value={item.product_id || ''}
                      onValueChange={(value) =>
                        handleProductMatch(index, value || null)
                      }
                    >
                      <SelectTrigger className="h-8">
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

                  {/* Quantity */}
                  <div>
                    <Label className="text-xs">Cantidad</Label>
                    <Input
                      type="number"
                      min={1}
                      value={item.cantidad}
                      onChange={(e) =>
                        handleQuantityChange(index, parseInt(e.target.value) || 1)
                      }
                      className="h-8"
                    />
                  </div>

                  {/* Unit cost */}
                  <div>
                    <Label className="text-xs">Costo Unitario</Label>
                    <Input
                      type="number"
                      min={0}
                      value={item.costo_unitario}
                      onChange={(e) =>
                        handleCostChange(index, parseFloat(e.target.value) || 0)
                      }
                      className="h-8"
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {matchedProducts.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <AlertTriangle className="mx-auto h-12 w-12 text-yellow-500 mb-2" />
            <p>No se detectaron productos en la factura</p>
            <p className="text-sm">Ingrese los productos manualmente</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-4 border-t">
          <Button
            onClick={handleConfirm}
            disabled={matchedCount === 0}
            className="flex-1"
          >
            Confirmar {matchedCount} producto{matchedCount !== 1 ? 's' : ''}
          </Button>
          <Button variant="outline" onClick={onSkip}>
            Ingresar Manualmente
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

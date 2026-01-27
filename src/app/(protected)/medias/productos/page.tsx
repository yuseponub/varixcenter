'use client'

import { useEffect, useState, useMemo } from 'react'
import { AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { MediasProduct } from '@/types/medias/products'
import { ProductsTable } from '@/components/medias/products/products-table'
import { ProductForm } from '@/components/medias/products/product-form'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

/**
 * Medias products catalog admin page
 * Allows admin to manage products and view stock
 */
export default function ProductosPage() {
  const [products, setProducts] = useState<MediasProduct[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  // Calculate critical stock products (active products with stock_normal < umbral_alerta)
  const criticalProducts = useMemo(() => {
    return products.filter(p => p.activo && p.stock_normal < p.umbral_alerta)
  }, [products])

  // Fetch products on mount and after changes
  const fetchProducts = async () => {
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('medias_products')
      .select('*')
      .order('tipo')
      .order('talla')

    if (error) {
      console.error('Error fetching products:', error)
    } else {
      setProducts(data || [])
    }
    setIsLoading(false)
  }

  useEffect(() => {
    fetchProducts()
  }, [])

  // Refetch when dialog closes after success
  const handleDialogChange = (open: boolean) => {
    setIsDialogOpen(open)
    if (!open) {
      fetchProducts()
    }
  }

  const handleSuccess = () => {
    setIsDialogOpen(false)
    fetchProducts()
  }

  return (
    <div className="container mx-auto py-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Catalogo de Productos</h1>
          <p className="text-muted-foreground">Medias de compresion</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={handleDialogChange}>
          <DialogTrigger asChild>
            <Button>Nuevo Producto</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuevo Producto</DialogTitle>
            </DialogHeader>
            <ProductForm onSuccess={handleSuccess} />
          </DialogContent>
        </Dialog>
      </div>

      {/* Stock Alert Banner */}
      {!isLoading && criticalProducts.length > 0 && (
        <div className="mb-4 flex items-start gap-3 rounded-md border-l-4 border-amber-500 bg-amber-50 p-4">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-amber-800">
              {criticalProducts.length} producto{criticalProducts.length > 1 ? 's' : ''} con stock critico
            </p>
            <ul className="mt-2 text-sm text-amber-700 space-y-1">
              {criticalProducts.slice(0, 5).map(p => (
                <li key={p.id} className="font-mono">
                  {p.codigo} ({p.tipo} {p.talla}) - {p.stock_normal} unidades
                </li>
              ))}
              {criticalProducts.length > 5 && (
                <li className="text-amber-600">
                  y {criticalProducts.length - 5} mas...
                </li>
              )}
            </ul>
          </div>
        </div>
      )}

      {/* Products Table */}
      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
        </div>
      ) : (
        <ProductsTable data={products} onRefresh={fetchProducts} />
      )}
    </div>
  )
}

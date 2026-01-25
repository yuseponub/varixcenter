'use client'

import { useState, useTransition } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import type { MediasProduct } from '@/types/medias/products'
import { toggleProductActive } from '@/app/(protected)/medias/productos/actions'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ProductForm } from './product-form'

interface ProductsTableProps {
  data: MediasProduct[]
  onRefresh?: () => void
}

/**
 * Format number as Colombian peso
 */
function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

/**
 * Products table with sorting, edit dialog, and toggle active
 * Shows dual stock columns (stock_normal and stock_devoluciones)
 */
export function ProductsTable({ data, onRefresh }: ProductsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'tipo', desc: false }])
  const [editProduct, setEditProduct] = useState<MediasProduct | null>(null)
  const [isPending, startTransition] = useTransition()
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const handleToggleActive = async (product: MediasProduct) => {
    setTogglingId(product.id)
    startTransition(async () => {
      await toggleProductActive(product.id, !product.activo)
      setTogglingId(null)
      onRefresh?.()
    })
  }

  const columns: ColumnDef<MediasProduct>[] = [
    {
      accessorKey: 'codigo',
      header: 'Codigo',
      cell: ({ row }) => (
        <span className={`font-mono ${row.original.activo ? '' : 'opacity-50'}`}>
          {row.getValue('codigo')}
        </span>
      ),
    },
    {
      accessorKey: 'tipo',
      header: 'Tipo',
      cell: ({ row }) => (
        <span className={row.original.activo ? '' : 'opacity-50'}>
          {row.getValue('tipo')}
        </span>
      ),
    },
    {
      accessorKey: 'talla',
      header: 'Talla',
      cell: ({ row }) => (
        <Badge variant="outline" className={row.original.activo ? '' : 'opacity-50'}>
          {row.getValue('talla')}
        </Badge>
      ),
    },
    {
      accessorKey: 'precio',
      header: 'Precio',
      cell: ({ row }) => (
        <span className={`font-mono ${row.original.activo ? '' : 'opacity-50'}`}>
          {formatCurrency(row.getValue('precio'))}
        </span>
      ),
    },
    {
      id: 'stock',
      header: 'Stock',
      cell: ({ row }) => {
        const product = row.original
        const total = product.stock_normal + product.stock_devoluciones
        return (
          <div className={`text-sm ${product.activo ? '' : 'opacity-50'}`}>
            <div className="font-medium">{total} total</div>
            <div className="text-muted-foreground text-xs">
              {product.stock_normal} normal / {product.stock_devoluciones} dev
            </div>
          </div>
        )
      },
    },
    {
      accessorKey: 'activo',
      header: 'Estado',
      cell: ({ row }) => {
        const activo = row.getValue('activo') as boolean
        return (
          <Badge variant={activo ? 'default' : 'destructive'}>
            {activo ? 'Activo' : 'Inactivo'}
          </Badge>
        )
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const product = row.original
        const isToggling = togglingId === product.id
        return (
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditProduct(product)}
            >
              Editar
            </Button>
            <Button
              variant={product.activo ? 'destructive' : 'default'}
              size="sm"
              onClick={() => handleToggleActive(product)}
              disabled={isToggling}
            >
              {isToggling ? '...' : product.activo ? 'Desactivar' : 'Activar'}
            </Button>
          </div>
        )
      },
    },
  ]

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: {
      sorting,
    },
  })

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={header.column.getCanSort() ? 'cursor-pointer select-none' : ''}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {header.isPlaceholder ? null : (
                      <div className="flex items-center gap-2">
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                        {{
                          asc: ' ^',
                          desc: ' v',
                        }[header.column.getIsSorted() as string] ?? null}
                      </div>
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No hay productos registrados
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Edit Product Dialog */}
      <Dialog open={!!editProduct} onOpenChange={(open) => !open && setEditProduct(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Producto</DialogTitle>
          </DialogHeader>
          {editProduct && (
            <ProductForm
              product={editProduct}
              onSuccess={() => {
                setEditProduct(null)
                onRefresh?.()
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

'use client'

import { useState } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { StockMovementWithProduct } from '@/lib/queries/medias/movements'
import type { MediasMovementType } from '@/types/medias/products'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface MovementsTableProps {
  data: StockMovementWithProduct[]
}

/**
 * Movement type badge configuration
 */
const MOVEMENT_TYPE_CONFIG: Record<
  MediasMovementType,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string }
> = {
  compra: { label: 'Compra', variant: 'default', className: 'bg-green-500 hover:bg-green-600' },
  venta: { label: 'Venta', variant: 'default', className: 'bg-blue-500 hover:bg-blue-600' },
  devolucion: { label: 'Devolucion', variant: 'default', className: 'bg-purple-500 hover:bg-purple-600' },
  ajuste_entrada: { label: 'Ajuste +', variant: 'default', className: 'bg-teal-500 hover:bg-teal-600' },
  ajuste_salida: { label: 'Ajuste -', variant: 'default', className: 'bg-orange-500 hover:bg-orange-600' },
  transferencia: { label: 'Transferencia', variant: 'secondary' },
}

/**
 * Check if movement type is an "entrada" (increases stock)
 */
function isEntradaType(tipo: MediasMovementType): boolean {
  return ['compra', 'devolucion', 'ajuste_entrada'].includes(tipo)
}

/**
 * Movements history table with sorting
 * Shows fecha, producto, tipo, cantidad, stock antes/despues, notas
 */
export function MovementsTable({ data }: MovementsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])

  const columns: ColumnDef<StockMovementWithProduct>[] = [
    {
      accessorKey: 'created_at',
      header: 'Fecha',
      cell: ({ row }) => {
        const dateStr = row.getValue('created_at') as string
        return (
          <div className="text-sm">
            <div>{format(new Date(dateStr), 'dd/MM/yyyy', { locale: es })}</div>
            <div className="text-muted-foreground text-xs">
              {format(new Date(dateStr), 'HH:mm', { locale: es })}
            </div>
          </div>
        )
      },
    },
    {
      id: 'producto',
      header: 'Producto',
      cell: ({ row }) => {
        const product = row.original.product
        return (
          <div className="text-sm">
            <div className="font-mono">{product.codigo}</div>
            <div className="text-muted-foreground text-xs">
              {product.tipo} {product.talla}
            </div>
          </div>
        )
      },
    },
    {
      accessorKey: 'tipo',
      header: 'Tipo',
      cell: ({ row }) => {
        const tipo = row.getValue('tipo') as MediasMovementType
        const config = MOVEMENT_TYPE_CONFIG[tipo]
        return (
          <Badge variant={config.variant} className={config.className}>
            {config.label}
          </Badge>
        )
      },
    },
    {
      accessorKey: 'cantidad',
      header: 'Cantidad',
      cell: ({ row }) => {
        const cantidad = row.getValue('cantidad') as number
        const tipo = row.original.tipo
        const isEntrada = isEntradaType(tipo)
        return (
          <span
            className={`font-mono font-medium ${
              isEntrada ? 'text-green-600' : 'text-red-600'
            }`}
          >
            {isEntrada ? '+' : '-'}{cantidad}
          </span>
        )
      },
    },
    {
      id: 'stock_antes',
      header: 'Stock Antes',
      cell: ({ row }) => {
        const movement = row.original
        return (
          <div className="text-sm text-muted-foreground">
            <span title="Normal">N: {movement.stock_normal_antes}</span>
            {' | '}
            <span title="Devoluciones">D: {movement.stock_devoluciones_antes}</span>
          </div>
        )
      },
    },
    {
      id: 'stock_despues',
      header: 'Stock Despues',
      cell: ({ row }) => {
        const movement = row.original
        return (
          <div className="text-sm">
            <span title="Normal">N: {movement.stock_normal_despues}</span>
            {' | '}
            <span title="Devoluciones">D: {movement.stock_devoluciones_despues}</span>
          </div>
        )
      },
    },
    {
      accessorKey: 'notas',
      header: 'Notas',
      cell: ({ row }) => {
        const notas = row.getValue('notas') as string | null
        if (!notas) return <span className="text-muted-foreground">-</span>

        const maxLength = 30
        const truncated = notas.length > maxLength

        if (truncated) {
          return (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help text-sm">
                    {notas.slice(0, maxLength)}...
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>{notas}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )
        }

        return <span className="text-sm">{notas}</span>
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
                No hay movimientos registrados
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}

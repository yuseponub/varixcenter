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
import type { Service } from '@/types/services'
import { toggleServiceActive } from '@/app/(protected)/servicios/actions'
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
import { ServiceForm } from './service-form'

interface ServicesTableProps {
  data: Service[]
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
 * Services table with sorting, edit dialog, and toggle active
 */
export function ServicesTable({ data, onRefresh }: ServicesTableProps) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'nombre', desc: false }])
  const [editService, setEditService] = useState<Service | null>(null)
  const [isPending, startTransition] = useTransition()
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const handleToggleActive = async (service: Service) => {
    setTogglingId(service.id)
    startTransition(async () => {
      await toggleServiceActive(service.id, !service.activo)
      setTogglingId(null)
      onRefresh?.()
    })
  }

  const columns: ColumnDef<Service>[] = [
    {
      accessorKey: 'nombre',
      header: 'Nombre',
      cell: ({ row }) => (
        <div className={row.original.activo ? '' : 'opacity-50'}>
          <span className="font-medium">{row.getValue('nombre')}</span>
          {row.original.descripcion && (
            <p className="text-sm text-muted-foreground truncate max-w-xs">
              {row.original.descripcion}
            </p>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'precio_base',
      header: 'Precio Base',
      cell: ({ row }) => {
        const service = row.original
        return (
          <div className={service.activo ? '' : 'opacity-50'}>
            <span className="font-mono">{formatCurrency(service.precio_base)}</span>
            {service.precio_variable && service.precio_minimo !== null && service.precio_maximo !== null && (
              <p className="text-xs text-muted-foreground">
                {formatCurrency(service.precio_minimo)} - {formatCurrency(service.precio_maximo)}
              </p>
            )}
          </div>
        )
      },
    },
    {
      accessorKey: 'precio_variable',
      header: 'Tipo',
      cell: ({ row }) => {
        const service = row.original
        return (
          <Badge
            variant={service.precio_variable ? 'secondary' : 'outline'}
            className={service.activo ? '' : 'opacity-50'}
          >
            {service.precio_variable ? 'Variable' : 'Fijo'}
          </Badge>
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
        const service = row.original
        const isToggling = togglingId === service.id
        return (
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditService(service)}
            >
              Editar
            </Button>
            <Button
              variant={service.activo ? 'destructive' : 'default'}
              size="sm"
              onClick={() => handleToggleActive(service)}
              disabled={isToggling}
            >
              {isToggling ? '...' : service.activo ? 'Desactivar' : 'Activar'}
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
                  No hay servicios registrados
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Edit Service Dialog */}
      <Dialog open={!!editService} onOpenChange={(open) => !open && setEditService(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Servicio</DialogTitle>
          </DialogHeader>
          {editService && (
            <ServiceForm
              service={editService}
              onSuccess={() => {
                setEditService(null)
                onRefresh?.()
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

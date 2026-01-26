'use client'

import { useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Eye, Package, Search } from 'lucide-react'
import { PurchaseStatusBadge } from './purchase-status-badge'
import type { Purchase, CompraEstado } from '@/types/medias/purchases'
import { PURCHASE_STATES, PURCHASE_STATE_LABELS } from '@/types/medias/purchases'

interface PurchasesTableProps {
  purchases: Purchase[]
  onFilterChange?: (filters: {
    estado?: CompraEstado
    proveedor?: string
  }) => void
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(amount)

export function PurchasesTable({ purchases, onFilterChange }: PurchasesTableProps) {
  const [estadoFilter, setEstadoFilter] = useState<CompraEstado | 'all'>('all')
  const [proveedorFilter, setProveedorFilter] = useState('')

  const handleEstadoChange = (value: string) => {
    const estado = value === 'all' ? undefined : (value as CompraEstado)
    setEstadoFilter(value as CompraEstado | 'all')
    onFilterChange?.({ estado, proveedor: proveedorFilter || undefined })
  }

  const handleProveedorChange = (value: string) => {
    setProveedorFilter(value)
    onFilterChange?.({
      estado: estadoFilter === 'all' ? undefined : estadoFilter,
      proveedor: value || undefined,
    })
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar por proveedor..."
              value={proveedorFilter}
              onChange={(e) => handleProveedorChange(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        <Select value={estadoFilter} onValueChange={handleEstadoChange}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filtrar por estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {PURCHASE_STATES.map((estado) => (
              <SelectItem key={estado} value={estado}>
                {PURCHASE_STATE_LABELS[estado]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>No. Compra</TableHead>
              <TableHead>Fecha Factura</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {purchases.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                  <Package className="mx-auto h-12 w-12 text-gray-300 mb-2" />
                  <p>No hay compras registradas</p>
                </TableCell>
              </TableRow>
            ) : (
              purchases.map((purchase) => (
                <TableRow key={purchase.id}>
                  <TableCell className="font-mono">
                    {purchase.numero_compra}
                  </TableCell>
                  <TableCell>
                    {format(new Date(purchase.fecha_factura), 'dd MMM yyyy', {
                      locale: es,
                    })}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate">
                    {purchase.proveedor}
                  </TableCell>
                  <TableCell className="font-medium">
                    {formatCurrency(purchase.total)}
                  </TableCell>
                  <TableCell>
                    <PurchaseStatusBadge estado={purchase.estado} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/medias/compras/${purchase.id}`}>
                      <Button variant="ghost" size="sm">
                        <Eye className="h-4 w-4 mr-1" />
                        Ver
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

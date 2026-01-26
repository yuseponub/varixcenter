'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Search, ArrowRight, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { MediasSaleWithDetails } from '@/types/medias/sales'

interface SaleSearchSelectProps {
  activeSales: MediasSaleWithDetails[]
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(amount)

/**
 * Client component for searching and selecting a sale for return
 * Filters local list of active sales by numero_venta or patient name
 * On selection, redirects to ?sale_id=xxx
 */
export function SaleSearchSelect({ activeSales }: SaleSearchSelectProps) {
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState('')
  const [isPending, startTransition] = useTransition()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Filter sales by search term
  const filteredSales = activeSales.filter((sale) => {
    if (!searchTerm) return true
    const term = searchTerm.toLowerCase()

    // Search by numero_venta
    if (sale.numero_venta.toLowerCase().includes(term)) return true

    // Search by patient name
    if (sale.patient) {
      const fullName = `${sale.patient.nombre} ${sale.patient.apellido}`.toLowerCase()
      if (fullName.includes(term)) return true
      if (sale.patient.cedula.includes(term)) return true
    }

    return false
  })

  const handleSelect = (saleId: string) => {
    setSelectedId(saleId)
    startTransition(() => {
      router.push(`/medias/devoluciones/nueva?sale_id=${saleId}`)
    })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="search">Buscar venta</Label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="search"
            placeholder="Numero de venta (VTA-) o nombre del paciente..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {filteredSales.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          {searchTerm ? (
            <>No se encontraron ventas que coincidan con &quot;{searchTerm}&quot;</>
          ) : (
            <>No hay ventas activas disponibles para devolucion</>
          )}
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Venta</TableHead>
                <TableHead>Paciente</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Productos</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSales.slice(0, 20).map((sale) => (
                <TableRow key={sale.id}>
                  <TableCell className="font-mono font-medium">
                    {sale.numero_venta}
                  </TableCell>
                  <TableCell>
                    {sale.patient ? (
                      <div>
                        <span className="font-medium">
                          {sale.patient.nombre} {sale.patient.apellido}
                        </span>
                        <br />
                        <span className="text-sm text-muted-foreground">
                          {sale.patient.cedula}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Sin paciente</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {format(new Date(sale.created_at), 'dd/MM/yyyy', { locale: es })}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(sale.total)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="outline">
                      {sale.items.length} item{sale.items.length !== 1 ? 's' : ''}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSelect(sale.id)}
                      disabled={isPending && selectedId === sale.id}
                    >
                      {isPending && selectedId === sale.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          Seleccionar
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </>
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {filteredSales.length > 20 && (
            <div className="p-2 text-center text-sm text-muted-foreground border-t">
              Mostrando 20 de {filteredSales.length} ventas. Use el buscador para filtrar.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

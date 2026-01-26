'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Lock } from 'lucide-react'
import { PaymentsTable } from '@/components/payments/payments-table'
import type { PaymentWithDetails } from '@/types/payments'

type FilterMode = 'todos' | 'dia' | 'semana'

interface PaymentsViewProps {
  payments: PaymentWithDetails[]
}

/**
 * Get start of today in local timezone
 */
function getStartOfDay(): Date {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return now
}

/**
 * Get start of week (Monday) in local timezone
 */
function getStartOfWeek(): Date {
  const now = new Date()
  const day = now.getDay()
  const diff = now.getDate() - day + (day === 0 ? -6 : 1) // Adjust for Sunday
  now.setDate(diff)
  now.setHours(0, 0, 0, 0)
  return now
}

export function PaymentsView({ payments }: PaymentsViewProps) {
  const [filterMode, setFilterMode] = useState<FilterMode>('todos')

  // Filter payments based on selected mode
  const filteredPayments = useMemo(() => {
    if (filterMode === 'todos') {
      return payments
    }

    const startDate = filterMode === 'dia' ? getStartOfDay() : getStartOfWeek()

    return payments.filter((payment) => {
      const paymentDate = new Date(payment.created_at)
      return paymentDate >= startDate
    })
  }, [payments, filterMode])

  // Calculate totals for display
  const total = useMemo(() => {
    return filteredPayments
      .filter(p => p.estado === 'activo')
      .reduce((sum, p) => sum + p.total, 0)
  }, [filteredPayments])

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(amount)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pagos</h1>
          <p className="text-muted-foreground">
            Registro de pagos de la clinica
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Filter Select */}
          <Select
            value={filterMode}
            onValueChange={(v) => setFilterMode(v as FilterMode)}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="dia">Día</SelectItem>
              <SelectItem value="semana">Semana</SelectItem>
            </SelectContent>
          </Select>

          {/* Cierre button - only visible when "Día" is selected */}
          {filterMode === 'dia' && (
            <Button variant="outline" asChild>
              <Link href="/cierres/nuevo">
                <Lock className="mr-2 h-4 w-4" />
                Cierre
              </Link>
            </Button>
          )}

          {/* Nuevo Pago button */}
          <Button asChild>
            <Link href="/pagos/nuevo">
              <Plus className="mr-2 h-4 w-4" />
              Nuevo Pago
            </Link>
          </Button>
        </div>
      </div>

      {/* Summary when filtered */}
      {filterMode !== 'todos' && (
        <div className="bg-muted/50 rounded-lg p-4 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {filterMode === 'dia' ? 'Total del día' : 'Total de la semana'}
            {' '}({filteredPayments.filter(p => p.estado === 'activo').length} pagos activos)
          </span>
          <span className="text-lg font-bold">{formatCurrency(total)}</span>
        </div>
      )}

      {/* Table */}
      <PaymentsTable payments={filteredPayments} />
    </div>
  )
}

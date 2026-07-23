'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Lock, Banknote, CreditCard } from 'lucide-react'
import { PaymentsTable } from '@/components/payments/payments-table'
import { splitMethodAmounts, type PaymentWithDetails } from '@/types/payments'

type FilterMode = 'todos' | 'dia' | 'semana'

interface PaymentsViewProps {
  payments: PaymentWithDetails[]
  canManageWimax: boolean
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

export function PaymentsView({ payments, canManageWimax }: PaymentsViewProps) {
  const router = useRouter()
  const [filterMode, setFilterMode] = useState<FilterMode>('todos')
  const hasRunningWimaxJob = payments.some((payment) =>
    ['en_cola', 'preparando', 'aprobada', 'verificando'].includes(
      payment.wimax_invoice_jobs?.estado ?? ''
    )
  )

  useEffect(() => {
    if (!hasRunningWimaxJob) return
    const interval = window.setInterval(() => router.refresh(), 5_000)
    return () => window.clearInterval(interval)
  }, [hasRunningWimaxJob, router])

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

  // Breakdown by method (active payments only), split mixed payments per method
  const breakdown = useMemo(() => {
    return filteredPayments
      .filter(p => p.estado === 'activo')
      .reduce(
        (acc, p) => {
          const s = splitMethodAmounts(p.payment_methods)
          acc.efectivo += s.efectivo
          acc.tarjeta += s.tarjeta
          acc.otros += s.otros
          return acc
        },
        { efectivo: 0, tarjeta: 0, otros: 0 }
      )
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
        <div className="bg-muted/50 rounded-lg p-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <span className="text-sm text-muted-foreground">
            {filterMode === 'dia' ? 'Total del día' : 'Total de la semana'}
            {' '}({filteredPayments.filter(p => p.estado === 'activo').length} pagos activos)
          </span>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="flex items-center gap-1.5 text-sm">
              <Banknote className="h-4 w-4 text-green-600" />
              <span className="text-muted-foreground">Efectivo:</span>
              <span className="font-medium">{formatCurrency(breakdown.efectivo)}</span>
            </span>
            <span className="flex items-center gap-1.5 text-sm">
              <CreditCard className="h-4 w-4 text-blue-600" />
              <span className="text-muted-foreground">Tarjeta:</span>
              <span className="font-medium">{formatCurrency(breakdown.tarjeta)}</span>
            </span>
            {breakdown.otros > 0 && (
              <span className="flex items-center gap-1.5 text-sm">
                <span className="text-muted-foreground">Otros:</span>
                <span className="font-medium">{formatCurrency(breakdown.otros)}</span>
              </span>
            )}
            <span className="text-lg font-bold">{formatCurrency(total)}</span>
          </div>
        </div>
      )}

      {/* Table */}
      <PaymentsTable payments={filteredPayments} canManageWimax={canManageWimax} />
    </div>
  )
}

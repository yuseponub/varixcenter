'use client'

import { useCallback, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Plus,
  Lock,
  Banknote,
  CreditCard,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { PaymentsTable } from '@/components/payments/payments-table'
import { splitMethodAmounts, type PaymentWithDetails } from '@/types/payments'

export type PaymentsFilterMode = 'todos' | 'dia' | 'semana'

interface PaymentsViewProps {
  payments: PaymentWithDetails[]
  canManageWimax: boolean
  /** Modo de filtro activo (viene de la URL; el server ya filtro por rango). */
  modo: PaymentsFilterMode
  /** Fecha civil seleccionada YYYY-MM-DD (Bogota). */
  fecha: string
  /** Fecha civil de hoy YYYY-MM-DD (Bogota), calculada en el server. */
  hoy: string
}

/** Suma dias a una fecha civil YYYY-MM-DD sin lios de zona horaria. */
function shiftFecha(fecha: string, days: number): string {
  const [y, m, d] = fecha.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

const dayLabelFmt = new Intl.DateTimeFormat('es-CO', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
})

/** Etiqueta legible de la fecha civil ("viernes, 25 de julio"). */
function fechaLabel(fecha: string): string {
  return dayLabelFmt.format(new Date(`${fecha}T12:00:00Z`))
}

export function PaymentsView({
  payments,
  canManageWimax,
  modo,
  fecha,
  hoy,
}: PaymentsViewProps) {
  const router = useRouter()
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

  // Navegacion: todo va por URL para que el server consulte el rango real
  // (sin el tope de "ultimos 100" del filtro viejo en cliente).
  const navigate = useCallback(
    (nextModo: PaymentsFilterMode, nextFecha: string) => {
      router.push(`/pagos?modo=${nextModo}&fecha=${nextFecha}`)
    },
    [router]
  )

  const step = modo === 'semana' ? 7 : 1
  const esHoy = fecha === hoy

  // Totales (el server ya filtro por rango; aqui solo se suma)
  const total = useMemo(() => {
    return payments
      .filter((p) => p.estado === 'activo')
      .reduce((sum, p) => sum + p.total, 0)
  }, [payments])

  const breakdown = useMemo(() => {
    return payments
      .filter((p) => p.estado === 'activo')
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
  }, [payments])

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(amount)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">Pagos</h1>
          <p className="text-muted-foreground">
            Registro de pagos de la clinica
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Filter Select */}
          <Select
            value={modo}
            onValueChange={(v) => navigate(v as PaymentsFilterMode, fecha)}
          >
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dia">Día</SelectItem>
              <SelectItem value="semana">Semana</SelectItem>
              <SelectItem value="todos">Todos</SelectItem>
            </SelectContent>
          </Select>

          {/* Navegacion por fecha (dia o semana) */}
          {modo !== 'todos' && (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                aria-label={modo === 'dia' ? 'Día anterior' : 'Semana anterior'}
                onClick={() => navigate(modo, shiftFecha(fecha, -step))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Input
                type="date"
                value={fecha}
                max={hoy}
                onChange={(e) => e.target.value && navigate(modo, e.target.value)}
                className="w-[150px]"
                aria-label="Seleccionar fecha"
              />
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                aria-label={modo === 'dia' ? 'Día siguiente' : 'Semana siguiente'}
                disabled={esHoy}
                onClick={() => navigate(modo, shiftFecha(fecha, step))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              {!esHoy && (
                <Button variant="outline" onClick={() => navigate(modo, hoy)}>
                  Hoy
                </Button>
              )}
            </div>
          )}

          {/* Cierre button - only visible when "Día" is selected */}
          {modo === 'dia' && (
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
      {modo !== 'todos' && (
        <div className="bg-muted/50 rounded-lg p-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <span className="text-sm text-muted-foreground">
            <span className="capitalize font-medium text-foreground">
              {modo === 'dia'
                ? fechaLabel(fecha)
                : `Semana del ${fechaLabel(fecha)}`}
            </span>
            {' '}({payments.filter((p) => p.estado === 'activo').length} pagos activos)
          </span>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="flex items-center gap-1.5 text-sm">
              <Banknote className="h-4 w-4 text-success-foreground" />
              <span className="text-muted-foreground">Efectivo:</span>
              <span className="font-medium">{formatCurrency(breakdown.efectivo)}</span>
            </span>
            <span className="flex items-center gap-1.5 text-sm">
              <CreditCard className="h-4 w-4 text-primary" />
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
      <PaymentsTable payments={payments} canManageWimax={canManageWimax} />
    </div>
  )
}

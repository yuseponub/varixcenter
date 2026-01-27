import { MetricCard } from './metric-card'
import { Banknote, ShoppingCart, TrendingUp, RotateCcw } from 'lucide-react'
import type { DashboardMetrics } from '@/types/medias/dashboard'

interface DashboardGridProps {
  metrics: DashboardMetrics
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(amount)

export function DashboardGrid({ metrics }: DashboardGridProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {/* Efectivo en Caja - MOST VISIBLE per CONTEXT.md */}
      <MetricCard
        title="Efectivo en Caja"
        value={metrics.efectivo_en_caja}
        icon={<Banknote className="h-5 w-5" />}
        variant="primary"
      />

      {/* Ventas Hoy */}
      <MetricCard
        title="Ventas Hoy"
        value={`${metrics.ventas_hoy_count} - ${formatCurrency(metrics.ventas_hoy_total)}`}
        icon={<ShoppingCart className="h-5 w-5" />}
      />

      {/* Ventas del Mes */}
      <MetricCard
        title="Ventas del Mes"
        value={`${metrics.ventas_mes_count} - ${formatCurrency(metrics.ventas_mes_total)}`}
        icon={<TrendingUp className="h-5 w-5" />}
      />

      {/* Devoluciones Pendientes */}
      <MetricCard
        title="Devoluciones Pendientes"
        value={metrics.devoluciones_pendientes.toString()}
        icon={<RotateCcw className="h-5 w-5" />}
      />
    </div>
  )
}

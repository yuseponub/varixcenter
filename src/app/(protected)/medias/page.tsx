import { Metadata } from 'next'
import { Separator } from '@/components/ui/separator'
import { DashboardGrid } from '@/components/medias/dashboard/dashboard-grid'
import { NavigationCards } from '@/components/medias/dashboard/nav-card'
import { StockAlertsCard } from '@/components/medias/dashboard/stock-alerts-card'
import {
  getDashboardMetrics,
  getStockAlertsSummary,
} from '@/lib/queries/medias/dashboard'

export const metadata: Metadata = {
  title: 'Medias | Dashboard',
}

/**
 * Medias Dashboard Page
 *
 * Server component that serves as the home page for the Medias module.
 * Displays operational metrics, navigation to all sections, and stock alerts.
 *
 * Per CONTEXT.md: Dashboard is at /medias (replaces old landing),
 * productos is at /medias/productos.
 */
export default async function MediasDashboardPage() {
  // Fetch data in parallel for optimal performance
  const [metrics, stockAlerts] = await Promise.all([
    getDashboardMetrics(),
    getStockAlertsSummary(),
  ])

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Medias de Compresion</h1>
        <p className="text-muted-foreground">Dashboard operativo</p>
      </div>

      <Separator />

      {/* Metrics Grid - Efectivo en Caja most prominent */}
      <DashboardGrid metrics={metrics} />

      <Separator />

      {/* Navigation Cards - 5 section links */}
      <NavigationCards />

      <Separator />

      {/* Stock Alerts Card */}
      <StockAlertsCard summary={stockAlerts} />
    </div>
  )
}

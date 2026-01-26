'use client'

/**
 * Reports Page Client Component
 *
 * Financial reports with date filtering, summary cards, and income chart.
 * Handles client-side state and data fetching for date range changes.
 */

import { useState, useCallback } from 'react'
import { getReportData, ReportDataResult } from './actions'
import { DateRangePicker } from '@/components/reports/date-range-picker'
import { ReportSummaryCard } from '@/components/reports/report-summary-card'
import { IncomeBarChart } from '@/components/reports/income-bar-chart'
import { formatCurrency, IncomeReport, DailyIncomeData } from '@/types/reports'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DollarSign,
  Banknote,
  CreditCard,
  ArrowRightLeft,
  Smartphone,
  Percent,
  XCircle,
  FileText,
  Calendar,
  Loader2,
  AlertTriangle,
} from 'lucide-react'

interface ReportsPageClientProps {
  initialReport: IncomeReport
  initialDailyBreakdown: DailyIncomeData[]
  hasAccess: boolean
}

export function ReportsPageClient({
  initialReport,
  initialDailyBreakdown,
  hasAccess,
}: ReportsPageClientProps) {
  const [report, setReport] = useState<IncomeReport>(initialReport)
  const [dailyBreakdown, setDailyBreakdown] = useState<DailyIncomeData[]>(initialDailyBreakdown)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Handle date range changes
  const handleRangeChange = useCallback(async (startDate: string, endDate: string) => {
    setLoading(true)
    setError(null)

    try {
      const result: ReportDataResult = await getReportData(startDate, endDate)

      if ('error' in result) {
        setError(result.error)
      } else {
        setReport(result.report)
        setDailyBreakdown(result.dailyBreakdown)
      }
    } catch {
      setError('Error al cargar los datos. Por favor intente de nuevo.')
    } finally {
      setLoading(false)
    }
  }, [])

  // Don't render if no access
  if (!hasAccess) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center gap-3 text-yellow-700">
          <AlertTriangle className="h-6 w-6" />
          <div>
            <h2 className="text-lg font-semibold">Acceso Denegado</h2>
            <p className="text-sm">Solo Admin y Medico pueden ver reportes financieros.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Reportes Financieros</h1>
      </div>

      {/* Date Range Picker */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Periodo del Reporte</CardTitle>
        </CardHeader>
        <CardContent>
          <DateRangePicker onRangeChange={handleRangeChange} initialPeriod="diario" />
        </CardContent>
      </Card>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      )}

      {/* Report Content */}
      {!loading && !error && (
        <>
          {/* Summary Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <ReportSummaryCard
              title="Total Ingresos"
              value={formatCurrency(report.grand_total)}
              subtitle="Suma de todos los metodos"
              icon={<DollarSign className="h-4 w-4" />}
              variant="success"
            />
            <ReportSummaryCard
              title="Efectivo"
              value={formatCurrency(report.total_efectivo)}
              icon={<Banknote className="h-4 w-4" />}
            />
            <ReportSummaryCard
              title="Tarjeta"
              value={formatCurrency(report.total_tarjeta)}
              icon={<CreditCard className="h-4 w-4" />}
            />
            <ReportSummaryCard
              title="Transferencia"
              value={formatCurrency(report.total_transferencia)}
              icon={<ArrowRightLeft className="h-4 w-4" />}
            />
            <ReportSummaryCard
              title="Nequi"
              value={formatCurrency(report.total_nequi)}
              icon={<Smartphone className="h-4 w-4" />}
            />
            <ReportSummaryCard
              title="Descuentos"
              value={formatCurrency(report.total_descuentos)}
              subtitle="Total descontado"
              icon={<Percent className="h-4 w-4" />}
            />
            <ReportSummaryCard
              title="Anulaciones"
              value={formatCurrency(report.total_anulaciones)}
              subtitle="Pagos anulados"
              icon={<XCircle className="h-4 w-4" />}
              variant="warning"
            />
            <ReportSummaryCard
              title="Pagos Registrados"
              value={report.payment_count.toString()}
              subtitle="Cantidad de pagos"
              icon={<FileText className="h-4 w-4" />}
            />
            <ReportSummaryCard
              title="Citas Atendidas"
              value={report.citas_atendidas.toString()}
              subtitle="Citas completadas"
              icon={<Calendar className="h-4 w-4" />}
            />
          </div>

          {/* Income Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Ingresos por Metodo de Pago</CardTitle>
            </CardHeader>
            <CardContent>
              <IncomeBarChart data={dailyBreakdown} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

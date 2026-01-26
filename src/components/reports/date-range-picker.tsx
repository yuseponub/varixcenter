'use client'

/**
 * Date Range Picker Component
 *
 * Allows selection of report period (diario, mensual, rango) with
 * automatic date range calculation or custom date inputs.
 */

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Calendar } from 'lucide-react'
import { ReportPeriod } from '@/types/reports'
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfDay,
  endOfDay,
} from 'date-fns'

interface DateRangePickerProps {
  /** Callback when date range changes */
  onRangeChange: (startDate: string, endDate: string) => void
  /** Initial period selection */
  initialPeriod?: ReportPeriod
}

/**
 * Format date to YYYY-MM-DD for input values and API calls.
 */
function formatDateForInput(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

/**
 * Get date range for a given period.
 */
function getDateRangeForPeriod(period: ReportPeriod): {
  startDate: string
  endDate: string
} {
  const now = new Date()

  switch (period) {
    case 'diario':
      const today = formatDateForInput(startOfDay(now))
      return { startDate: today, endDate: today }
    case 'mensual':
      return {
        startDate: formatDateForInput(startOfMonth(now)),
        endDate: formatDateForInput(endOfMonth(now)),
      }
    case 'rango':
    default:
      // Default to last 7 days for custom range
      const sevenDaysAgo = new Date(now)
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      return {
        startDate: formatDateForInput(sevenDaysAgo),
        endDate: formatDateForInput(now),
      }
  }
}

export function DateRangePicker({
  onRangeChange,
  initialPeriod = 'diario',
}: DateRangePickerProps) {
  const [period, setPeriod] = useState<ReportPeriod>(initialPeriod)
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [isInitialized, setIsInitialized] = useState(false)

  // Initialize dates on mount
  useEffect(() => {
    const { startDate: start, endDate: end } = getDateRangeForPeriod(initialPeriod)
    setStartDate(start)
    setEndDate(end)
    setIsInitialized(true)
  }, [initialPeriod])

  // Auto-update dates when period changes (for diario/mensual)
  useEffect(() => {
    if (!isInitialized) return

    if (period === 'diario' || period === 'mensual') {
      const { startDate: start, endDate: end } = getDateRangeForPeriod(period)
      setStartDate(start)
      setEndDate(end)
      onRangeChange(start, end)
    }
  }, [period, isInitialized, onRangeChange])

  // Handle period button click
  const handlePeriodChange = (newPeriod: ReportPeriod) => {
    setPeriod(newPeriod)
  }

  // Handle apply button for custom range
  const handleApplyRange = () => {
    if (startDate && endDate) {
      onRangeChange(startDate, endDate)
    }
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      {/* Period selection buttons */}
      <div className="flex gap-2">
        <Button
          variant={period === 'diario' ? 'default' : 'outline'}
          size="sm"
          onClick={() => handlePeriodChange('diario')}
        >
          Diario
        </Button>
        <Button
          variant={period === 'mensual' ? 'default' : 'outline'}
          size="sm"
          onClick={() => handlePeriodChange('mensual')}
        >
          Mensual
        </Button>
        <Button
          variant={period === 'rango' ? 'default' : 'outline'}
          size="sm"
          onClick={() => handlePeriodChange('rango')}
        >
          <Calendar className="mr-2 h-4 w-4" />
          Rango
        </Button>
      </div>

      {/* Custom date range inputs (only shown for 'rango' period) */}
      {period === 'rango' && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <span className="text-muted-foreground">a</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <Button size="sm" onClick={handleApplyRange}>
            Aplicar
          </Button>
        </div>
      )}
    </div>
  )
}

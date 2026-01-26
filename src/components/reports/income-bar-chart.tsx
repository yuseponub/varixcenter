'use client'

/**
 * Income Bar Chart Component
 *
 * Stacked bar chart showing income by payment method over time.
 * Uses Recharts with shadcn/ui chart components.
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { DailyIncomeData, formatCurrency } from '@/types/reports'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

/**
 * Chart configuration for payment method colors.
 * Uses CSS variables --chart-1 through --chart-4.
 */
const chartConfig = {
  efectivo: {
    label: 'Efectivo',
    color: 'hsl(var(--chart-1))',
  },
  tarjeta: {
    label: 'Tarjeta',
    color: 'hsl(var(--chart-2))',
  },
  transferencia: {
    label: 'Transferencia',
    color: 'hsl(var(--chart-3))',
  },
  nequi: {
    label: 'Nequi',
    color: 'hsl(var(--chart-4))',
  },
} satisfies ChartConfig

interface IncomeBarChartProps {
  data: DailyIncomeData[]
}

/**
 * Format date for X-axis display (dd/MM format).
 */
function formatDateForAxis(dateString: string): string {
  try {
    const date = parseISO(dateString)
    return format(date, 'dd/MM', { locale: es })
  } catch {
    return dateString
  }
}

/**
 * Custom tooltip formatter for currency values.
 */
function tooltipFormatter(value: number): string {
  return formatCurrency(value)
}

export function IncomeBarChart({ data }: IncomeBarChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-[350px] w-full items-center justify-center text-muted-foreground">
        No hay datos para mostrar
      </div>
    )
  }

  // Transform data for chart display
  const chartData = data.map((item) => ({
    ...item,
    displayDate: formatDateForAxis(item.fecha),
  }))

  return (
    <ChartContainer config={chartConfig} className="min-h-[350px] w-full">
      <BarChart
        data={chartData}
        margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
      >
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="displayDate"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={(value) => formatCurrency(value)}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value) => tooltipFormatter(value as number)}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar
          dataKey="efectivo"
          stackId="income"
          fill="var(--color-efectivo)"
          radius={[0, 0, 0, 0]}
        />
        <Bar
          dataKey="tarjeta"
          stackId="income"
          fill="var(--color-tarjeta)"
          radius={[0, 0, 0, 0]}
        />
        <Bar
          dataKey="transferencia"
          stackId="income"
          fill="var(--color-transferencia)"
          radius={[0, 0, 0, 0]}
        />
        <Bar
          dataKey="nequi"
          stackId="income"
          fill="var(--color-nequi)"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ChartContainer>
  )
}

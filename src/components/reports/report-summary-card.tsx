/**
 * Report Summary Card Component
 *
 * Displays a summary metric with title, value, optional subtitle and icon.
 * Supports variant-based styling for visual feedback.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface ReportSummaryCardProps {
  /** Card title displayed in the header */
  title: string
  /** Pre-formatted value string (e.g., "$50.000") */
  value: string
  /** Optional subtitle text below the value */
  subtitle?: string
  /** Optional icon to display in header */
  icon?: React.ReactNode
  /** Visual variant for border color accent */
  variant?: 'default' | 'success' | 'warning' | 'danger'
}

/**
 * Variant-based border color classes.
 */
const variantStyles = {
  default: '',
  success: 'border-green-500',
  warning: 'border-yellow-500',
  danger: 'border-red-500',
} as const

export function ReportSummaryCard({
  title,
  value,
  subtitle,
  icon,
  variant = 'default',
}: ReportSummaryCardProps) {
  return (
    <Card className={cn(variantStyles[variant])}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon && (
          <div className="text-muted-foreground">{icon}</div>
        )}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  )
}

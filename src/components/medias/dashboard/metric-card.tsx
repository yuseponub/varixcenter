import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface MetricCardProps {
  title: string
  value: string | number
  icon: React.ReactNode
  variant?: 'default' | 'primary'
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(amount)

export function MetricCard({ title, value, icon, variant = 'default' }: MetricCardProps) {
  const displayValue = typeof value === 'number' ? formatCurrency(value) : value
  const isPrimary = variant === 'primary'

  return (
    <Card className={cn(isPrimary && 'bg-primary/10')}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className={cn('text-muted-foreground', isPrimary && 'text-primary')}>
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div className={cn('text-2xl font-bold', isPrimary && 'text-3xl')}>
          {displayValue}
        </div>
      </CardContent>
    </Card>
  )
}

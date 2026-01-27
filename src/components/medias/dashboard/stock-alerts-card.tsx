import Link from 'next/link'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import type { StockAlertsSummary } from '@/types/medias/dashboard'

interface StockAlertsCardProps {
  summary: StockAlertsSummary
}

export function StockAlertsCard({ summary }: StockAlertsCardProps) {
  const hasAlerts = summary.critical_count > 0

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <AlertTriangle className={hasAlerts ? 'h-5 w-5 text-destructive' : 'h-5 w-5 text-muted-foreground'} />
          Stock Critico
        </CardTitle>
        {hasAlerts && (
          <Badge variant="destructive">
            {summary.critical_count} producto{summary.critical_count !== 1 ? 's' : ''}
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        {hasAlerts ? (
          <div className="space-y-3">
            {summary.products.map((product) => (
              <div
                key={product.id}
                className="flex items-center justify-between text-sm"
              >
                <div className="flex flex-col">
                  <span className="font-medium">{product.codigo}</span>
                  <span className="text-muted-foreground text-xs">
                    {product.tipo} - {product.talla}
                  </span>
                </div>
                <Badge variant="destructive" className="ml-2">
                  {product.stock_normal} unid.
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Sin alertas de stock
          </p>
        )}
      </CardContent>
      {hasAlerts && (
        <CardFooter className="pt-0">
          <Link
            href="/medias/productos"
            className="text-sm text-primary hover:underline flex items-center gap-1"
          >
            Ver todos los productos
            <ArrowRight className="h-4 w-4" />
          </Link>
        </CardFooter>
      )}
    </Card>
  )
}

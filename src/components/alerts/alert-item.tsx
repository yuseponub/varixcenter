'use client'

import { Alert, ALERT_SEVERIDAD_CONFIG, ALERT_TIPO_LABELS } from '@/types/alerts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Info, AlertTriangle, AlertCircle, ExternalLink } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale/es'
import Link from 'next/link'

/**
 * Icon mapping for severity levels
 */
const SEVERITY_ICONS = {
  info: Info,
  advertencia: AlertTriangle,
  critico: AlertCircle,
} as const

interface AlertItemProps {
  alert: Alert
  onResolve?: (alert: Alert) => void
}

/**
 * Alert Item Component
 *
 * Displays a single alert with severity styling, type label,
 * and action buttons for resolving or viewing related entity.
 */
export function AlertItem({ alert, onResolve }: AlertItemProps) {
  const config = ALERT_SEVERIDAD_CONFIG[alert.severidad]
  const Icon = SEVERITY_ICONS[alert.severidad]

  // Build reference link based on tipo
  const getReferenceLink = (): string | null => {
    if (!alert.referencia_tipo || !alert.referencia_id) return null

    switch (alert.referencia_tipo) {
      case 'payment':
        return `/pagos/${alert.referencia_id}`
      case 'cash_closing':
        return `/cierres/${alert.referencia_id}`
      default:
        return null
    }
  }

  const referenceLink = getReferenceLink()

  return (
    <div className={`p-4 rounded-lg ${config.bgColor}`}>
      <div className="flex items-start gap-3">
        <Icon className={`h-5 w-5 mt-0.5 ${
          alert.severidad === 'critico'
            ? 'text-red-600'
            : alert.severidad === 'advertencia'
              ? 'text-yellow-600'
              : 'text-blue-600'
        }`} />

        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={config.variant}>
              {config.label}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {ALERT_TIPO_LABELS[alert.tipo]}
            </span>
          </div>

          <p className="font-medium text-sm">{alert.titulo}</p>
          <p className="text-sm text-gray-600">{alert.descripcion}</p>

          <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
            <span>
              {format(new Date(alert.created_at), 'dd MMM yyyy HH:mm', { locale: es })}
            </span>

            {alert.resuelta && alert.resuelta_at && (
              <span className="text-green-600">
                Resuelta el {format(new Date(alert.resuelta_at), 'dd MMM yyyy', { locale: es })}
              </span>
            )}
          </div>

          {alert.resuelta && alert.resuelta_notas && (
            <p className="text-xs text-muted-foreground mt-1 italic">
              Notas: {alert.resuelta_notas}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {referenceLink && (
            <Button
              variant="outline"
              size="sm"
              asChild
            >
              <Link href={referenceLink}>
                <ExternalLink className="h-4 w-4 mr-1" />
                Ver
              </Link>
            </Button>
          )}

          {!alert.resuelta && onResolve && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onResolve(alert)}
            >
              Resolver
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

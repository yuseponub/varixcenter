/**
 * Notification Status Badge
 *
 * Displays notification status with appropriate color and icon.
 */
import { Badge } from '@/components/ui/badge'
import { CheckCircle, XCircle, Clock, RefreshCw } from 'lucide-react'
import type { NotificationStatus } from '@/types/notifications'

const STATUS_CONFIG: Record<
  NotificationStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; Icon: typeof Clock }
> = {
  pendiente: { label: 'Pendiente', variant: 'secondary', Icon: Clock },
  enviado: { label: 'Enviado', variant: 'default', Icon: CheckCircle },
  fallido: { label: 'Fallido', variant: 'destructive', Icon: XCircle },
  reintentando: { label: 'Reintentando', variant: 'outline', Icon: RefreshCw },
}

interface NotificationStatusBadgeProps {
  status: NotificationStatus
}

export function NotificationStatusBadge({ status }: NotificationStatusBadgeProps) {
  const config = STATUS_CONFIG[status]
  const { Icon } = config

  return (
    <Badge variant={config.variant} className="gap-1">
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  )
}

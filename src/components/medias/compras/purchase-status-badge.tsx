import { Badge } from '@/components/ui/badge'
import type { CompraEstado } from '@/types/medias/purchases'
import { PURCHASE_STATE_LABELS } from '@/types/medias/purchases'

const STATE_VARIANTS: Record<CompraEstado, 'secondary' | 'default' | 'destructive'> = {
  'pendiente_recepcion': 'secondary',
  'recibido': 'default',
  'anulado': 'destructive',
}

interface PurchaseStatusBadgeProps {
  estado: CompraEstado
}

export function PurchaseStatusBadge({ estado }: PurchaseStatusBadgeProps) {
  return (
    <Badge variant={STATE_VARIANTS[estado]}>
      {PURCHASE_STATE_LABELS[estado]}
    </Badge>
  )
}

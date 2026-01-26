'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  type DevolucionEstado,
  DEVOLUCION_ESTADO_LABELS,
  DEVOLUCION_ESTADO_COLORS,
} from '@/types/medias/returns'

interface ReturnStatusBadgeProps {
  estado: DevolucionEstado
}

/**
 * Badge component for displaying return status with appropriate colors
 * Uses DEVOLUCION_ESTADO_COLORS from types for consistent styling
 */
export function ReturnStatusBadge({ estado }: ReturnStatusBadgeProps) {
  return (
    <Badge className={cn('font-medium', DEVOLUCION_ESTADO_COLORS[estado])}>
      {DEVOLUCION_ESTADO_LABELS[estado]}
    </Badge>
  )
}

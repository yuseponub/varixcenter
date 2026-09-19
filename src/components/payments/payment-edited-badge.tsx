import { Badge } from '@/components/ui/badge'
import { Pencil } from 'lucide-react'
import { PAYMENT_VALUE_EDIT_MOTIVO } from '@/lib/payments/payment-value-correction'

interface PaymentEditedBadgeProps {
  /** En listados: solo "Editado" para no ensanchar la columna. */
  compact?: boolean
}

/** Aviso de que el valor del pago se corrigio despues de registrarlo. */
export function PaymentEditedBadge({ compact = false }: PaymentEditedBadgeProps) {
  return (
    <Badge variant="warning" title={PAYMENT_VALUE_EDIT_MOTIVO}>
      <Pencil className="h-3 w-3" />
      {compact ? 'Editado' : PAYMENT_VALUE_EDIT_MOTIVO}
    </Badge>
  )
}

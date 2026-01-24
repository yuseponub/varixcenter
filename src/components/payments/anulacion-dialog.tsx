'use client'

import { useActionState, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { anularPayment, type PaymentActionState } from '@/app/(protected)/pagos/actions'

interface AnulacionDialogProps {
  paymentId: string
  numeroFactura: string
  onSuccess?: () => void
}

export function AnulacionDialog({ paymentId, numeroFactura, onSuccess }: AnulacionDialogProps) {
  const [open, setOpen] = useState(false)
  const [justificacion, setJustificacion] = useState('')

  const [state, formAction, isPending] = useActionState<PaymentActionState | null, FormData>(
    anularPayment,
    null
  )

  useEffect(() => {
    if (state?.success) {
      toast.success('Pago anulado correctamente')
      setOpen(false)
      setJustificacion('')
      onSuccess?.()
    } else if (state?.error) {
      toast.error(state.error)
    }
  }, [state, onSuccess])

  const handleSubmit = (formData: FormData) => {
    formData.set('payment_id', paymentId)
    formData.set('justificacion', justificacion)
    formAction(formData)
  }

  const isValid = justificacion.trim().length >= 10

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive">Anular Pago</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Anular Pago {numeroFactura}
          </DialogTitle>
          <DialogDescription>
            Esta accion no se puede deshacer. El pago quedara marcado como anulado
            pero permanecera en el sistema para auditoria.
          </DialogDescription>
        </DialogHeader>

        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="justificacion" className="after:content-['*'] after:ml-0.5 after:text-red-500">
              Justificacion de la anulacion
            </Label>
            <Textarea
              id="justificacion"
              value={justificacion}
              onChange={e => setJustificacion(e.target.value)}
              placeholder="Explique la razon por la cual se anula este pago (minimo 10 caracteres)"
              rows={3}
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              {justificacion.length}/10 caracteres minimos
            </p>
            {state?.errors?.justificacion && (
              <p className="text-sm text-red-500">{state.errors.justificacion[0]}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={isPending || !isValid}
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar Anulacion
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

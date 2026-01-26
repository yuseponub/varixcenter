'use client'

import { useActionState, useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Loader2, LockOpen } from 'lucide-react'
import { toast } from 'sonner'
import {
  reopenMediasCierre,
  type MediasCierreActionState,
} from '@/app/(protected)/medias/cierres/actions'

interface MediasReopenDialogProps {
  cierreId: string
  cierreNumero: string
}

export function MediasReopenDialog({
  cierreId,
  cierreNumero,
}: MediasReopenDialogProps) {
  const [open, setOpen] = useState(false)
  const [justificacion, setJustificacion] = useState('')

  const [state, formAction, isPending] = useActionState<
    MediasCierreActionState | null,
    FormData
  >(reopenMediasCierre, null)

  useEffect(() => {
    if (state?.success) {
      toast.success(`Cierre ${cierreNumero} reabierto exitosamente`)
      setOpen(false)
      setJustificacion('')
    } else if (state?.error) {
      toast.error(state.error)
    }
  }, [state, cierreNumero])

  const handleSubmit = (formData: FormData) => {
    formData.set('cierre_id', cierreId)
    formData.set('justificacion', justificacion)
    formAction(formData)
  }

  const isValid = justificacion.trim().length >= 10

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <LockOpen className="h-4 w-4 mr-2" />
          Reabrir
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reabrir Cierre {cierreNumero}</DialogTitle>
          <DialogDescription>
            Solo un administrador puede reabrir un cierre. Esta accion permitira
            registrar nuevas ventas para la fecha del cierre.
          </DialogDescription>
        </DialogHeader>

        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="justificacion">
              Justificacion (minimo 10 caracteres)
            </Label>
            <Textarea
              id="justificacion"
              value={justificacion}
              onChange={(e) => setJustificacion(e.target.value)}
              placeholder="Explique la razon para reabrir este cierre..."
              rows={3}
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              {justificacion.length}/10 caracteres minimos
            </p>
            {state?.errors?.justificacion && (
              <p className="text-sm text-red-500">
                {state.errors.justificacion[0]}
              </p>
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
            <Button type="submit" disabled={isPending || !isValid}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reabrir Cierre
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

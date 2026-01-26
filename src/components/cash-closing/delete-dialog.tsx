'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
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
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { deleteCashClosing, type CashClosingActionState } from '@/app/(protected)/cierres/actions'

interface DeleteDialogProps {
  cierreId: string
  cierreNumero: string
}

export function DeleteDialog({ cierreId, cierreNumero }: DeleteDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [justificacion, setJustificacion] = useState('')

  const [state, formAction, isPending] = useActionState<CashClosingActionState | null, FormData>(
    deleteCashClosing,
    null
  )

  useEffect(() => {
    if (state?.success) {
      toast.success('Cierre eliminado correctamente')
      setOpen(false)
      setJustificacion('')
      router.push('/cierres')
    } else if (state?.error) {
      toast.error(state.error)
    }
  }, [state, router])

  const handleSubmit = (formData: FormData) => {
    formData.set('cierre_id', cierreId)
    formData.set('justificacion', justificacion)
    formAction(formData)
  }

  const isValid = justificacion.trim().length >= 10

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="text-destructive hover:text-destructive">
          <Trash2 className="mr-2 h-4 w-4" />
          Eliminar Cierre
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Eliminar Cierre {cierreNumero}
          </DialogTitle>
          <DialogDescription>
            Al eliminar este cierre, se habilitara nuevamente la creacion de pagos para esa fecha.
            Esta accion es irreversible y quedara registrada para auditoria.
          </DialogDescription>
        </DialogHeader>

        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="justificacion" className="after:content-['*'] after:ml-0.5 after:text-red-500">
              Justificacion
            </Label>
            <Textarea
              id="justificacion"
              value={justificacion}
              onChange={e => setJustificacion(e.target.value)}
              placeholder="Explique la razon por la cual se elimina este cierre (minimo 10 caracteres)"
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
              Confirmar Eliminacion
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

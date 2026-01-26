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
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { deleteMediasSale, type SaleActionState } from '@/app/(protected)/medias/ventas/actions'

interface DeleteSaleDialogProps {
  saleId: string
  numeroVenta: string
  onSuccess?: () => void
}

export function DeleteSaleDialog({ saleId, numeroVenta, onSuccess }: DeleteSaleDialogProps) {
  const [open, setOpen] = useState(false)
  const [justificacion, setJustificacion] = useState('')

  const [state, formAction, isPending] = useActionState<SaleActionState | null, FormData>(
    deleteMediasSale,
    null
  )

  useEffect(() => {
    if (state?.success) {
      toast.success('Venta eliminada correctamente')
      setOpen(false)
      setJustificacion('')
      onSuccess?.()
    } else if (state?.error) {
      toast.error(state.error)
    }
  }, [state, onSuccess])

  const handleSubmit = (formData: FormData) => {
    formData.set('sale_id', saleId)
    formData.set('justificacion', justificacion)
    formAction(formData)
  }

  const isValid = justificacion.trim().length >= 10

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive">
          <Trash2 className="mr-2 h-4 w-4" />
          Eliminar Venta
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Eliminar Venta {numeroVenta}
          </DialogTitle>
          <DialogDescription>
            Esta accion anulara la venta y revertira el inventario. Los productos
            regresaran al stock. Esta accion no se puede deshacer.
          </DialogDescription>
        </DialogHeader>

        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="justificacion" className="after:content-['*'] after:ml-0.5 after:text-red-500">
              Justificacion de la eliminacion
            </Label>
            <Textarea
              id="justificacion"
              value={justificacion}
              onChange={e => setJustificacion(e.target.value)}
              placeholder="Explique la razon por la cual se elimina esta venta (minimo 10 caracteres)"
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

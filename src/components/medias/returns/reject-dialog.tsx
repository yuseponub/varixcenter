'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { Loader2, X } from 'lucide-react'
import {
  rejectReturn,
  type ReturnActionState,
} from '@/app/(protected)/medias/devoluciones/actions'

interface RejectDialogProps {
  returnId: string
  numeroDevolucion: string
}

/**
 * Dialog for rejecting a return request
 * Only visible to admin/medico users for pendiente returns
 * Does NOT affect stock (estado change only)
 */
export function RejectDialog({ returnId, numeroDevolucion }: RejectDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [notas, setNotas] = useState('')

  const [state, formAction, isPending] = useActionState<
    ReturnActionState | null,
    FormData
  >(rejectReturn, null)

  useEffect(() => {
    if (state?.success) {
      toast.success(`Devolucion ${numeroDevolucion} rechazada`)
      setOpen(false)
      setNotas('')
      router.refresh()
    } else if (state?.error) {
      toast.error(state.error)
    }
  }, [state, numeroDevolucion, router])

  const handleSubmit = (formData: FormData) => {
    formData.set('return_id', returnId)
    if (notas) {
      formData.set('notas', notas)
    }
    formAction(formData)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-red-600 hover:text-red-700 hover:bg-red-50"
          title="Rechazar devolucion"
        >
          <X className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rechazar Devolucion</DialogTitle>
          <DialogDescription>
            Esta accion rechazara la devolucion {numeroDevolucion}.
            Sin efecto en el stock.
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="notas">Notas (opcional)</Label>
              <Textarea
                id="notas"
                name="notas"
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Motivo del rechazo..."
                rows={2}
                disabled={isPending}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="destructive" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Rechazando...
                </>
              ) : (
                'Rechazar Devolucion'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

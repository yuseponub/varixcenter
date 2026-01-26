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
import { Check, Loader2 } from 'lucide-react'
import {
  approveReturn,
  type ReturnActionState,
} from '@/app/(protected)/medias/devoluciones/actions'

interface ApproveDialogProps {
  returnId: string
  numeroDevolucion: string
}

/**
 * Dialog for approving a return request
 * Only visible to admin/medico users for pendiente returns
 * Increments stock_devoluciones on approval
 */
export function ApproveDialog({ returnId, numeroDevolucion }: ApproveDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [notas, setNotas] = useState('')

  const [state, formAction, isPending] = useActionState<
    ReturnActionState | null,
    FormData
  >(approveReturn, null)

  useEffect(() => {
    if (state?.success) {
      toast.success(`Devolucion ${numeroDevolucion} aprobada`)
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
          className="text-green-600 hover:text-green-700 hover:bg-green-50"
          title="Aprobar devolucion"
        >
          <Check className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Aprobar Devolucion</DialogTitle>
          <DialogDescription>
            Esta accion aprobara la devolucion {numeroDevolucion}.
            El stock de devoluciones se incrementara automaticamente.
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
                placeholder="Notas adicionales..."
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
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Aprobando...
                </>
              ) : (
                'Aprobar Devolucion'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

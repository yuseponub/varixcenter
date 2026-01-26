'use client'

import { useState, useTransition } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Alert } from '@/types/alerts'
import { resolveAlertAction } from '@/app/(protected)/reportes/actions'

interface ResolveAlertDialogProps {
  alert: Alert | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onResolved?: () => void
}

/**
 * Resolve Alert Dialog Component
 *
 * Modal dialog for marking an alert as resolved with required notes.
 * Uses server action for resolution.
 */
export function ResolveAlertDialog({
  alert,
  open,
  onOpenChange,
  onResolved,
}: ResolveAlertDialogProps) {
  const [notas, setNotas] = useState('')
  const [isPending, startTransition] = useTransition()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!alert) return
    if (notas.trim().length < 5) {
      toast.error('Las notas deben tener al menos 5 caracteres')
      return
    }

    startTransition(async () => {
      const formData = new FormData()
      formData.set('alertId', alert.id)
      formData.set('notas', notas.trim())

      const result = await resolveAlertAction(formData)

      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success('Alerta resuelta correctamente')
        setNotas('')
        onOpenChange(false)
        onResolved?.()
      }
    })
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setNotas('')
    }
    onOpenChange(newOpen)
  }

  if (!alert) return null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resolver Alerta</DialogTitle>
          <DialogDescription>
            Marcar esta alerta como resuelta. Por favor proporcione notas sobre la resolucion.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">{alert.titulo}</p>
            <p className="text-sm text-muted-foreground">{alert.descripcion}</p>
          </div>

          <form onSubmit={handleSubmit} id="resolve-form" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="notas" className="after:content-['*'] after:ml-0.5 after:text-red-500">
                Notas de Resolucion
              </Label>
              <Textarea
                id="notas"
                value={notas}
                onChange={e => setNotas(e.target.value)}
                placeholder="Describa como se resolvio esta alerta (minimo 5 caracteres)"
                rows={3}
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">
                {notas.length}/5 caracteres minimos
              </p>
            </div>
          </form>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isPending}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            form="resolve-form"
            disabled={isPending || notas.trim().length < 5}
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Resolver Alerta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

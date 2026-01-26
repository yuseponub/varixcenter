'use client'

import { useState } from 'react'
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
import { Loader2, Trash2 } from 'lucide-react'
import { cancelPurchase } from '@/app/(protected)/medias/compras/actions'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { CompraEstado } from '@/types/medias/purchases'

interface CancelPurchaseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  purchaseId: string
  numeroCompra: string
  estado: CompraEstado
}

export function CancelPurchaseDialog({
  open,
  onOpenChange,
  purchaseId,
  numeroCompra,
  estado,
}: CancelPurchaseDialogProps) {
  const [justificacion, setJustificacion] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleCancel = async () => {
    if (justificacion.length < 10) {
      toast.error('La justificacion debe tener al menos 10 caracteres')
      return
    }

    setIsLoading(true)
    try {
      const result = await cancelPurchase(purchaseId, justificacion)

      if (result.success) {
        toast.success('Compra anulada')
        onOpenChange(false)
        router.refresh()
      } else {
        toast.error('Error', {
          description: result.error || 'No se pudo anular la compra',
        })
      }
    } catch (error) {
      toast.error('Error inesperado')
    } finally {
      setIsLoading(false)
    }
  }

  const willReverseStock = estado === 'recibido'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <Trash2 className="h-5 w-5" />
            Anular Compra
          </DialogTitle>
          <DialogDescription>
            Esta accion anulara la compra{' '}
            <span className="font-mono font-medium">{numeroCompra}</span>.
          </DialogDescription>
        </DialogHeader>

        {willReverseStock && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm">
            <p className="font-medium text-red-800 mb-1">Atencion:</p>
            <p className="text-red-700">
              Esta compra ya fue recibida. El stock sera revertido automaticamente.
            </p>
          </div>
        )}

        <div>
          <Label>
            Justificacion <span className="text-red-500">*</span>
          </Label>
          <Textarea
            value={justificacion}
            onChange={(e) => setJustificacion(e.target.value)}
            placeholder="Explique el motivo de la anulacion (minimo 10 caracteres)"
            className="mt-1"
            disabled={isLoading}
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleCancel}
            disabled={isLoading || justificacion.length < 10}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Anulando...
              </>
            ) : (
              <>
                <Trash2 className="mr-2 h-4 w-4" />
                Anular Compra
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

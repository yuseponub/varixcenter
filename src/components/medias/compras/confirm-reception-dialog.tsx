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
import { Loader2, PackageCheck } from 'lucide-react'
import { confirmReception } from '@/app/(protected)/medias/compras/actions'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

interface ConfirmReceptionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  purchaseId: string
  numeroCompra: string
  itemCount: number
}

export function ConfirmReceptionDialog({
  open,
  onOpenChange,
  purchaseId,
  numeroCompra,
  itemCount,
}: ConfirmReceptionDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleConfirm = async () => {
    setIsLoading(true)
    try {
      const result = await confirmReception(purchaseId)

      if (result.success) {
        toast.success('Recepcion confirmada', {
          description: `Stock actualizado para ${itemCount} producto(s)`,
        })
        onOpenChange(false)
        router.refresh()
      } else {
        toast.error('Error', {
          description: result.error || 'No se pudo confirmar la recepcion',
        })
      }
    } catch (error) {
      toast.error('Error', {
        description: 'Error inesperado al confirmar recepcion',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="h-5 w-5 text-green-600" />
            Confirmar Recepcion
          </DialogTitle>
          <DialogDescription>
            Esta accion incrementara el stock para {itemCount} producto(s) de la
            compra <span className="font-mono font-medium">{numeroCompra}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm">
          <p className="font-medium text-yellow-800 mb-1">Importante:</p>
          <ul className="list-disc list-inside text-yellow-700 space-y-1">
            <li>Verifique que la mercancia fisica coincida con la factura</li>
            <li>El stock se actualizara inmediatamente</li>
            <li>Esta accion no se puede deshacer facilmente</li>
          </ul>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Confirmando...
              </>
            ) : (
              <>
                <PackageCheck className="mr-2 h-4 w-4" />
                Confirmar Recepcion
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

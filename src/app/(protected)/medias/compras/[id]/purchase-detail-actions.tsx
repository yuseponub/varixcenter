'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { PackageCheck, Trash2 } from 'lucide-react'
import { ConfirmReceptionDialog } from '@/components/medias/compras/confirm-reception-dialog'
import { CancelPurchaseDialog } from './cancel-purchase-dialog'
import type { CompraEstado } from '@/types/medias/purchases'

interface PurchaseDetailActionsProps {
  purchaseId: string
  numeroCompra: string
  estado: CompraEstado
  itemCount: number
}

export function PurchaseDetailActions({
  purchaseId,
  numeroCompra,
  estado,
  itemCount,
}: PurchaseDetailActionsProps) {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [showCancelDialog, setShowCancelDialog] = useState(false)

  if (estado === 'anulado') {
    return null // No actions for cancelled purchases
  }

  return (
    <div className="flex gap-2">
      {estado === 'pendiente_recepcion' && (
        <Button onClick={() => setShowConfirmDialog(true)}>
          <PackageCheck className="h-4 w-4 mr-2" />
          Confirmar Recepcion
        </Button>
      )}

      <Button
        variant="outline"
        className="text-red-600 hover:text-red-700"
        onClick={() => setShowCancelDialog(true)}
      >
        <Trash2 className="h-4 w-4 mr-2" />
        Anular Compra
      </Button>

      <ConfirmReceptionDialog
        open={showConfirmDialog}
        onOpenChange={setShowConfirmDialog}
        purchaseId={purchaseId}
        numeroCompra={numeroCompra}
        itemCount={itemCount}
      />

      <CancelPurchaseDialog
        open={showCancelDialog}
        onOpenChange={setShowCancelDialog}
        purchaseId={purchaseId}
        numeroCompra={numeroCompra}
        estado={estado}
      />
    </div>
  )
}

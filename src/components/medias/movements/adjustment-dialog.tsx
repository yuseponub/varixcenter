'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { AdjustmentForm } from './adjustment-form'

interface ProductForAdjustment {
  id: string
  codigo: string
  tipo: string
  talla: string
  stock_normal: number
  stock_devoluciones: number
}

interface AdjustmentDialogProps {
  products: ProductForAdjustment[]
  trigger?: React.ReactNode
}

/**
 * Dialog wrapper for the adjustment form
 * Closes automatically on successful submission
 */
export function AdjustmentDialog({ products, trigger }: AdjustmentDialogProps) {
  const [open, setOpen] = useState(false)

  const handleSuccess = () => {
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo Ajuste
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ajuste de Inventario</DialogTitle>
        </DialogHeader>
        <AdjustmentForm products={products} onSuccess={handleSuccess} />
      </DialogContent>
    </Dialog>
  )
}

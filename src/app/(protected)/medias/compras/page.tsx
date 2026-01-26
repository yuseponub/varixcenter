import { Metadata } from 'next'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { getPurchases, countPurchasesByEstado } from '@/lib/queries/medias-purchases'
import { PurchasesTable } from '@/components/medias/compras/purchases-table'
import { Badge } from '@/components/ui/badge'

export const metadata: Metadata = {
  title: 'Compras de Medias | VarixClinic',
  description: 'Gestion de compras de medias de compresion',
}

export default async function ComprasPage() {
  const [purchases, counts] = await Promise.all([
    getPurchases(),
    countPurchasesByEstado(),
  ])

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Compras de Medias</h1>
          <p className="text-gray-500">
            Registro de compras de mercancia
          </p>
        </div>
        <Link href="/medias/compras/nueva">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Nueva Compra
          </Button>
        </Link>
      </div>

      {/* Stats badges */}
      <div className="flex gap-4">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-sm">
            {counts.pendiente_recepcion}
          </Badge>
          <span className="text-sm text-gray-600">Pendientes de recepcion</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="default" className="text-sm">
            {counts.recibido}
          </Badge>
          <span className="text-sm text-gray-600">Recibidos</span>
        </div>
      </div>

      {/* Purchases table */}
      <PurchasesTable purchases={purchases} />
    </div>
  )
}

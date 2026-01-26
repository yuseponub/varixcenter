import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { SalesTable } from '@/components/medias/sales/sales-table'
import { getSales } from '@/lib/queries/medias/sales'

export const metadata = {
  title: 'Ventas | Varix Medias',
}

export default async function SalesPage() {
  const sales = await getSales({ limit: 100 })

  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Ventas de Medias</h1>
        <Button asChild>
          <Link href="/medias/ventas/nueva">
            <Plus className="mr-2 h-4 w-4" />
            Nueva Venta
          </Link>
        </Button>
      </div>

      <SalesTable sales={sales} />
    </div>
  )
}

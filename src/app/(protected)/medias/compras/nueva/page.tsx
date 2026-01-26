import { Metadata } from 'next'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { getProductsForMatching } from '@/lib/queries/medias-purchases'
import { NewPurchaseFlow } from './new-purchase-flow'

export const metadata: Metadata = {
  title: 'Nueva Compra | VarixClinic',
  description: 'Registrar nueva compra de medias',
}

export default async function NuevaCompraPage() {
  const products = await getProductsForMatching()

  return (
    <div className="container mx-auto py-6 max-w-4xl">
      {/* Header with back button */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/medias/compras">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">Nueva Compra</h1>
      </div>

      <NewPurchaseFlow products={products} />
    </div>
  )
}

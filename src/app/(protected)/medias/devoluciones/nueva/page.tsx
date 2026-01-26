import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft } from 'lucide-react'
import { getSaleById, getSales } from '@/lib/queries/medias/sales'
import { getReturnableQuantity } from '@/lib/queries/medias/returns'
import { ReturnForm } from '@/components/medias/returns/return-form'
import { SaleSearchSelect } from '@/components/medias/returns/sale-search-select'

export const metadata = {
  title: 'Nueva Devolucion | Varix Medias',
}

interface Props {
  searchParams: Promise<{ sale_id?: string }>
}

export default async function NuevaDevolucionPage({ searchParams }: Props) {
  const params = await searchParams
  const saleId = params.sale_id

  // Step 1: No sale selected - show sale search
  if (!saleId) {
    // Get recent active sales for selection
    const activeSales = await getSales({ status: 'activo', limit: 50 })

    return (
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/medias/devoluciones">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Nueva Devolucion</h1>
            <p className="text-muted-foreground">Paso 1: Seleccione la venta original</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Buscar Venta</CardTitle>
            <CardDescription>
              Busque por numero de venta (VTA-XXXXXX) o nombre del paciente
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SaleSearchSelect activeSales={activeSales} />
          </CardContent>
        </Card>
      </div>
    )
  }

  // Step 2: Sale selected - fetch sale and show return form
  const sale = await getSaleById(saleId)

  if (!sale) {
    redirect('/medias/devoluciones/nueva')
  }

  if (sale.estado !== 'activo') {
    return (
      <div className="container mx-auto py-6">
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">
              No se pueden crear devoluciones para ventas anuladas.
            </p>
            <Button asChild className="mt-4">
              <Link href="/medias/devoluciones/nueva">
                Seleccionar otra venta
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Calculate returnable quantities for each item
  const returnableQuantities: Record<string, number> = {}
  for (const item of sale.items) {
    returnableQuantities[item.id] = await getReturnableQuantity(item.id)
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/medias/devoluciones/nueva">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Nueva Devolucion</h1>
          <p className="text-muted-foreground">
            Venta: {sale.numero_venta}
            {sale.patient && ` - ${sale.patient.nombre} ${sale.patient.apellido}`}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Solicitud de Devolucion</CardTitle>
          <CardDescription>
            Seleccione el producto, cantidad y motivo de la devolucion
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ReturnForm sale={sale} returnableQuantities={returnableQuantities} />
        </CardContent>
      </Card>
    </div>
  )
}

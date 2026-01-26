import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { getCashClosings } from '@/lib/queries/cash-closings'
import { ClosingsTable } from '@/components/cash-closing/closings-table'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

export default async function CierresPage() {
  const { closings } = await getCashClosings({ limit: 50 })

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/dashboard">Inicio</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Cierres de Caja</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cierres de Caja</h1>
          <p className="text-muted-foreground">
            Registro de cierres de caja diarios
          </p>
        </div>
        <Button asChild>
          <Link href="/cierres/nuevo">
            <Plus className="mr-2 h-4 w-4" />
            Nuevo Cierre
          </Link>
        </Button>
      </div>

      {/* Table */}
      <ClosingsTable closings={closings} />
    </div>
  )
}

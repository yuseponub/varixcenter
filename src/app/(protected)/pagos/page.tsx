import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { getPayments } from '@/lib/queries/payments'
import { PaymentsTable } from '@/components/payments/payments-table'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

export default async function PaymentsPage() {
  const { payments } = await getPayments({ limit: 50 })

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
            <BreadcrumbPage>Pagos</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pagos</h1>
          <p className="text-muted-foreground">
            Registro de pagos de la clinica
          </p>
        </div>
        <Button asChild>
          <Link href="/pagos/nuevo">
            <Plus className="mr-2 h-4 w-4" />
            Nuevo Pago
          </Link>
        </Button>
      </div>

      {/* Table */}
      <PaymentsTable payments={payments} />
    </div>
  )
}

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getInvoicingQueue } from '@/lib/queries/invoicing'
import { FacturacionQueue } from '@/components/invoicing/facturacion-queue'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

export default async function FacturacionPage() {
  const supabase = await createClient()
  const { data: role } = await supabase.rpc('get_user_role')

  if (role !== 'admin' && role !== 'secretaria') {
    redirect('/dashboard')
  }

  const queue = await getInvoicingQueue()

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/dashboard">Inicio</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Facturacion WiMAX</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <FacturacionQueue pending={queue.pending} recent={queue.recent} />
    </div>
  )
}

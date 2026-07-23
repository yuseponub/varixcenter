import { getPayments } from '@/lib/queries/payments'
import { PaymentsView } from '@/components/payments/payments-view'
import { createClient } from '@/lib/supabase/server'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

export default async function PaymentsPage() {
  const supabase = await createClient()
  const [{ payments }, { data: role }] = await Promise.all([
    getPayments({ limit: 100 }),
    supabase.rpc('get_user_role'),
  ])
  const canManageWimax = role === 'admin' || role === 'secretaria'

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

      {/* Payments View with filter */}
      <PaymentsView payments={payments} canManageWimax={canManageWimax} />
    </div>
  )
}

import { createClient } from '@/lib/supabase/server'
import { getActiveServices } from '@/lib/queries/services'
import { PaymentForm } from '@/components/payments/payment-form'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

interface NewPaymentPageProps {
  searchParams: Promise<{ patient?: string }>
}

/**
 * Fetch all patients for the payment form dropdown
 * Sorted by name for easy selection
 */
async function getPatients() {
  const supabase = await createClient()

  // Fetch all patients (Supabase default limit is 1000)
  // Use pagination to get all
  const allPatients: Array<{ id: string; cedula: string | null; nombre: string; apellido: string }> = []
  let page = 0
  const pageSize = 1000

  while (true) {
    const { data, error } = await supabase
      .from('patients')
      .select('id, cedula, nombre, apellido')
      .order('nombre')
      .range(page * pageSize, (page + 1) * pageSize - 1)

    if (error || !data || data.length === 0) break

    allPatients.push(...data)

    if (data.length < pageSize) break // Last page
    page++
  }

  return allPatients
}

/**
 * New Payment Page
 *
 * Fetches services and patients in parallel for performance.
 * Accepts ?patient=uuid query param for pre-selection from patient detail page.
 * Renders PaymentForm with all required data.
 */
export default async function NewPaymentPage({ searchParams }: NewPaymentPageProps) {
  const params = await searchParams

  // Fetch services and patients in parallel
  const [services, patients] = await Promise.all([
    getActiveServices(),
    getPatients()
  ])

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
            <BreadcrumbLink href="/pagos">Pagos</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Nuevo Pago</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Nuevo Pago</h1>
        <p className="text-muted-foreground">
          Registre un nuevo pago seleccionando paciente, servicios y metodo de pago.
        </p>
      </div>

      {/* Form */}
      <div className="max-w-3xl">
        <PaymentForm
          services={services}
          patients={patients}
          defaultPatientId={params.patient}
        />
      </div>
    </div>
  )
}

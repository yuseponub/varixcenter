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
 * Fetch a single patient by ID (for pre-selection)
 */
async function getPatientById(id: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('patients')
    .select('id, cedula, nombre, apellido')
    .eq('id', id)
    .single()

  if (error) return null
  return data
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

  // Fetch services (patients are loaded via API search)
  const [services, defaultPatient] = await Promise.all([
    getActiveServices(),
    params.patient ? getPatientById(params.patient) : Promise.resolve(null)
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
          defaultPatient={defaultPatient}
        />
      </div>
    </div>
  )
}

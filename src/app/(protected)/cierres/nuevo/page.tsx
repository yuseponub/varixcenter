import { getClosingSummaryForDate } from '@/lib/queries/cash-closings'
import { ClosingForm } from '@/components/cash-closing/closing-form'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertTriangle } from 'lucide-react'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

interface NuevoCierrePageProps {
  searchParams: Promise<{ fecha?: string }>
}

/**
 * Get today's date in YYYY-MM-DD format (Colombia timezone)
 */
function getTodayDate(): string {
  const now = new Date()
  // Adjust for Colombia timezone (UTC-5)
  const colombiaOffset = -5 * 60
  const localOffset = now.getTimezoneOffset()
  const colombiaTime = new Date(now.getTime() + (localOffset + colombiaOffset) * 60000)
  return colombiaTime.toISOString().split('T')[0]
}

export default async function NuevoCierrePage({ searchParams }: NuevoCierrePageProps) {
  const params = await searchParams
  const fecha = params.fecha || getTodayDate()

  // Get summary for the selected date
  const summary = await getClosingSummaryForDate(fecha)

  if (!summary) {
    return (
      <div className="space-y-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/dashboard">Inicio</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/cierres">Cierres</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Nuevo Cierre</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            No se pudo obtener el resumen del dia. Por favor intente de nuevo.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  const formatDate = (dateStr: string) =>
    new Intl.DateTimeFormat('es-CO', {
      dateStyle: 'full'
    }).format(new Date(dateStr + 'T12:00:00'))

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
            <BreadcrumbLink href="/cierres">Cierres</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Nuevo Cierre</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Nuevo Cierre de Caja</h1>
        <p className="text-muted-foreground">
          {formatDate(fecha)}
        </p>
      </div>

      {/* Form */}
      <div className="max-w-2xl">
        <ClosingForm fecha={fecha} summary={summary} />
      </div>
    </div>
  )
}

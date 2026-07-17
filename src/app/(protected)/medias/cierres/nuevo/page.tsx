import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ArrowLeft } from 'lucide-react'
import { getMediasCierreSummaryForDate } from '@/lib/queries/medias/cierres'
import { MediasCierreForm } from '@/components/medias/cierres/cierre-form'

export const metadata = {
  title: 'Nuevo Cierre - Medias | VarixClinic',
  description: 'Crear cierre de caja de medias',
}

interface Props {
  searchParams: Promise<{ fecha?: string }>
}

/**
 * Get today's date in YYYY-MM-DD format (Colombia timezone)
 */
function getTodayDate(): string {
  const now = new Date()
  const col = new Date(now.toLocaleString('en-US', { timeZone: 'America/Bogota' }))
  return `${col.getFullYear()}-${String(col.getMonth() + 1).padStart(2, '0')}-${String(col.getDate()).padStart(2, '0')}`
}

export default async function NuevoMediasCierrePage({ searchParams }: Props) {
  const params = await searchParams
  // Default to today (Colombia timezone); ?fecha= allows closing another date
  const fecha = params.fecha || getTodayDate()

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    redirect('/medias/cierres/nuevo')
  }

  // Fetch summary for selected date
  const summary = await getMediasCierreSummaryForDate(fecha)

  if (!summary) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/medias/cierres/nuevo">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Cambiar fecha
            </Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Error</h1>
        </div>
        <Alert variant="destructive">
          <AlertDescription>
            No se pudo cargar el resumen para la fecha seleccionada.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/medias/cierres/nuevo">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Cambiar fecha
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Cierre de Medias - {fecha}
          </h1>
          <p className="text-muted-foreground">
            Complete el cierre de caja para esta fecha
          </p>
        </div>
      </div>

      <MediasCierreForm fecha={fecha} summary={summary} />
    </div>
  )
}

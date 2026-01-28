import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ArrowLeft, AlertTriangle } from 'lucide-react'
import { getMediasCierreSummaryForDate } from '@/lib/queries/medias/cierres'
import { MediasCierreForm } from '@/components/medias/cierres/cierre-form'
import { DatePickerForm } from '@/components/medias/cierres/date-picker-form'

export const metadata = {
  title: 'Nuevo Cierre - Medias | VarixClinic',
  description: 'Crear cierre de caja de medias',
}

interface Props {
  searchParams: Promise<{ fecha?: string }>
}

export default async function NuevoMediasCierrePage({ searchParams }: Props) {
  const params = await searchParams
  const fecha = params.fecha

  // If no date selected, show date picker
  if (!fecha) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/medias/cierres">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Volver
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Nuevo Cierre de Medias
            </h1>
            <p className="text-muted-foreground">
              Seleccione la fecha para cerrar
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Seleccionar Fecha</CardTitle>
          </CardHeader>
          <CardContent>
            <DatePickerForm basePath="/medias/cierres/nuevo" />
          </CardContent>
        </Card>

        {/* Zero tolerance reminder */}
        <Alert className="border-amber-200 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800">
            <strong>Recuerde:</strong> Cualquier diferencia entre el conteo
            fisico y el total calculado requerira justificacion escrita (minimo
            10 caracteres).
          </AlertDescription>
        </Alert>
      </div>
    )
  }

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

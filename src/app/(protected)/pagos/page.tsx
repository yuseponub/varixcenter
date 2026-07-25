import { getPayments } from '@/lib/queries/payments'
import { PaymentsView, type PaymentsFilterMode } from '@/components/payments/payments-view'
import { createClient } from '@/lib/supabase/server'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

interface PaymentsPageProps {
  searchParams: Promise<{ modo?: string; fecha?: string }>
}

/** Fecha civil de hoy en Bogota (UTC-5 fijo, sin horario de verano). */
function todayBogota(): string {
  return new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10)
}

/** 00:00 Bogota de una fecha civil, como Date UTC. */
function bogotaMidnight(fecha: string): Date {
  return new Date(`${fecha}T00:00:00-05:00`)
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000)
}

/** Lunes de la semana que contiene la fecha civil dada (en Bogota). */
function mondayOf(fecha: string): Date {
  const midnight = bogotaMidnight(fecha)
  // Dia de la semana civil: usamos mediodia Bogota para evitar bordes.
  const noon = new Date(midnight.getTime() + 12 * 3600_000)
  const dow = new Date(noon.getTime() - 5 * 3600_000).getUTCDay() // 0 dom..6 sab
  const offset = dow === 0 ? 6 : dow - 1
  return addDays(midnight, -offset)
}

export default async function PaymentsPage({ searchParams }: PaymentsPageProps) {
  const params = await searchParams

  const modo: PaymentsFilterMode =
    params.modo === 'todos' || params.modo === 'semana' ? params.modo : 'dia'
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(params.fecha ?? '')
    ? (params.fecha as string)
    : todayBogota()

  // Rango de consulta segun el modo (server-side: navega cualquier fecha,
  // sin el tope de "ultimos 100" que tenia el filtro en cliente).
  let startDate: string | undefined
  let endDate: string | undefined
  if (modo === 'dia') {
    const start = bogotaMidnight(fecha)
    startDate = start.toISOString()
    endDate = addDays(start, 1).toISOString()
  } else if (modo === 'semana') {
    const monday = mondayOf(fecha)
    startDate = monday.toISOString()
    endDate = addDays(monday, 7).toISOString()
  }

  const supabase = await createClient()
  const [{ payments }, { data: role }] = await Promise.all([
    getPayments({ limit: modo === 'todos' ? 100 : 500, startDate, endDate }),
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
      <PaymentsView
        payments={payments}
        canManageWimax={canManageWimax}
        modo={modo}
        fecha={fecha}
        hoy={todayBogota()}
      />
    </div>
  )
}

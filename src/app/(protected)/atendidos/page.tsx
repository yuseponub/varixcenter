import { getAttendanceComparison, getAttendanceTotals } from '@/lib/queries/attendances'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { UserCheck, CreditCard, AlertCircle, DollarSign } from 'lucide-react'
import { AtendidosTable } from './atendidos-table'

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(amount)

const formatDate = (dateStr: string) =>
  new Intl.DateTimeFormat('es-CO', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(dateStr + 'T12:00:00'))

export default async function AtendidosPage() {
  const today = new Date().toISOString().split('T')[0]

  const [comparison, totals] = await Promise.all([
    getAttendanceComparison(today),
    getAttendanceTotals(today),
  ])

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <UserCheck className="h-6 w-6" />
          Pacientes Atendidos
        </h1>
        <p className="text-muted-foreground capitalize">{formatDate(today)}</p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Atendidos</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.total_atendidos}</div>
            <p className="text-xs text-muted-foreground">pacientes hoy</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Con Pago</CardTitle>
            <CreditCard className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{totals.con_pago}</div>
            <p className="text-xs text-muted-foreground">pacientes pagaron</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sin Pago</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{totals.sin_pago}</div>
            <p className="text-xs text-muted-foreground">pendientes de pago</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monto Total</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totals.monto_total)}</div>
            <p className="text-xs text-muted-foreground">recaudado hoy</p>
          </CardContent>
        </Card>
      </div>

      {/* Comparison Table */}
      <Card>
        <CardHeader>
          <CardTitle>Detalle de Atendidos</CardTitle>
        </CardHeader>
        <CardContent>
          <AtendidosTable items={comparison} />
        </CardContent>
      </Card>
    </div>
  )
}

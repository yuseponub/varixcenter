/**
 * Notifications Page
 *
 * Shows history of SMS reminders sent to patients.
 * Accessible to all staff roles.
 */
import { getNotifications } from '@/lib/queries/notifications'
import { NotificationsTable } from '@/components/notifications/notifications-table'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { MessageSquare } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function NotificacionesPage() {
  const notifications = await getNotifications({ limit: 100 })

  // Count by status
  const statusCounts = notifications.reduce(
    (acc, n) => {
      acc[n.estado] = (acc[n.estado] || 0) + 1
      return acc
    },
    {} as Record<string, number>
  )

  return (
    <div className="container mx-auto py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Notificaciones SMS</h1>
        <p className="text-muted-foreground">
          Historial de recordatorios de citas enviados a pacientes
        </p>
      </div>

      {/* Stats Cards */}
      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{notifications.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Enviados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {statusCounts['enviado'] || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fallidos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {statusCounts['fallido'] || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pendientes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {(statusCounts['pendiente'] || 0) + (statusCounts['reintentando'] || 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Notifications Table */}
      <Card>
        <CardHeader>
          <CardTitle>Historial de Notificaciones</CardTitle>
          <CardDescription>
            Ultimas {notifications.length} notificaciones enviadas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NotificationsTable notifications={notifications} />
        </CardContent>
      </Card>
    </div>
  )
}

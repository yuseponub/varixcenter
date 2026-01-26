import { createClient } from '@/lib/supabase/server'
import { getAlerts } from '@/lib/queries/alerts'
import { AlertsWidget } from '@/components/alerts/alerts-widget'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { ShieldAlert } from 'lucide-react'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: { session } } = await supabase.auth.getSession()

  // El rol viene del JWT (Custom Access Token Hook lo inyecta)
  let role = 'none'
  if (session?.access_token) {
    try {
      const payload = JSON.parse(Buffer.from(session.access_token.split('.')[1], 'base64').toString())
      role = payload.app_metadata?.role ?? 'none'
    } catch {
      role = 'none'
    }
  }

  // Fetch unresolved alerts for admin/medico
  const showAlerts = role === 'admin' || role === 'medico'
  const alerts = showAlerts
    ? await getAlerts({ resuelta: false, limit: 10 })
    : []

  return (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Dashboard</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-blue-50 rounded-lg p-4">
            <h2 className="text-lg font-semibold text-blue-900">Bienvenido</h2>
            <p className="text-blue-700 mt-1">{user?.email}</p>
          </div>

          <div className="bg-green-50 rounded-lg p-4">
            <h2 className="text-lg font-semibold text-green-900">Tu rol</h2>
            <p className="text-green-700 mt-1 capitalize">{role}</p>
          </div>

          <div className="bg-purple-50 rounded-lg p-4">
            <h2 className="text-lg font-semibold text-purple-900">Estado</h2>
            <p className="text-purple-700 mt-1">Sesion activa</p>
          </div>
        </div>

        {role === 'none' && (
          <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-yellow-800">
              <strong>Nota:</strong> Tu cuenta no tiene un rol asignado.
              Contacta al administrador para obtener permisos.
            </p>
          </div>
        )}

        <div className="mt-6 text-sm text-gray-500">
          <p>Fase 1: Security Foundation - Autenticacion completa</p>
          <p className="mt-1">Proximas fases agregaran pacientes, citas, y pagos.</p>
        </div>
      </div>

      {/* Alerts Section - Only for Admin/Medico */}
      {showAlerts && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5" />
              Panel de Seguridad
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AlertsWidget alerts={alerts} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

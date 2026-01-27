import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { signOut } from '@/app/(auth)/login/actions'
import { AlertBadge } from '@/components/alerts/alert-badge'
import { AppSidebar } from '@/components/layout/app-sidebar'

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // El rol viene del JWT (Custom Access Token Hook lo inyecta)
  const { data: { session } } = await supabase.auth.getSession()
  let role = 'none'
  if (session?.access_token) {
    try {
      const payload = JSON.parse(Buffer.from(session.access_token.split('.')[1], 'base64').toString())
      role = payload.app_metadata?.role ?? 'none'
    } catch {
      role = 'none'
    }
  }

  const roleLabels: Record<string, string> = {
    admin: 'Administrador',
    medico: 'Medico',
    enfermera: 'Enfermera',
    secretaria: 'Secretaria',
    none: 'Sin rol asignado',
  }

  const showAlertBadge = role === 'admin' || role === 'medico'

  return (
    <AppSidebar
      role={role}
      userEmail={user.email ?? ''}
      roleLabel={roleLabels[role] || role}
      showAlertBadge={showAlertBadge}
      alertBadge={<AlertBadge />}
      signOutAction={signOut}
    >
      {children}
    </AppSidebar>
  )
}

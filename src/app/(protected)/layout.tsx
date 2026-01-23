import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { signOut } from '@/app/(auth)/login/actions'

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

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center">
              <span className="text-xl font-bold text-blue-600">VarixClinic</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">
                {user.email} ({roleLabels[role] || role})
              </span>
              <form action={signOut}>
                <button
                  type="submit"
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  Cerrar sesion
                </button>
              </form>
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  )
}

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { signOut } from '@/app/(auth)/login/actions'
import Link from 'next/link'
import { AlertBadge } from '@/components/alerts/alert-badge'

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

  // Define navigation links based on role
  const navLinks = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/pacientes', label: 'Pacientes' },
    { href: '/citas', label: 'Citas' },
    { href: '/pagos', label: 'Pagos' },
  ]

  // Add admin/medico-only links
  if (role === 'admin' || role === 'medico') {
    navLinks.push({ href: '/servicios', label: 'Servicios' })
    navLinks.push({ href: '/reportes', label: 'Reportes' })
  }

  // Add Medias link for all roles
  navLinks.push({ href: '/medias/productos', label: 'Medias' })

  // Show alert badge for admin/medico
  const showAlertBadge = role === 'admin' || role === 'medico'

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            {/* Logo and Navigation */}
            <div className="flex items-center gap-8">
              <Link href="/dashboard" className="text-xl font-bold text-blue-600">
                VarixClinic
              </Link>
              <div className="hidden md:flex items-center space-x-4">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="text-sm text-gray-600 hover:text-gray-900"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>

            {/* User Info and Actions */}
            <div className="flex items-center gap-4">
              {/* Alert Badge (admin/medico only) */}
              {showAlertBadge && (
                <Link href="/dashboard" className="hover:opacity-80">
                  <AlertBadge />
                </Link>
              )}

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

          {/* Mobile Navigation */}
          <div className="md:hidden pb-4">
            <div className="flex flex-wrap gap-2">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm text-gray-600 hover:text-gray-900 px-2 py-1"
                >
                  {link.label}
                </Link>
              ))}
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

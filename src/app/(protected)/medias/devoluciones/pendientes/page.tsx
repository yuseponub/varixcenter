import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft } from 'lucide-react'
import { ReturnsTable } from '@/components/medias/returns/returns-table'
import { getReturns } from '@/lib/queries/medias/returns'
import { createClient } from '@/lib/supabase/server'

export const metadata = {
  title: 'Devoluciones Pendientes | Varix Medias',
}

async function getUserRole(): Promise<string> {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) return 'none'

  try {
    const payload = JSON.parse(
      Buffer.from(session.access_token.split('.')[1], 'base64').toString()
    )
    return payload.app_metadata?.role ?? 'none'
  } catch {
    return 'none'
  }
}

export default async function PendientesPage() {
  const [returns, userRole] = await Promise.all([
    getReturns({ estado: 'pendiente' }),
    getUserRole(),
  ])

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/medias/devoluciones">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Devoluciones Pendientes</h1>
          <p className="text-muted-foreground">
            {returns.length} solicitud{returns.length !== 1 ? 'es' : ''} pendiente{returns.length !== 1 ? 's' : ''} de aprobacion
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Solicitudes Pendientes</CardTitle>
          <CardDescription>
            Revise y apruebe o rechace las solicitudes de devolucion
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ReturnsTable returns={returns} userRole={userRole} />
        </CardContent>
      </Card>
    </div>
  )
}

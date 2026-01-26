import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, Clock } from 'lucide-react'
import { ReturnsTable } from '@/components/medias/returns/returns-table'
import { getReturns, getPendingReturnsCount } from '@/lib/queries/medias/returns'
import { createClient } from '@/lib/supabase/server'

export const metadata = {
  title: 'Devoluciones | Varix Medias',
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

export default async function DevolucionesPage() {
  const [returns, pendingCount, userRole] = await Promise.all([
    getReturns(),
    getPendingReturnsCount(),
    getUserRole(),
  ])

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Devoluciones</h1>
          <p className="text-muted-foreground">
            Gestiona las devoluciones de medias de compresion
          </p>
        </div>
        <div className="flex gap-2">
          {pendingCount > 0 && (
            <Button variant="outline" asChild>
              <Link href="/medias/devoluciones/pendientes">
                <Clock className="mr-2 h-4 w-4" />
                Pendientes
                <Badge variant="secondary" className="ml-2">
                  {pendingCount}
                </Badge>
              </Link>
            </Button>
          )}
          <Button asChild>
            <Link href="/medias/devoluciones/nueva">
              <Plus className="mr-2 h-4 w-4" />
              Nueva Devolucion
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Historial de Devoluciones</CardTitle>
          <CardDescription>
            Todas las solicitudes de devolucion
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ReturnsTable returns={returns} userRole={userRole} />
        </CardContent>
      </Card>
    </div>
  )
}

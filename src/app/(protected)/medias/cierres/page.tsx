import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus } from 'lucide-react'
import { getMediasCierres } from '@/lib/queries/medias/cierres'
import { MediasCierresTable } from '@/components/medias/cierres/cierres-table'
import { createClient } from '@/lib/supabase/server'

export const metadata = {
  title: 'Cierres de Caja - Medias | VarixClinic',
  description: 'Listado de cierres de caja de medias',
}

export default async function MediasCierresPage() {
  // Fetch closings
  const { closings, total } = await getMediasCierres({ limit: 50 })

  // Check if user is admin (for reopen button)
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let isAdmin = false
  if (user) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: roleData } = await (supabase as any)
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single()
    isAdmin = roleData?.role === 'admin'
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Cierres de Caja - Medias
          </h1>
          <p className="text-muted-foreground">
            Gestion de cierres de caja diarios para ventas de medias
          </p>
        </div>
        <Button asChild>
          <Link href="/medias/cierres/nuevo">
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Cierre
          </Link>
        </Button>
      </div>

      {/* Info card about zero tolerance */}
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="pt-4">
          <p className="text-sm text-amber-800">
            <strong>Tolerancia Cero:</strong> Cualquier diferencia entre el
            conteo fisico y el total calculado requiere justificacion detallada.
            Esta politica es mas estricta que la clinica.
          </p>
        </CardContent>
      </Card>

      {/* Closings table */}
      <Card>
        <CardHeader>
          <CardTitle>
            Cierres Registrados{' '}
            <span className="text-muted-foreground font-normal">({total})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <MediasCierresTable closings={closings} isAdmin={isAdmin} />
        </CardContent>
      </Card>
    </div>
  )
}

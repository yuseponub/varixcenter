import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getStockMovements, type MovementFilters } from '@/lib/queries/medias/movements'
import { getProducts } from '@/lib/queries/medias/dashboard'
import { MovementsTable } from '@/components/medias/movements/movements-table'
import { MovementFilters as MovementFiltersComponent } from '@/components/medias/movements/movement-filters'
import { AdjustmentDialog } from '@/components/medias/movements/adjustment-dialog'
import type { MediasMovementType } from '@/types/medias/products'

export const metadata = {
  title: 'Medias | Movimientos',
}

interface MovimientosPageProps {
  searchParams: Promise<{
    product_id?: string
    tipo?: string
    from_date?: string
    to_date?: string
  }>
}

/**
 * Get user role from JWT app_metadata
 */
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

/**
 * Check if user can create adjustments (admin or medico)
 */
async function canCreateAdjustment(): Promise<boolean> {
  const role = await getUserRole()
  return role === 'admin' || role === 'medico'
}

/**
 * Movements history page with filterable table and adjustment capability
 * Shows all stock movements with filters for product, date range, and type
 */
export default async function MovimientosPage({ searchParams }: MovimientosPageProps) {
  const params = await searchParams

  // Build filters from searchParams
  const filters: MovementFilters = {}
  if (params.product_id) filters.product_id = params.product_id
  if (params.tipo) filters.tipo = params.tipo as MediasMovementType
  if (params.from_date) filters.from_date = params.from_date
  if (params.to_date) filters.to_date = params.to_date

  // Fetch data in parallel
  const [movements, products, userCanAdjust] = await Promise.all([
    getStockMovements(filters),
    getProducts(),
    canCreateAdjustment(),
  ])

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Historial de Movimientos</h1>
        <p className="text-muted-foreground">
          Registro de todos los movimientos de stock de medias
        </p>
      </div>

      {/* Filters and Action row */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Suspense fallback={<div className="h-10" />}>
          <MovementFiltersComponent products={products} />
        </Suspense>

        {/* Adjustment dialog - only for admin/medico */}
        {userCanAdjust && <AdjustmentDialog products={products} />}
      </div>

      {/* Movements table */}
      <MovementsTable data={movements} />

      {/* Summary */}
      <p className="text-sm text-muted-foreground">
        Mostrando {movements.length} movimiento{movements.length !== 1 ? 's' : ''}
      </p>
    </div>
  )
}

import { createClient } from '@/lib/supabase/server'
import { SaleForm } from '@/components/medias/sales/sale-form'
import { getActiveSaleProducts } from '@/lib/queries/medias/sales'
import { searchPatients } from '@/lib/queries/patients'

export const metadata = {
  title: 'Nueva Venta | Varix Medias',
}

export default async function NewSalePage() {
  const supabase = await createClient()

  // Get products with stock
  const products = await getActiveSaleProducts()

  // Get staff users for receptor selection
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: staffUsers } = await supabase
    .from('user_roles')
    .select('user_id, users:user_id(id, email)')
    .in('role', ['admin', 'medico', 'enfermera', 'secretaria']) as { data: { user_id: string; users: { id: string; email: string } | null }[] | null }

  const users = (staffUsers || [])
    .filter((u) => u.users !== null)
    .map((u) => ({ id: u.users!.id, email: u.users!.email }))

  // Get recent patients for optional linking (VTA-06)
  const recentPatients = await searchPatients('', 100)
  const patients = recentPatients.map((p) => ({
    id: p.id,
    cedula: p.cedula,
    nombre: p.nombre,
    apellido: p.apellido,
  }))

  return (
    <div className="container mx-auto py-6">
      <h1 className="text-2xl font-bold mb-6">Nueva Venta</h1>
      <SaleForm products={products} staffUsers={users} patients={patients} />
    </div>
  )
}

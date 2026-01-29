import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * GET /api/patients
 * Returns list of active patients for dropdowns
 */
export async function GET() {
  const supabase = await createClient()

  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // Fetch all patients (Supabase default limit is 1000)
  // Use pagination to get all
  const allPatients: Array<{ id: string; cedula: string | null; nombre: string; apellido: string; celular: string | null }> = []
  let page = 0
  const pageSize = 1000

  while (true) {
    const { data, error } = await supabase
      .from('patients')
      .select('id, cedula, nombre, apellido, celular')
      .order('nombre')
      .range(page * pageSize, (page + 1) * pageSize - 1)

    if (error) {
      console.error('Error fetching patients:', error)
      return NextResponse.json({ error: 'Error al cargar pacientes' }, { status: 500 })
    }

    if (!data || data.length === 0) break

    allPatients.push(...data)

    if (data.length < pageSize) break // Last page
    page++
  }

  return NextResponse.json({ patients: allPatients })
}

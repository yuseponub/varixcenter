import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * GET /api/doctors
 * Returns list of doctors for dropdowns
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

  // Fetch doctors from view
  const { data: doctors, error } = await supabase
    .from('doctors_view')
    .select('id, email, nombre, apellido')
    .order('nombre')

  if (error) {
    console.error('Error fetching doctors:', error)
    return NextResponse.json({ error: 'Error al cargar doctores' }, { status: 500 })
  }

  return NextResponse.json({ doctors: doctors || [] })
}

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

  // Fetch patients
  const { data: patients, error } = await supabase
    .from('patients')
    .select('id, cedula, nombre, apellido, celular')
    .order('nombre')

  if (error) {
    console.error('Error fetching patients:', error)
    return NextResponse.json({ error: 'Error al cargar pacientes' }, { status: 500 })
  }

  return NextResponse.json({ patients: patients || [] })
}

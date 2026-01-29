import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * GET /api/patients/[id]
 * Get a single patient by ID
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()

  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { id } = await params

  const { data: patient, error } = await supabase
    .from('patients')
    .select('id, cedula, nombre, apellido, celular')
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Paciente no encontrado' }, { status: 404 })
    }
    console.error('Error fetching patient:', error)
    return NextResponse.json({ error: 'Error al cargar paciente' }, { status: 500 })
  }

  return NextResponse.json({ patient })
}

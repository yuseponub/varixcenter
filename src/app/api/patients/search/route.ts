import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { searchPatients } from '@/lib/queries/patients'

/**
 * GET /api/patients/search?q=query
 * Search patients with smart phonetic matching
 */
export async function GET(request: Request) {
  const supabase = await createClient()

  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // Get search query
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q') || ''

  try {
    const patients = await searchPatients(query, 30)
    return NextResponse.json({ patients })
  } catch (error) {
    console.error('Error searching patients:', error)
    return NextResponse.json({ error: 'Error al buscar pacientes' }, { status: 500 })
  }
}

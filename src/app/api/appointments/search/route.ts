import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * GET /api/appointments/search?q=query
 * Search appointments by patient name, cedula, or phone
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
  const query = searchParams.get('q')?.trim() || ''

  if (query.length < 2) {
    return NextResponse.json({ appointments: [] })
  }

  // Search appointments with patient data
  // Using ilike for case-insensitive search
  const searchPattern = `%${query}%`

  const { data: appointments, error } = await supabase
    .from('appointments')
    .select(`
      id,
      fecha_hora_inicio,
      fecha_hora_fin,
      estado,
      motivo_consulta,
      doctor_id,
      patient:patients!inner(
        nombre,
        apellido,
        cedula,
        celular
      )
    `)
    .or(`nombre.ilike.${searchPattern},apellido.ilike.${searchPattern},cedula.ilike.${searchPattern},celular.ilike.${searchPattern}`, { referencedTable: 'patients' })
    .order('fecha_hora_inicio', { ascending: false })
    .limit(10)

  if (error) {
    console.error('Error searching appointments:', error)
    return NextResponse.json({ error: 'Error en la busqueda' }, { status: 500 })
  }

  // Fetch doctor info for each appointment
  const doctorIds = [...new Set(appointments?.map(a => a.doctor_id) || [])]

  let doctorsMap = new Map()
  if (doctorIds.length > 0) {
    const { data: doctors } = await supabase
      .from('doctors_view')
      .select('id, nombre, apellido, email')
      .in('id', doctorIds)

    doctorsMap = new Map(doctors?.map(d => [d.id, d]) || [])
  }

  // Combine data
  const results = (appointments || []).map(apt => ({
    ...apt,
    doctor: doctorsMap.get(apt.doctor_id) || { nombre: null, apellido: null, email: 'Desconocido' },
  }))

  return NextResponse.json({ appointments: results })
}

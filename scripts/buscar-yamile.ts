import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

async function main() {
  // Buscar en patients
  console.log('=== BUSCANDO EN PATIENTS ===')
  const { data: patients, error: e1 } = await supabase
    .from('patients')
    .select('*')
    .ilike('nombre', '%yamile%')

  console.log('Pacientes encontrados:', patients?.length || 0)
  patients?.forEach(p => console.log(p))

  // Buscar también por apellido
  const { data: patients2 } = await supabase
    .from('patients')
    .select('*')
    .ilike('apellido', '%zarate%')

  console.log('\nPor apellido Zarate:', patients2?.length || 0)
  patients2?.forEach(p => console.log(`${p.nombre} ${p.apellido} - ID: ${p.id}`))

  // Buscar la cita
  console.log('\n=== BUSCANDO CITA ===')
  const { data: appointments } = await supabase
    .from('appointments')
    .select('*, patient:patients(id, nombre, apellido)')
    .ilike('notas', '%yamile%')

  console.log('Citas encontradas:', appointments?.length || 0)
  appointments?.forEach(a => {
    console.log('Cita ID:', a.id)
    console.log('Patient ID:', a.patient_id)
    console.log('Patient:', a.patient)
    console.log('Notas:', a.notas)
  })
}

main()

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function search() {
  // 1. Carmen Cecilia Pabon
  const { data: carmen } = await supabase
    .from('patients')
    .select('id, cedula, nombre, apellido, celular')
    .or('apellido.ilike.%pabon%,nombre.ilike.%carmen%')

  console.log('=== CARMEN PABON ===')
  carmen
    ?.filter(
      (p) =>
        p.nombre?.toLowerCase().includes('carmen') ||
        p.apellido?.toLowerCase().includes('pabon')
    )
    .forEach((p) =>
      console.log(p.id, '|', p.cedula, '|', p.nombre, p.apellido, '|', p.celular)
    )

  // 2. Leonor Leon - por teléfono y nombre
  const { data: leonor } = await supabase
    .from('patients')
    .select('id, cedula, nombre, apellido, celular')
    .or(
      'celular.ilike.%3164841566%,celular.ilike.%316484%,apellido.ilike.%leon%,nombre.ilike.%leonor%'
    )

  console.log('\n=== LEONOR LEON (tel 3164841566) ===')
  leonor?.forEach((p) =>
    console.log(p.id, '|', p.cedula, '|', p.nombre, p.apellido, '|', p.celular)
  )

  // 3. Alba del Carmen Hernandez
  const { data: alba } = await supabase
    .from('patients')
    .select('id, cedula, nombre, apellido, celular')
    .or('nombre.ilike.%alba%,apellido.ilike.%hernandez%')

  console.log('\n=== ALBA HERNANDEZ ===')
  alba
    ?.filter(
      (p) =>
        p.nombre?.toLowerCase().includes('alba') ||
        p.apellido?.toLowerCase().includes('hernandez')
    )
    .forEach((p) =>
      console.log(p.id, '|', p.cedula, '|', p.nombre, p.apellido, '|', p.celular)
    )

  // 4. Maria Elvira Cornejo Peñuela
  const { data: elvira } = await supabase
    .from('patients')
    .select('id, cedula, nombre, apellido, celular')
    .or('apellido.ilike.%cornejo%,apellido.ilike.%pe_uela%')

  console.log('\n=== MARIA ELVIRA CORNEJO PEÑUELA ===')
  elvira?.forEach((p) =>
    console.log(p.id, '|', p.cedula, '|', p.nombre, p.apellido, '|', p.celular)
  )
}

search()

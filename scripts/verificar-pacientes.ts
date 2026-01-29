import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

const pacientes = [
  'Paola Yanira Diaz Daza',
  'Liliana Pinto Sanchez',
  'Yisela Navarro Vergara',
  'Camila Ramos',
  'Olga Lucia Arevalo',
  'Sonia Marina Zarate',
  'Esther Julia Cujar',
  'Carmen Cecilia Quiñonez'
]

async function main() {
  console.log('=== VERIFICANDO CITAS DE PACIENTES ===\n')

  for (const nombre of pacientes) {
    const palabras = nombre.split(' ')
    const primerNombre = palabras[0]

    // Buscar paciente
    const { data: patients } = await supabase
      .from('patients')
      .select('id, nombre, apellido')
      .ilike('nombre', `%${primerNombre}%`)
      .limit(5)

    const paciente = patients?.find(p =>
      `${p.nombre} ${p.apellido}`.toLowerCase().includes(nombre.toLowerCase().split(' ').slice(0, 2).join(' '))
    )

    if (!paciente) {
      console.log(`❌ ${nombre} - Paciente no encontrado`)
      continue
    }

    // Buscar citas futuras
    const { data: citas } = await supabase
      .from('appointments')
      .select('fecha_hora_inicio, estado')
      .eq('patient_id', paciente.id)
      .gte('fecha_hora_inicio', '2026-01-29T00:00:00-05:00')
      .order('fecha_hora_inicio')
      .limit(5)

    if (!citas || citas.length === 0) {
      console.log(`❌ ${paciente.nombre} ${paciente.apellido} - SIN CITAS FUTURAS`)
    } else {
      const citasStr = citas.map(c => {
        const d = new Date(c.fecha_hora_inicio)
        return d.toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short' })
      }).join(', ')
      console.log(`✅ ${paciente.nombre} ${paciente.apellido} - ${citas.length} cita(s): ${citasStr}`)
    }
  }
}

main()

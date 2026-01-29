import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

async function main() {
  // Citas de hoy (29/01/2026)
  const { data: hoy } = await supabase
    .from('appointments')
    .select('fecha_hora_inicio, fecha_hora_fin, estado, notas, patient:patients(nombre, apellido)')
    .gte('fecha_hora_inicio', '2026-01-29T00:00:00-05:00')
    .lt('fecha_hora_inicio', '2026-01-30T00:00:00-05:00')
    .order('fecha_hora_inicio')

  console.log('=== CITAS HOY (29/01/2026) EN BD ===')
  console.log('Total:', hoy?.length || 0)
  hoy?.forEach(c => {
    const hora = new Date(c.fecha_hora_inicio).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' })
    const paciente = c.patient as { nombre: string; apellido: string } | null
    console.log(`${hora} | ${paciente?.nombre} ${paciente?.apellido}`)
  })

  // Citas del sábado (31/01/2026)
  const { data: sabado } = await supabase
    .from('appointments')
    .select('fecha_hora_inicio, patient:patients(nombre, apellido)')
    .gte('fecha_hora_inicio', '2026-01-31T00:00:00-05:00')
    .lt('fecha_hora_inicio', '2026-02-01T00:00:00-05:00')
    .order('fecha_hora_inicio')

  console.log('\n=== CITAS SÁBADO (31/01/2026) EN BD ===')
  console.log('Total:', sabado?.length || 0)
  sabado?.forEach(c => {
    const hora = new Date(c.fecha_hora_inicio).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' })
    const paciente = c.patient as { nombre: string; apellido: string } | null
    console.log(`${hora} | ${paciente?.nombre} ${paciente?.apellido}`)
  })
}

main()

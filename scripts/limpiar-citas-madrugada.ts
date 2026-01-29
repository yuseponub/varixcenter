/**
 * Eliminar citas que quedaron en horas de madrugada (erróneas)
 * Estas son duplicadas porque ya existe la cita correcta en la hora PM
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

async function main() {
  // Buscar citas migradas que estén en horas de madrugada (0-8 AM)
  const { data: citas, error } = await supabase
    .from('appointments')
    .select('id, fecha_hora_inicio, notas, patient:patients(nombre, apellido)')
    .like('notas', 'Migrado de Outlook:%')

  if (error) {
    console.error('Error:', error)
    return
  }

  const citasMadrugada = (citas || []).filter(c => {
    const hora = new Date(c.fecha_hora_inicio)
    const horaCol = (hora.getUTCHours() - 5 + 24) % 24
    return horaCol >= 0 && horaCol <= 7
  })

  console.log('=== CITAS EN HORAS DE MADRUGADA (ERRÓNEAS) ===')
  console.log(`Total: ${citasMadrugada.length}`)

  for (const c of citasMadrugada) {
    const hora = new Date(c.fecha_hora_inicio)
    const horaStr = hora.toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' })
    const fechaStr = hora.toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })
    const paciente = c.patient as { nombre: string; apellido: string } | null
    console.log(`${fechaStr} ${horaStr} | ${paciente?.nombre} ${paciente?.apellido} | ID: ${c.id}`)
  }

  // Preguntar si eliminar
  if (citasMadrugada.length > 0) {
    console.log('\nEliminando citas erróneas...')
    for (const c of citasMadrugada) {
      const { error: delError } = await supabase
        .from('appointments')
        .delete()
        .eq('id', c.id)

      if (delError) {
        console.error(`Error eliminando ${c.id}:`, delError.message)
      } else {
        const paciente = c.patient as { nombre: string; apellido: string } | null
        console.log(`✅ Eliminada: ${paciente?.nombre} ${paciente?.apellido}`)
      }
    }
  }

  console.log('\nListo!')
}

main()

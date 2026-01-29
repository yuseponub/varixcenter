/**
 * Corregir horas de citas migradas
 * Las citas de 01:00 a.m. a 07:30 a.m. deberían ser PM (tarde)
 * Las citas de 12:00 a.m./12:30 a.m. deberían ser 12:00 PM (mediodía)
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

async function main() {
  // Obtener todas las citas migradas de Outlook
  const { data: citas, error } = await supabase
    .from('appointments')
    .select('id, fecha_hora_inicio, fecha_hora_fin, notas')
    .like('notas', 'Migrado de Outlook:%')

  if (error) {
    console.error('Error:', error)
    return
  }

  console.log(`Total citas migradas: ${citas?.length}`)

  let corregidas = 0
  let yaCorrectas = 0

  for (const cita of citas || []) {
    const inicio = new Date(cita.fecha_hora_inicio)
    const fin = new Date(cita.fecha_hora_fin)

    // Hora en Colombia (UTC-5)
    const horaUTC = inicio.getUTCHours()
    const horaCol = (horaUTC - 5 + 24) % 24 // Ajustar a Colombia

    // Si la hora es entre 0 y 7 (12 AM - 7 AM en Colombia), debería ser PM
    // Excepto si ya es tarde (hora >= 12)
    if (horaCol >= 0 && horaCol <= 7) {
      // Añadir 12 horas para convertir a PM
      const nuevoInicio = new Date(inicio.getTime() + 12 * 60 * 60 * 1000)
      const nuevoFin = new Date(fin.getTime() + 12 * 60 * 60 * 1000)

      const horaAntes = inicio.toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' })
      const horaDespues = nuevoInicio.toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' })

      console.log(`Corrigiendo: ${horaAntes} → ${horaDespues}`)

      const { error: updateError } = await supabase
        .from('appointments')
        .update({
          fecha_hora_inicio: nuevoInicio.toISOString(),
          fecha_hora_fin: nuevoFin.toISOString()
        })
        .eq('id', cita.id)

      if (updateError) {
        console.error(`Error actualizando ${cita.id}:`, updateError.message)
      } else {
        corregidas++
      }
    } else {
      yaCorrectas++
    }
  }

  console.log('\n=== RESUMEN ===')
  console.log(`Citas corregidas: ${corregidas}`)
  console.log(`Citas ya correctas: ${yaCorrectas}`)
}

main()

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

async function main() {
  // Buscar citas a las 12:00-12:59 AM (deberían ser PM)
  const { data: citas } = await supabase
    .from('appointments')
    .select('id, fecha_hora_inicio, fecha_hora_fin, patient:patients(nombre, apellido)')
    .like('notas', 'Migrado de Outlook:%')

  const citasMedianoche = (citas || []).filter(c => {
    const hora = new Date(c.fecha_hora_inicio)
    const horaCol = (hora.getUTCHours() - 5 + 24) % 24
    return horaCol >= 0 && horaCol < 1 // 12:00 - 12:59 AM
  })

  console.log(`Citas a medianoche encontradas: ${citasMedianoche.length}`)

  for (const c of citasMedianoche) {
    const inicio = new Date(c.fecha_hora_inicio)
    const fin = new Date(c.fecha_hora_fin)

    // Añadir 12 horas
    const nuevoInicio = new Date(inicio.getTime() + 12 * 60 * 60 * 1000)
    const nuevoFin = new Date(fin.getTime() + 12 * 60 * 60 * 1000)

    const paciente = c.patient as { nombre: string; apellido: string } | null
    const horaAntes = inicio.toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' })
    const horaDespues = nuevoInicio.toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' })

    const { error } = await supabase
      .from('appointments')
      .update({
        fecha_hora_inicio: nuevoInicio.toISOString(),
        fecha_hora_fin: nuevoFin.toISOString()
      })
      .eq('id', c.id)

    if (error) {
      console.log(`❌ ${paciente?.nombre} ${paciente?.apellido}: ${error.message}`)
    } else {
      console.log(`✅ ${paciente?.nombre} ${paciente?.apellido}: ${horaAntes} → ${horaDespues}`)
    }
  }
}

main()

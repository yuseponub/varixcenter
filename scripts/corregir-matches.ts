import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Correcciones: nombreExtraido -> cedula correcta
const correcciones: Record<string, string> = {
  'BLANCA HELENA RO': '60250185', // Blanca Helena Rodriguez Cote
  'ELSA RO': '37655057', // Elsa Rodriguez Reyes
  'SAN': '37753949', // Sandra Milena Figueroa
  'GLADYS RO': '3158559315_TEL', // Buscar por teléfono - es nueva
  'JENNY GONZALEZ RO': '63368830', // Jeny Gonzalez Rodriguez (del candidato 5)
  'ANA CELIA SEPULVEDA': '63536264', // Anacelia Sepulveda Duran
  'LUZ DARY PARADA': '37726899', // Luz Dary Parada Vargas
  'LUZ MERY TORRES': '45622667', // Luz Mery Torres Salamanca
  'ALEXAN': '63512270', // Alexandra Yanneth Mayorga Rodriguez (correcto)
}

async function main() {
  const data = JSON.parse(fs.readFileSync('scripts/citas-matched-fonetico.json', 'utf-8'))

  // Cargar pacientes
  const cedulas = Object.values(correcciones).filter((c) => !c.includes('_TEL'))
  const { data: patients } = await supabase
    .from('patients')
    .select('id, cedula, nombre, apellido, celular')
    .in('cedula', cedulas)

  const patientMap = new Map(patients?.map((p) => [p.cedula, p]) || [])

  let fixed = 0

  for (const cita of data) {
    const nombre = cita.nombreExtraido
    const cedula = correcciones[nombre]

    if (cedula && !cedula.includes('_TEL')) {
      const patient = patientMap.get(cedula)
      if (patient) {
        console.log(`✅ ${nombre} → ${patient.nombre} ${patient.apellido} (${patient.cedula})`)
        cita.patient = patient
        cita.status = 'matched'
        delete cita.candidates
        fixed++
      }
    } else if (cedula?.includes('_TEL')) {
      // Marcar como nuevo
      cita.status = 'nuevo'
      cita.nota = 'Paciente nuevo - buscar por teléfono'
    }
  }

  fs.writeFileSync('scripts/citas-matched-fonetico.json', JSON.stringify(data, null, 2))

  console.log(`\nCorregidos: ${fixed}`)

  // Contar estados finales
  const matched = data.filter((c: any) => c.status === 'matched').length
  const multiple = data.filter((c: any) => c.status === 'multiple').length
  const nuevo = data.filter((c: any) => c.status === 'nuevo').length

  console.log(`\nEstado final:`)
  console.log(`  ✅ Matched: ${matched}`)
  console.log(`  🔶 Múltiples: ${multiple}`)
  console.log(`  🆕 Nuevos: ${nuevo}`)
  console.log(`  📊 Total: ${data.length}`)
}

main().catch(console.error)

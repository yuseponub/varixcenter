import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Matches claros - cedula del paciente correcto
const matchesClaros: Record<string, string> = {
  'CLAUDIA LILIANA MORENO': '63515304',
  'NELSY GUEVARA RO': '63325959',
  'ALBA DEL CARMEN HERNANDEZ': '63277996',
  'ALICIA RIVERO': '37813385',
  'CARMEN CECILIA PABON': '37821873',
  'CENAIDA BLANCO': '37876196',
  'JANETTE LUNA PINZON': '63514071',
  'ROSA DELIA CARRILLO': '23357159',
  'CARMEN CARRILLO CARRILLO': '63367884',
  'JOHANA KARINA ROJAS': '1098657791',
  'MARIA TERESA CORREA': '28296805',
  'ERNESTINA GARCES': '27952775',
  'DIANA BOHORQUEZ': '1098716990',
  'SARA EDITH FLOREZ': '52397649',
  'MARIA DIAZ ALVAREZ': '63332314',
  'EZID ADELA PEREZ': '37934951',
  'LINA LUZ MARTINEZ': '63511180',
  'RUTH GARCIA GOMEZ': '28469826',
  'IRENE RUEDA': '37510346',
  'MARIA EUGENIA RUIZ DE': '28437271',
  'ANA DOLRES PEREZ': '27986759',
  'YESMITH HELENA ARIAZ': '63336293',
  'BELQUES CALA CALA': '28352881',
  'GLORIA CAMACHO': '63283352',
  'TOÑA ROJAS DIAS': '63432119',
  'MARIA DEL CARMEN CAÑAS': '60258710',
  'BLANCA HELENA RO': 'BUSCAR', // Necesita búsqueda
  'ELSA RO': 'BUSCAR',
  'GLADYS RO': 'BUSCAR',
  'SAN': 'BUSCAR', // SANDRA MILENA FIGUEROA SILVA
  'ALEXAN': 'BUSCAR', // ALEXANDRA YANNETH MAYORGA
  'JENNY GONZALEZ RO': 'BUSCAR',
  'ANA CELIA SEPULVEDA': 'BUSCAR',
  'BLEIDY AMPARO': 'BUSCAR',
  'LUZ DARY PARADA': 'BUSCAR',
  'LUZ MERY TORRES': 'BUSCAR',
  'ISADORA VARGAS URREA': 'BUSCAR',
}

// Pacientes probablemente nuevos (tel no en BD)
const probablesNuevos = [
  'SIRLEY JOHANA CARVAJAL DURAN',
  'CAMILO AN',
  'ANA PATRICIA CARDENAS GUTIERREZ',
  'LISETH ALDANA LOPEZ',
  'WILLIAM GOMEZ BUENO',
  'ISABEL ANGARITA GAMBOA',
  'LUZ HELENA SALINAS VACA',
  'LUZ MERY QUINCHIA',
  'GLORIA SANTAMARIA PEÑA',
  'LADY JOANA CORTÉS PINZON',
  'DIANA MARCELA MANTILLA ROJAS',
]

async function main() {
  // Cargar datos actuales
  const data = JSON.parse(fs.readFileSync('scripts/citas-matched-fonetico.json', 'utf-8'))

  // Buscar pacientes que necesitan búsqueda adicional
  const busquedas = [
    { nombre: 'BLANCA HELENA RO', buscar: 'Blanca Helena Rodriguez' },
    { nombre: 'ELSA RO', buscar: 'Elsa Rodriguez Reyes' },
    { nombre: 'GLADYS RO', buscar: 'Gladys Rodriguez' },
    { nombre: 'SAN', buscar: 'Sandra Milena Figueroa Silva' },
    { nombre: 'ALEXAN', buscar: 'Alexandra Yanneth Mayorga' },
    { nombre: 'JENNY GONZALEZ RO', buscar: 'Jenny Gonzalez Rodriguez' },
    { nombre: 'ANA CELIA SEPULVEDA', buscar: 'Ana Celia Sepulveda' },
    { nombre: 'BLEIDY AMPARO', buscar: 'Bleidy Amparo' },
    { nombre: 'LUZ DARY PARADA', buscar: 'Luz Dary Parada' },
    { nombre: 'LUZ MERY TORRES', buscar: 'Luz Mery Torres' },
    { nombre: 'ISADORA VARGAS URREA', buscar: 'Isadora Vargas Urrea' },
  ]

  console.log('Buscando pacientes adicionales...\n')

  for (const { nombre, buscar } of busquedas) {
    const palabras = buscar.split(' ')
    const primerNombre = palabras[0]
    const apellido = palabras.length > 1 ? palabras[palabras.length - 1] : ''

    const { data: found } = await supabase
      .from('patients')
      .select('id, cedula, nombre, apellido, celular')
      .ilike('nombre', `%${primerNombre}%`)
      .ilike('apellido', `%${apellido}%`)
      .limit(5)

    if (found && found.length > 0) {
      console.log(`${nombre} → Encontrados:`)
      found.forEach((p, i) => {
        console.log(`  [${i + 1}] ${p.nombre} ${p.apellido} (CC ${p.cedula})`)
      })
      // Asignar el primero que coincida mejor
      const best = found.find(
        (p) =>
          p.nombre.toLowerCase().includes(primerNombre.toLowerCase()) &&
          p.apellido.toLowerCase().includes(apellido.toLowerCase())
      )
      if (best) {
        matchesClaros[nombre] = best.cedula
        console.log(`  ✅ Asignado: ${best.cedula}\n`)
      } else {
        console.log(`  ❌ Ninguno coincide bien\n`)
      }
    } else {
      console.log(`${nombre} → NO ENCONTRADO\n`)
    }
  }

  // Cargar todos los pacientes que necesitamos
  const cedulas = Object.values(matchesClaros).filter((c) => c !== 'BUSCAR')
  const { data: patients } = await supabase
    .from('patients')
    .select('id, cedula, nombre, apellido, celular')
    .in('cedula', cedulas)

  const patientMap = new Map(patients?.map((p) => [p.cedula, p]) || [])

  // Actualizar datos
  let updated = 0
  let markedNew = 0

  for (const cita of data) {
    const nombre = cita.nombreExtraido

    // Si ya está matched, saltar
    if (cita.status === 'matched' && cita.patient) continue

    // Verificar si es un match claro
    const cedula = matchesClaros[nombre]
    if (cedula && cedula !== 'BUSCAR') {
      const patient = patientMap.get(cedula)
      if (patient) {
        cita.patient = patient
        cita.status = 'matched'
        delete cita.candidates
        updated++
        continue
      }
    }

    // Verificar si es probable nuevo
    if (probablesNuevos.includes(nombre)) {
      cita.status = 'nuevo'
      cita.nota = 'Paciente probable nuevo - teléfono no en BD'
      markedNew++
    }
  }

  // Guardar
  fs.writeFileSync('scripts/citas-matched-fonetico.json', JSON.stringify(data, null, 2))

  console.log('\n=== RESUMEN ===')
  console.log(`Actualizados con match: ${updated}`)
  console.log(`Marcados como nuevo: ${markedNew}`)

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

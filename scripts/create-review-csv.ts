/**
 * Create CSV for manual review of appointments
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

const CALENDAR_DIR = '/tmp/outlook_export/calendar_output/Archivo de datos de Outlook/Calendario/Mi calendario'
const CUTOFF_DATE = new Date('2026-01-29T00:00:00-05:00')

function parseIcsFile(filePath: string) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const summaryMatch = content.match(/SUMMARY:(.+?)(?:\r?\n|$)/)
    const dtstartMatch = content.match(/DTSTART[^:]*:(\d{8}T\d{6}Z?)/)

    if (!summaryMatch || !dtstartMatch) return null

    const match = dtstartMatch[1].match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/)
    if (!match) return null

    const [, year, month, day, hour, min] = match
    const utcDate = new Date(Date.UTC(+year, +month - 1, +day, +hour, +min, 0))

    return { summary: summaryMatch[1].trim(), fecha: utcDate }
  } catch {
    return null
  }
}

function extractName(summary: string): string {
  return summary
    .replace(/^\s*\d{1,2}[\s.:,]+\d{2}\s*/i, '')
    .replace(/^\s*\d{3,4}\s+/i, '')
    .replace(/\s*(TEL|CEL|CELL)[\s.:]*[\d\s\-\(\)\+]+.*/gi, '')
    .replace(/\s*\d{7,}.*/g, '')
    .replace(/\s*\d+\s*(SESION|SESIONES|SES|VEZ)\b.*/gi, '')
    .replace(/\s*(INI|INICIO|REVISION|REV|OK|CONFIRMAD|CONTROL|RETIRO|RESIDUOS|VSI|LOCION|MEDIA|TROMBOS|ECOR|FLEBECTOMIA|ESCLEROTERAPIA|LASER|DUPLEX|SCANEO|DEPILACION|DR|DRA|DOCTOR|DOCTORA)\b.*/gi, '')
    .replace(/\.\d+\.\d+.*/g, '')
    .replace(/\s*\/\/.*/g, '')
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 1 && !/^\d+$/.test(w))
    .slice(0, 4)
    .join(' ')
    .toUpperCase()
}

async function main() {
  console.log('📂 Loading patients...')
  const { data: patients } = await supabase.from('patients').select('id, cedula, nombre, apellido')

  console.log('📅 Scanning appointments...')
  const files = fs.readdirSync(CALENDAR_DIR)

  const appointments: any[] = []

  for (const file of files) {
    const event = parseIcsFile(path.join(CALENDAR_DIR, file))
    if (!event || event.fecha < CUTOFF_DATE) continue

    // Convert to Colombia time
    const fecha = new Date(event.fecha.getTime())
    const fechaStr = fecha.toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })
    const horaStr = fecha.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' })

    appointments.push({
      fecha: fechaStr,
      hora: horaStr,
      summary: event.summary,
      nombre_extraido: extractName(event.summary),
      fechaISO: event.fecha.toISOString()
    })
  }

  appointments.sort((a, b) => new Date(a.fechaISO).getTime() - new Date(b.fechaISO).getTime())

  // Create CSV with all patients as reference
  const patientList = (patients || [])
    .map(p => `${p.cedula}: ${p.nombre} ${p.apellido}`)
    .sort()
    .join('\n')

  // Save patient list
  fs.writeFileSync('/mnt/c/Users/Usuario/Proyectos/varix-clinic/scripts/lista-pacientes.txt', patientList)

  // Create appointments CSV
  const csv = [
    'Fecha,Hora,Nombre en Calendario,Nombre Extraido,Cedula Paciente (LLENAR)',
    ...appointments.map(a =>
      `"${a.fecha}","${a.hora}","${a.summary.replace(/"/g, '""')}","${a.nombre_extraido}",""`
    )
  ].join('\n')

  const csvPath = '/mnt/c/Users/Usuario/Proyectos/varix-clinic/scripts/citas-para-revisar.csv'
  fs.writeFileSync(csvPath, csv)

  console.log(`\n✅ Archivos creados:`)
  console.log(`   📄 ${csvPath}`)
  console.log(`   📄 /mnt/c/Users/Usuario/Proyectos/varix-clinic/scripts/lista-pacientes.txt`)
  console.log(`\n📊 Total citas: ${appointments.length}`)
  console.log(`\nInstrucciones:`)
  console.log(`1. Abre citas-para-revisar.csv en Excel`)
  console.log(`2. En la columna "Cedula Paciente" pon la cédula del paciente correcto`)
  console.log(`3. Usa lista-pacientes.txt como referencia para buscar`)
  console.log(`4. Guarda y vuelve aquí para subir las citas`)
}

main().catch(console.error)

/**
 * Matching de citas v2 - Búsqueda por nombre + apellido
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CALENDAR_DIR = '/tmp/outlook_export/calendar_output/Archivo de datos de Outlook/Calendario/Mi calendario'

function parseIcs(filePath: string) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const summary = content.match(/SUMMARY:(.+?)(?:\r?\n|$)/)?.[1]?.trim()
    const dtstart = content.match(/DTSTART[^:]*:(\d{8}T\d{6}Z?)/)?.[1]
    const dtend = content.match(/DTEND[^:]*:(\d{8}T\d{6}Z?)/)?.[1]
    if (!summary || !dtstart) return null

    const m = dtstart.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/)
    if (!m) return null
    const fecha = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]))

    let fechaFin = fecha
    if (dtend) {
      const mEnd = dtend.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/)
      if (mEnd) fechaFin = new Date(Date.UTC(+mEnd[1], +mEnd[2] - 1, +mEnd[3], +mEnd[4], +mEnd[5]))
    }

    return { summary, fecha, fechaFin }
  } catch {
    return null
  }
}

function normalize(str: string): string {
  return str
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z\s]/g, '')
    .trim()
}

function extractNameFromSummary(summary: string): string {
  // Quitar hora del inicio
  let cleaned = summary.replace(/^[\s]*\d{1,2}[.\s:,]+\d{2}\s*/i, '')

  // Quitar todo después de palabras clave
  const stopWords = ['TEL', 'CEL', 'CELL', 'CC', 'SESION', 'SESIONES', 'SES', 'VEZ', 'CONTROL', 'REVISION', 'REV', 'ECOR', 'FLEBECTOMIA', 'LASER', 'DUPLEX', 'SCANEO', 'DRA', 'DR', 'OK', 'CONFIRMAD', 'RETIRO', 'RESIDUOS', 'INI', 'INICIO', 'VSI', 'LOCION', 'MEDIA', 'TROMBOS', 'DEPILACION']

  for (const word of stopWords) {
    const idx = cleaned.toUpperCase().indexOf(word)
    if (idx > 0) {
      cleaned = cleaned.substring(0, idx)
    }
  }

  // Quitar números de teléfono y puntos
  cleaned = cleaned.replace(/\d{6,}/g, '').replace(/\.\d+/g, '').replace(/\s+\d+\s+/g, ' ')

  return cleaned.trim().toUpperCase()
}

async function main() {
  console.log('Cargando pacientes...')
  const { data: patients } = await supabase
    .from('patients')
    .select('id, cedula, nombre, apellido, celular')

  if (!patients) {
    console.error('No se pudieron cargar pacientes')
    return
  }

  console.log(`Pacientes cargados: ${patients.length}`)

  // Obtener citas de mañana
  const files = fs.readdirSync(CALENDAR_DIR)
  const citasManana: any[] = []

  for (const file of files) {
    const e = parseIcs(path.join(CALENDAR_DIR, file))
    if (!e) continue

    const fechaColombia = new Date(e.fecha.getTime() - 5 * 60 * 60 * 1000)
    if (fechaColombia.getFullYear() === 2026 && fechaColombia.getMonth() === 0 && fechaColombia.getDate() === 29) {
      const horaMatch = e.summary.match(/^[\s]*(\d{1,2})[.\s:](\d{2})/)
      const horaReal = horaMatch ? `${horaMatch[1]}:${horaMatch[2]}` : '??:??'

      citasManana.push({
        horaReal,
        summary: e.summary,
        nombre: extractNameFromSummary(e.summary),
        fecha: e.fecha,
        fechaFin: e.fechaFin
      })
    }
  }

  citasManana.sort((a, b) => {
    const toMin = (h: string) => {
      const [hrs, mins] = h.split(':').map(Number)
      return (hrs || 0) * 60 + (mins || 0)
    }
    return toMin(a.horaReal) - toMin(b.horaReal)
  })

  console.log(`\nCitas de mañana: ${citasManana.length}\n`)
  console.log('═'.repeat(100))

  for (let i = 0; i < citasManana.length; i++) {
    const cita = citasManana[i]
    const nombreCita = normalize(cita.nombre)
    const palabrasCita = nombreCita.split(/\s+/).filter(w => w.length > 2)

    console.log(`\n${i + 1}. ${cita.horaReal} | ${cita.nombre}`)
    console.log(`   (${cita.summary.substring(0, 60)}...)`)

    // Buscar pacientes que coincidan
    const matches: any[] = []

    for (const p of patients) {
      const nombreCompleto = normalize(`${p.nombre} ${p.apellido}`)
      const palabrasPaciente = nombreCompleto.split(/\s+/).filter(w => w.length > 2)

      // Contar palabras que coinciden EXACTAMENTE
      let coincidencias = 0
      for (const palabraCita of palabrasCita) {
        for (const palabraPaciente of palabrasPaciente) {
          if (palabraCita === palabraPaciente) {
            coincidencias++
            break
          }
        }
      }

      // Si coinciden al menos 2 palabras (nombre + apellido), es un match
      if (coincidencias >= 2) {
        matches.push({ ...p, coincidencias })
      }
    }

    // Ordenar por número de coincidencias
    matches.sort((a, b) => b.coincidencias - a.coincidencias)

    if (matches.length === 0) {
      console.log('   ❌ NO ENCONTRADO')
    } else if (matches.length === 1) {
      const m = matches[0]
      console.log(`   ✅ ${m.nombre} ${m.apellido} | Cédula: ${m.cedula} | Tel: ${m.celular}`)
    } else {
      console.log('   🔶 CANDIDATOS:')
      matches.slice(0, 5).forEach((m, j) => {
        console.log(`      ${j + 1}. ${m.nombre} ${m.apellido} | Cédula: ${m.cedula} | Tel: ${m.celular}`)
      })
    }
  }

  console.log('\n' + '═'.repeat(100))
}

main().catch(console.error)

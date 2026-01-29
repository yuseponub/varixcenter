import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CALENDAR_DIR = '/tmp/outlook_export/calendar_output/Archivo de datos de Outlook/Calendario/Mi calendario'

interface Cita {
  hora: string
  summary: string
  nombreExtraido: string
  fecha: Date
}

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

    let fechaFin = null
    if (dtend) {
      const mEnd = dtend.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/)
      if (mEnd) {
        fechaFin = new Date(Date.UTC(+mEnd[1], +mEnd[2] - 1, +mEnd[3], +mEnd[4], +mEnd[5]))
      }
    }

    return { summary, fecha, fechaFin }
  } catch {
    return null
  }
}

function extractName(summary: string): string {
  // Extraer hora del summary (ej: "8.00", "10.30")
  const horaMatch = summary.match(/^[\s]*(\d{1,2})[.\s:](\d{2})\s*/)
  let cleaned = summary
  if (horaMatch) {
    cleaned = summary.substring(horaMatch[0].length)
  }

  return cleaned
    .replace(/\s*(TEL|CEL|CELL|CC|C\.C)[\s.:]*[\d\s\-\(\)\+\.]+.*/gi, '')
    .replace(/\s*\d{7,}.*/g, '')
    .replace(/\s*\d+\s*(SESION|SESIONES|SES)\b.*/gi, '')
    .replace(/\s*(INI|INICIO|REVISION|REV|OK|CONFIRMAD|CONTROL|RETIRO|RESIDUOS|VSI|LOCION|ECOR|FLEBECTOMIA|LASER|DUPLEX|SCANEO|VEZ|DRA?)\b.*/gi, '')
    .replace(/\.\d+.*/g, '')
    .trim()
    .toUpperCase()
}

function normalize(str: string): string {
  return str
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z\s]/g, '')
    .trim()
}

async function main() {
  // Load patients
  const { data: patients } = await supabase
    .from('patients')
    .select('id, cedula, nombre, apellido, celular')

  if (!patients) {
    console.error('No patients found')
    return
  }

  // Get tomorrow's appointments
  const files = fs.readdirSync(CALENDAR_DIR)
  const citas: any[] = []

  for (const file of files) {
    const e = parseIcs(path.join(CALENDAR_DIR, file))
    if (!e) continue

    const fechaColombia = new Date(e.fecha.getTime() - 5 * 60 * 60 * 1000)

    if (
      fechaColombia.getFullYear() === 2026 &&
      fechaColombia.getMonth() === 0 &&
      fechaColombia.getDate() === 29
    ) {
      // Extract hour from summary
      const horaMatch = e.summary.match(/^[\s]*(\d{1,2})[.\s:](\d{2})/)
      let horaReal = ''
      if (horaMatch) {
        const h = +horaMatch[1]
        const m = horaMatch[2]
        horaReal = `${h}:${m}`
      }

      citas.push({
        horaReal,
        summary: e.summary,
        nombreExtraido: extractName(e.summary),
        fecha: e.fecha,
        fechaFin: e.fechaFin
      })
    }
  }

  // Sort by hour
  citas.sort((a, b) => {
    const toMin = (h: string) => {
      const [hrs, mins] = h.split(':').map(Number)
      return (hrs || 0) * 60 + (mins || 0)
    }
    return toMin(a.horaReal) - toMin(b.horaReal)
  })

  // Search for each patient
  console.log('═'.repeat(100))
  console.log('CITAS DE MAÑANA - 29 ENERO 2026 - BÚSQUEDA DE PACIENTES')
  console.log('═'.repeat(100))

  const results: any[] = []

  for (let i = 0; i < citas.length; i++) {
    const c = citas[i]
    const nombre = c.nombreExtraido
    const nombreNorm = normalize(nombre)
    const palabras = nombreNorm.split(/\s+/).filter((w: string) => w.length > 2)

    // Search patients
    const matches = patients.filter(p => {
      const fullName = normalize(`${p.nombre} ${p.apellido}`)
      const fullNameWords = fullName.split(/\s+/)

      // Count matching words
      let matchCount = 0
      for (const palabra of palabras) {
        if (fullNameWords.some(w => w === palabra || w.startsWith(palabra) || palabra.startsWith(w))) {
          matchCount++
        }
      }

      return matchCount >= 2 || (palabras.length === 1 && matchCount === 1)
    })

    // Sort by relevance
    matches.sort((a, b) => {
      const scoreA = palabras.filter((p: string) => normalize(`${a.nombre} ${a.apellido}`).includes(p)).length
      const scoreB = palabras.filter((p: string) => normalize(`${b.nombre} ${b.apellido}`).includes(p)).length
      return scoreB - scoreA
    })

    console.log(`\n${String(i + 1).padStart(2)}. ${c.horaReal.padStart(5)} │ ${nombre}`)
    console.log(`   Summary: ${c.summary.substring(0, 70)}...`)

    if (matches.length === 0) {
      console.log('   ❌ NO ENCONTRADO')
      results.push({ ...c, patient: null, status: 'not_found' })
    } else if (matches.length === 1) {
      const p = matches[0]
      console.log(`   ✅ ${p.nombre} ${p.apellido} (${p.cedula}) Tel: ${p.celular}`)
      results.push({ ...c, patient: p, status: 'exact' })
    } else {
      console.log('   🔶 CANDIDATOS:')
      matches.slice(0, 3).forEach((p, j) => {
        console.log(`      ${j + 1}. ${p.nombre} ${p.apellido} (${p.cedula}) Tel: ${p.celular}`)
      })
      results.push({ ...c, patient: matches[0], candidates: matches.slice(0, 3), status: 'multiple' })
    }
  }

  // Summary
  const exact = results.filter(r => r.status === 'exact')
  const multiple = results.filter(r => r.status === 'multiple')
  const notFound = results.filter(r => r.status === 'not_found')

  console.log('\n' + '═'.repeat(100))
  console.log('RESUMEN:')
  console.log(`   ✅ Match único: ${exact.length}`)
  console.log(`   🔶 Varios candidatos: ${multiple.length}`)
  console.log(`   ❌ No encontrado: ${notFound.length}`)
  console.log('═'.repeat(100))

  // Save results
  fs.writeFileSync(
    '/mnt/c/Users/Usuario/Proyectos/varix-clinic/scripts/citas-manana-resultado.json',
    JSON.stringify(results, null, 2)
  )
}

main().catch(console.error)

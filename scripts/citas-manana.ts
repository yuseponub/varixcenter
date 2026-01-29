import * as fs from 'fs'
import * as path from 'path'

const CALENDAR_DIR = '/tmp/outlook_export/calendar_output/Archivo de datos de Outlook/Calendario/Mi calendario'

function parseIcs(filePath: string) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const summary = content.match(/SUMMARY:(.+?)(?:\r?\n|$)/)?.[1]?.trim()
    const dtstart = content.match(/DTSTART[^:]*:(\d{8}T\d{6}Z?)/)?.[1]
    if (!summary || !dtstart) return null

    const m = dtstart.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/)
    if (!m) return null

    const fecha = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]))
    return { summary, fecha }
  } catch {
    return null
  }
}

const files = fs.readdirSync(CALENDAR_DIR)
const citas: { hora: string; summary: string }[] = []

for (const file of files) {
  const e = parseIcs(path.join(CALENDAR_DIR, file))
  if (!e) continue

  // Convertir a Colombia (UTC-5)
  const fechaColombia = new Date(e.fecha.getTime() - 5 * 60 * 60 * 1000)

  // Solo 29 de enero 2026
  if (
    fechaColombia.getFullYear() === 2026 &&
    fechaColombia.getMonth() === 0 &&
    fechaColombia.getDate() === 29
  ) {
    const hora = fechaColombia.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true })
    citas.push({ hora, summary: e.summary })
  }
}

citas.sort((a, b) => {
  // Convertir hora a minutos para ordenar
  const toMin = (h: string) => {
    const m = h.match(/(\d+):(\d+)\s*(a|p)/i)
    if (!m) return 0
    let hrs = +m[1]
    if (m[3].toLowerCase() === 'p' && hrs !== 12) hrs += 12
    if (m[3].toLowerCase() === 'a' && hrs === 12) hrs = 0
    return hrs * 60 + +m[2]
  }
  return toMin(a.hora) - toMin(b.hora)
})

console.log('═'.repeat(80))
console.log('CITAS DE MAÑANA - MIÉRCOLES 29 DE ENERO 2026')
console.log('═'.repeat(80))
console.log('')

citas.forEach((c, i) => {
  console.log(`${String(i + 1).padStart(2)}. ${c.hora.padStart(10)} │ ${c.summary}`)
})

console.log('')
console.log('═'.repeat(80))
console.log(`Total: ${citas.length} citas`)

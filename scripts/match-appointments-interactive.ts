/**
 * Interactive appointment matching
 * - Exact matches: auto-assign
 * - Uncertain: show options for user to choose
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

const CALENDAR_DIR = '/tmp/outlook_export/calendar_output/Archivo de datos de Outlook/Calendario/Mi calendario'
const CUTOFF_DATE = new Date('2026-01-29T00:00:00-05:00')

// ============================================
// TYPES
// ============================================

interface Patient {
  id: string
  cedula: string
  nombre: string
  apellido: string
  celular: string
}

interface Appointment {
  fecha: Date
  summary: string
  nombreExtraido: string
  patient?: Patient
  candidates?: Patient[]
  matchType: 'exact' | 'probable' | 'none'
}

// ============================================
// ICS PARSING
// ============================================

function parseIcsFile(filePath: string): { summary: string; dtstart: Date | null; dtend: Date | null } | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const summaryMatch = content.match(/SUMMARY:(.+?)(?:\r?\n|$)/)
    const dtstartMatch = content.match(/DTSTART[^:]*:(\d{8}T\d{6}Z?)/)
    const dtendMatch = content.match(/DTEND[^:]*:(\d{8}T\d{6}Z?)/)

    if (!summaryMatch || !dtstartMatch) return null

    return {
      summary: summaryMatch[1].trim(),
      dtstart: parseIcsDate(dtstartMatch[1]),
      dtend: dtendMatch ? parseIcsDate(dtendMatch[1]) : null
    }
  } catch {
    return null
  }
}

function parseIcsDate(dateStr: string): Date | null {
  const match = dateStr.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/)
  if (!match) return null
  const [, year, month, day, hour, min, sec] = match

  // Convert from UTC to Colombia time (UTC-5)
  const utcDate = new Date(Date.UTC(+year, +month - 1, +day, +hour, +min, +sec))
  return utcDate
}

// ============================================
// NAME EXTRACTION (improved)
// ============================================

function extractPatientName(summary: string): string {
  let cleaned = summary
    // Remove time patterns at start
    .replace(/^\s*\d{1,2}[\s.:,]+\d{2}\s*/i, '')
    .replace(/^\s*\d{1,2}\s*[.:]\s*\d{2}\s*/i, '')
    .replace(/^\s*\d{3,4}\s+/i, '')

  // Remove common suffixes
  cleaned = cleaned
    .replace(/\s*(TEL|CEL|CELL|TELEFONO)[\s.:]*[\d\s\-\(\)\+]+.*/gi, '')
    .replace(/\s*\d{7,}.*/g, '')
    .replace(/\s*\d{3}[\s\-]+\d{3,4}[\s\-]+\d{3,4}.*/g, '')
    .replace(/\s*\+\d[\s\d\-\(\)]+.*/g, '')
    .replace(/\s*\d+\s*(SESION|SESIONES|SES)\b.*/gi, '')
    .replace(/\s*(INI|INICIO|REVISION|REV|OK|CONFIRMAD[AO]?|CONTROL|VEZ|RETIRO|RESIDUOS|VSI|LOCION|MEDIA|TROMBOS)\b.*/gi, '')
    .replace(/\s*(ECOR|FLEBECTOMIA|ESCLEROTERAPIA|LASER|DUPLEX|SCANEO|DEPILACION)\b.*/gi, '')
    .replace(/\s*(DR|DRA|DOCTOR|DOCTORA)\.?\s*(REY|CIRO|CAROLINA|MARIO)?\.*.*/gi, '')
    .replace(/\s*\/\/.*/g, '')
    .replace(/\s*OJO\b.*/gi, '')
    .replace(/\s*CC\.?.*/gi, '')
    .replace(/\.\d+\.\d+.*/g, '') // Remove .123.456 patterns
    .trim()

  // Take name words (exclude numbers and single letters)
  const words = cleaned.split(/\s+/).filter(w => w.length > 1 && !/^\d+$/.test(w) && !/^[A-Z]$/.test(w))
  return words.slice(0, 4).join(' ').toUpperCase()
}

function normalize(str: string): string {
  return str
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z\s]/g, '')
    .trim()
}

// ============================================
// MATCHING (strict + fuzzy)
// ============================================

function calculateSimilarity(a: string, b: string): number {
  const wordsA = normalize(a).split(/\s+/).filter(w => w.length > 1)
  const wordsB = normalize(b).split(/\s+/).filter(w => w.length > 1)

  if (wordsA.length === 0 || wordsB.length === 0) return 0

  let matches = 0
  for (const wordA of wordsA) {
    for (const wordB of wordsB) {
      if (wordA === wordB) {
        matches += 2 // Exact word match
      } else if (wordA.includes(wordB) || wordB.includes(wordA)) {
        matches += 1 // Partial match
      }
    }
  }

  const maxPossible = Math.max(wordsA.length, wordsB.length) * 2
  return matches / maxPossible
}

function findMatches(name: string, patients: Patient[]): { exact?: Patient; candidates: Patient[] } {
  const normalizedName = normalize(name)
  const nameWords = normalizedName.split(/\s+/).filter(w => w.length > 1)

  if (nameWords.length === 0) return { candidates: [] }

  // Try exact match (all words present in patient name)
  for (const p of patients) {
    const fullName = normalize(`${p.nombre} ${p.apellido}`)
    const patientWords = fullName.split(/\s+/)

    // Check if ALL extracted name words appear in patient name
    const allMatch = nameWords.every(nw =>
      patientWords.some(pw => pw === nw || pw.startsWith(nw) || nw.startsWith(pw))
    )

    if (allMatch && nameWords.length >= 2) {
      return { exact: p, candidates: [] }
    }
  }

  // Find probable matches with similarity score
  const scored = patients.map(p => ({
    patient: p,
    score: calculateSimilarity(name, `${p.nombre} ${p.apellido}`)
  }))
    .filter(s => s.score > 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)

  return { candidates: scored.map(s => s.patient) }
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log('📂 Loading patients...')
  const { data: patients } = await supabase
    .from('patients')
    .select('id, cedula, nombre, apellido, celular')

  if (!patients) {
    console.error('Failed to load patients')
    return
  }

  console.log(`   Loaded ${patients.length} patients`)

  console.log('\n📅 Scanning future appointments...')
  const files = fs.readdirSync(CALENDAR_DIR)

  const appointments: Appointment[] = []

  for (const file of files) {
    const event = parseIcsFile(path.join(CALENDAR_DIR, file))
    if (!event || !event.dtstart || event.dtstart < CUTOFF_DATE) continue

    const nombreExtraido = extractPatientName(event.summary)
    const { exact, candidates } = findMatches(nombreExtraido, patients)

    appointments.push({
      fecha: event.dtstart,
      summary: event.summary,
      nombreExtraido,
      patient: exact,
      candidates: exact ? undefined : candidates,
      matchType: exact ? 'exact' : (candidates.length > 0 ? 'probable' : 'none')
    })
  }

  appointments.sort((a, b) => a.fecha.getTime() - b.fecha.getTime())

  // Summary
  const exact = appointments.filter(a => a.matchType === 'exact')
  const probable = appointments.filter(a => a.matchType === 'probable')
  const none = appointments.filter(a => a.matchType === 'none')

  console.log(`\n📊 RESUMEN:`)
  console.log(`   Total citas futuras: ${appointments.length}`)
  console.log(`   ✅ Match exacto: ${exact.length}`)
  console.log(`   🔶 Candidatos probables: ${probable.length}`)
  console.log(`   ❌ Sin candidatos: ${none.length}`)

  // Export exact matches
  console.log('\n\n' + '='.repeat(100))
  console.log('✅ MATCHES EXACTOS (se asignarán automáticamente):')
  console.log('='.repeat(100))

  for (const apt of exact) {
    const fecha = apt.fecha.toLocaleDateString('es-CO')
    const hora = apt.fecha.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' })
    console.log(`${fecha} ${hora} | ${apt.nombreExtraido.padEnd(35)} → ${apt.patient!.nombre} ${apt.patient!.apellido} (${apt.patient!.cedula})`)
  }

  // Export probable matches for review
  console.log('\n\n' + '='.repeat(100))
  console.log('🔶 NECESITAN REVISIÓN (candidatos probables):')
  console.log('='.repeat(100))

  const reviewData: any[] = []

  for (const apt of probable) {
    const fecha = apt.fecha.toLocaleDateString('es-CO')
    const hora = apt.fecha.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' })

    console.log(`\n📅 ${fecha} ${hora}`)
    console.log(`   Summary: ${apt.summary}`)
    console.log(`   Nombre extraído: ${apt.nombreExtraido}`)
    console.log(`   Candidatos:`)

    apt.candidates!.forEach((c, i) => {
      console.log(`     ${i + 1}. ${c.nombre} ${c.apellido} (${c.cedula}) - Tel: ${c.celular}`)
    })

    reviewData.push({
      fecha: apt.fecha.toISOString(),
      summary: apt.summary,
      nombre_extraido: apt.nombreExtraido,
      candidatos: apt.candidates!.map((c, i) => `${i + 1}:${c.nombre} ${c.apellido} (${c.cedula})`).join(' | ')
    })
  }

  // Export none matches
  console.log('\n\n' + '='.repeat(100))
  console.log('❌ SIN CANDIDATOS (necesitan búsqueda manual o crear paciente):')
  console.log('='.repeat(100))

  for (const apt of none) {
    const fecha = apt.fecha.toLocaleDateString('es-CO')
    const hora = apt.fecha.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' })
    console.log(`${fecha} ${hora} | ${apt.nombreExtraido || '(vacío)'} | ${apt.summary.substring(0, 60)}...`)
  }

  // Save to JSON for next step
  const outputPath = '/mnt/c/Users/Usuario/Proyectos/varix-clinic/scripts/appointments-to-review.json'
  fs.writeFileSync(outputPath, JSON.stringify({
    exact: exact.map(a => ({
      fecha: a.fecha.toISOString(),
      summary: a.summary,
      patient_id: a.patient!.id,
      patient_name: `${a.patient!.nombre} ${a.patient!.apellido}`
    })),
    probable: probable.map(a => ({
      fecha: a.fecha.toISOString(),
      summary: a.summary,
      nombre_extraido: a.nombreExtraido,
      candidates: a.candidates!.map(c => ({
        id: c.id,
        nombre: `${c.nombre} ${c.apellido}`,
        cedula: c.cedula
      }))
    })),
    none: none.map(a => ({
      fecha: a.fecha.toISOString(),
      summary: a.summary,
      nombre_extraido: a.nombreExtraido
    }))
  }, null, 2))

  console.log(`\n📄 Datos guardados en: ${outputPath}`)
  console.log('\nPróximo paso: Revisar los candidatos probables y confirmar.')
}

main().catch(console.error)

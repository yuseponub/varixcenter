/**
 * Preview: Citas de mañana en adelante
 * Muestra las citas que se subirían y a qué paciente se asignarían
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

const CALENDAR_DIR = '/tmp/outlook_export/calendar_output/Archivo de datos de Outlook/Calendario/Mi calendario'
const CUTOFF_DATE = new Date('2026-01-29T00:00:00-05:00')

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

    const summary = summaryMatch[1].trim()
    const dtstart = parseIcsDate(dtstartMatch[1])
    const dtend = dtendMatch ? parseIcsDate(dtendMatch[1]) : null

    return { summary, dtstart, dtend }
  } catch {
    return null
  }
}

function parseIcsDate(dateStr: string): Date | null {
  const match = dateStr.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/)
  if (!match) return null
  const [, year, month, day, hour, min, sec] = match
  const isUtc = dateStr.endsWith('Z')
  if (isUtc) {
    return new Date(Date.UTC(+year, +month - 1, +day, +hour, +min, +sec))
  }
  return new Date(+year, +month - 1, +day, +hour, +min, +sec)
}

// ============================================
// NAME EXTRACTION
// ============================================

function extractPatientName(summary: string): string {
  let cleaned = summary
    .replace(/^\s*\d{1,2}[\s.:]+\d{2}\s*/i, '')
    .replace(/^\s*\d{1,2}\s*[.:]\s*\d{2}\s*/i, '')
    .replace(/^\s*\d{3}\s+/i, '')

  cleaned = cleaned
    .replace(/\s*(TEL|CEL|CELL|TELEFONO)[\s.:]*[\d\s\-\(\)\+]+/gi, '')
    .replace(/\s*\d{7,}/g, '')
    .replace(/\s*\d{3}[\s\-]+\d{3,4}[\s\-]+\d{3,4}/g, '')
    .replace(/\s*\+\d[\s\d\-\(\)]+/g, '')
    .replace(/\s*\d+\s*(SESION|SESIONES|SES|VEZ)\b/gi, '')
    .replace(/\s*(INI|INICIO|REVISION|REV|OK|CONFIRMAD[AO]?)\b/gi, '')
    .replace(/\s*(ECOR|FLEBECTOMIA|ESCLEROTERAPIA|LASER|DUPLEX|SCANEO)\b/gi, '')
    .replace(/\s*(DR|DRA|DOCTOR|DOCTORA)\.?\s*(REY|CIRO|CAROLINA|MARIO)?\.*/gi, '')
    .replace(/\s*\/\/.*$/g, '')
    .replace(/\s*OJO\b.*$/gi, '')
    .replace(/\s*EXT\b.*$/gi, '')
    .replace(/\s*FAVOR\b.*$/gi, '')
    .trim()

  const words = cleaned.split(/\s+/).filter(w => w.length > 1)
  const nameWords = words.slice(0, 4).filter(w => !/^\d+$/.test(w))
  return nameWords.join(' ').toUpperCase()
}

function normalizeForSearch(name: string): string {
  return name
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z\s]/g, '')
    .trim()
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log('📂 Loading patients...')
  const { data: patients } = await supabase.from('patients').select('id, cedula, nombre, apellido')

  const patientMap = new Map<string, { id: string; cedula: string; nombre: string; apellido: string }>()
  for (const p of patients || []) {
    const fullName = normalizeForSearch(`${p.nombre} ${p.apellido}`)
    patientMap.set(fullName, p)
    const reverseName = normalizeForSearch(`${p.apellido} ${p.nombre}`)
    if (!patientMap.has(reverseName)) patientMap.set(reverseName, p)
  }

  function findPatient(name: string) {
    const normalized = normalizeForSearch(name)
    if (!normalized) return null

    const exact = patientMap.get(normalized)
    if (exact) return exact

    for (const [key, patient] of patientMap) {
      if (key.includes(normalized) || normalized.includes(key)) return patient
    }

    const searchWords = normalized.split(/\s+/)
    for (const [key, patient] of patientMap) {
      const keyWords = key.split(/\s+/)
      const matches = searchWords.filter(w => keyWords.some(kw => kw.includes(w) || w.includes(kw)))
      if (matches.length >= 2) return patient
    }
    return null
  }

  console.log('📅 Scanning calendar for future appointments...\n')

  const files = fs.readdirSync(CALENDAR_DIR)
  const futureAppointments: any[] = []

  for (const file of files) {
    const event = parseIcsFile(path.join(CALENDAR_DIR, file))
    if (!event || !event.dtstart || event.dtstart < CUTOFF_DATE) continue

    const patientName = extractPatientName(event.summary)
    const patient = findPatient(patientName)

    futureAppointments.push({
      fecha: event.dtstart,
      summary: event.summary,
      nombre_extraido: patientName,
      paciente_encontrado: patient ? `${patient.nombre} ${patient.apellido} (${patient.cedula})` : '❌ NO ENCONTRADO',
      patient_id: patient?.id || null
    })
  }

  // Sort by date
  futureAppointments.sort((a, b) => a.fecha.getTime() - b.fecha.getTime())

  console.log(`\n📋 CITAS DE MAÑANA (${CUTOFF_DATE.toLocaleDateString()}) EN ADELANTE:\n`)
  console.log('='.repeat(120))

  let currentDate = ''
  let found = 0
  let notFound = 0

  for (const apt of futureAppointments) {
    const dateStr = apt.fecha.toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

    if (dateStr !== currentDate) {
      currentDate = dateStr
      console.log(`\n📆 ${dateStr.toUpperCase()}`)
      console.log('-'.repeat(80))
    }

    const time = apt.fecha.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
    const status = apt.patient_id ? '✅' : '❌'

    if (apt.patient_id) found++
    else notFound++

    console.log(`${status} ${time} | ${apt.nombre_extraido.padEnd(35)} → ${apt.paciente_encontrado}`)
  }

  console.log('\n' + '='.repeat(120))
  console.log(`\n📊 RESUMEN:`)
  console.log(`   Total citas futuras: ${futureAppointments.length}`)
  console.log(`   ✅ Con paciente encontrado: ${found}`)
  console.log(`   ❌ Sin paciente: ${notFound}`)

  // Export to CSV for review
  const csvPath = '/mnt/c/Users/Usuario/Proyectos/varix-clinic/scripts/preview-citas-futuras.csv'
  const csvContent = [
    'Fecha,Hora,Summary Original,Nombre Extraido,Paciente Encontrado,Patient ID',
    ...futureAppointments.map(a =>
      `"${a.fecha.toISOString()}","${a.fecha.toLocaleTimeString('es-CO')}","${a.summary.replace(/"/g, '""')}","${a.nombre_extraido}","${a.paciente_encontrado}","${a.patient_id || ''}"`
    )
  ].join('\n')

  fs.writeFileSync(csvPath, csvContent)
  console.log(`\n📄 CSV exportado: ${csvPath}`)
}

main().catch(console.error)

/**
 * Matching fonético de citas con pacientes
 * - Normaliza variaciones fonéticas (S/C/Z, B/V, Y/I, etc.)
 * - Busca por partes del nombre
 * - Extrae teléfono y cédula del summary si está disponible
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface Patient {
  id: string
  cedula: string
  nombre: string
  apellido: string
  celular: string
}

// Normalización fonética para español
function normalizeFonetico(str: string): string {
  return str
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quitar acentos
    .replace(/Ñ/g, 'N')
    .replace(/[ÁÀÄÂ]/g, 'A')
    .replace(/[ÉÈËÊ]/g, 'E')
    .replace(/[ÍÌÏÎ]/g, 'I')
    .replace(/[ÓÒÖÔ]/g, 'O')
    .replace(/[ÚÙÜÛ]/g, 'U')
    .replace(/V/g, 'B')      // V → B
    .replace(/Z/g, 'S')      // Z → S
    .replace(/C(?=[EI])/g, 'S') // CE, CI → SE, SI
    .replace(/Y(?![AEIOU])/g, 'I') // Y consonante → I
    .replace(/LL/g, 'Y')     // LL → Y
    .replace(/H/g, '')       // H muda
    .replace(/[^A-Z\s]/g, '')
    .trim()
}

// Extraer teléfono del summary
function extractPhone(summary: string): string | null {
  // Patrones: CEL 300.417.5915, CEL. 316.484.1566, cel 318 6069455
  const match = summary.match(/(?:CEL|TEL)[\s.:]*(\d[\d\s.\-]+\d)/i)
  if (match) {
    return match[1].replace(/[\s.\-]/g, '')
  }
  return null
}

// Extraer cédula del summary
function extractCedula(summary: string): string | null {
  // Patrón: CC. 63.536.236 o CC 63536236
  const match = summary.match(/CC[\s.:]*(\d[\d\s.]+\d)/i)
  if (match) {
    return match[1].replace(/[\s.]/g, '')
  }
  return null
}

// Mejorar extracción de nombre
function extractName(summary: string): string {
  let cleaned = summary
    // Quitar hora al inicio
    .replace(/^\s*\d{1,2}[\s.:,]+\d{0,2}\s*/i, '')
    .replace(/^\s*\d{1,4}\s+/i, '')
    // Quitar teléfonos
    .replace(/\s*(CEL|TEL)[\s.:]*[\d\s.\-()]+.*/gi, '')
    // Quitar cédulas
    .replace(/\s*CC[\s.:]*[\d\s.]+.*/gi, '')
    // Quitar palabras clave al final
    .replace(/\s*\d+\s*(SESION|SESIONES|SES)\b.*/gi, '')
    .replace(/\s*(VEZ|VECES)\b.*/gi, '')
    .replace(/\s*(CONTROL|REVISION|RESIDUOS?|RETIRO|ECOR|VSI|LOCION)\b.*/gi, '')
    .replace(/\s*(FLEBECTOMIA|ESCLEROTERAPIA|LASER|DUPLEX|TROMBOS|MEDIA)\b.*/gi, '')
    .replace(/\s*(DR|DRA|DOCTOR|DOCTORA)\.?\s*$/gi, '')
    .replace(/\s*(CONFIRMAR|OJO)\b.*/gi, '')
    .trim()

  // Tomar solo palabras válidas (no números solos, no letras sueltas)
  const words = cleaned
    .split(/\s+/)
    .filter(w => w.length > 1 && !/^\d+$/.test(w))
    .slice(0, 5)

  return words.join(' ').toUpperCase()
}

// Calcular similitud entre dos nombres
function similarity(name1: string, name2: string): number {
  const norm1 = normalizeFonetico(name1)
  const norm2 = normalizeFonetico(name2)

  const words1 = norm1.split(/\s+/).filter(w => w.length > 2)
  const words2 = norm2.split(/\s+/).filter(w => w.length > 2)

  if (words1.length === 0 || words2.length === 0) return 0

  let matchedWords1 = 0
  let matchedWords2 = 0

  for (const w1 of words1) {
    let bestMatchScore = 0
    for (const w2 of words2) {
      if (w1 === w2) {
        bestMatchScore = Math.max(bestMatchScore, 1.0)
      } else if (w1.startsWith(w2) || w2.startsWith(w1)) {
        // Prefijo común (ej: PABON vs PABONPATARROYO)
        const minLen = Math.min(w1.length, w2.length)
        bestMatchScore = Math.max(bestMatchScore, minLen >= 4 ? 0.9 : 0.7)
      } else if (levenshteinDistance(w1, w2) <= 2) {
        // Distancia de edición pequeña (errores tipográficos)
        bestMatchScore = Math.max(bestMatchScore, 0.8)
      }
    }
    if (bestMatchScore > 0.5) matchedWords1++
  }

  for (const w2 of words2) {
    let bestMatchScore = 0
    for (const w1 of words1) {
      if (w1 === w2) {
        bestMatchScore = Math.max(bestMatchScore, 1.0)
      } else if (w1.startsWith(w2) || w2.startsWith(w1)) {
        const minLen = Math.min(w1.length, w2.length)
        bestMatchScore = Math.max(bestMatchScore, minLen >= 4 ? 0.9 : 0.7)
      } else if (levenshteinDistance(w1, w2) <= 2) {
        bestMatchScore = Math.max(bestMatchScore, 0.8)
      }
    }
    if (bestMatchScore > 0.5) matchedWords2++
  }

  // Score basado en cuántas palabras del nombre de la cita coinciden con el paciente
  const coverage1 = matchedWords1 / words1.length // % de palabras de la cita que coinciden
  const coverage2 = matchedWords2 / words2.length // % de palabras del paciente que coinciden

  // Priorizar que todas las palabras de la cita estén en el paciente
  return coverage1 * 0.7 + coverage2 * 0.3
}

// Distancia de Levenshtein
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = []
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        )
      }
    }
  }
  return matrix[b.length][a.length]
}

async function main() {
  console.log('Cargando pacientes...')

  // Cargar TODOS los pacientes (paginado)
  let patients: Patient[] = []
  let from = 0
  const pageSize = 1000

  while (true) {
    const { data, error } = await supabase
      .from('patients')
      .select('id, cedula, nombre, apellido, celular')
      .range(from, from + pageSize - 1)

    if (error || !data || data.length === 0) break
    patients = patients.concat(data)
    from += pageSize
    if (data.length < pageSize) break
  }

  if (patients.length === 0) {
    console.error('No se pudieron cargar pacientes')
    return
  }
  console.log(`Cargados ${patients.length} pacientes\n`)

  // Cargar citas
  const data = JSON.parse(fs.readFileSync('scripts/appointments-to-review.json', 'utf-8'))

  const results: any[] = []
  let matched = 0
  let notFound = 0
  let multiple = 0

  // Procesar probable + none
  const toProcess = [...(data.probable || []), ...(data.none || [])]

  console.log(`Procesando ${toProcess.length} citas...\n`)
  console.log('='.repeat(100))

  for (const cita of toProcess) {
    const summary = cita.summary || ''
    const nombreOriginal = cita.nombre_extraido || extractName(summary)
    const phone = extractPhone(summary)
    const cedula = extractCedula(summary)

    if (!nombreOriginal || nombreOriginal.length < 3) {
      // Cita sin nombre válido, saltar
      continue
    }

    let bestMatch: Patient | null = null
    let bestScore = 0
    let candidates: Patient[] = []

    // 1. Primero buscar por cédula si existe
    if (cedula) {
      const byCC = patients.find(p => p.cedula === cedula)
      if (byCC) {
        bestMatch = byCC
        bestScore = 1.0
      }
    }

    // 2. Buscar por teléfono si existe
    if (!bestMatch && phone) {
      const byPhone = patients.find(p => p.celular?.replace(/\D/g, '') === phone)
      if (byPhone) {
        bestMatch = byPhone
        bestScore = 0.95
      }
    }

    // 3. Buscar por nombre fonético
    if (!bestMatch) {
      const scored = patients.map(p => ({
        patient: p,
        score: similarity(nombreOriginal, `${p.nombre} ${p.apellido}`)
      }))
      .filter(s => s.score > 0.35)
      .sort((a, b) => b.score - a.score)

      if (scored.length > 0) {
        // Si el mejor tiene score >= 0.7 y es significativamente mejor que el segundo
        if (scored[0].score >= 0.7 && (scored.length === 1 || scored[0].score - scored[1].score > 0.15)) {
          bestMatch = scored[0].patient
          bestScore = scored[0].score
        } else {
          // Múltiples candidatos - mostrar los mejores 5
          candidates = scored.slice(0, 5).map(s => s.patient)
        }
      }
    }

    // Resultado
    const result: any = {
      fecha: cita.fecha,
      summary: summary.substring(0, 80),
      nombreExtraido: nombreOriginal,
      phone,
      cedula
    }

    if (bestMatch) {
      result.patient = bestMatch
      result.status = 'matched'
      result.score = bestScore
      matched++
      console.log(`✅ ${nombreOriginal.padEnd(35)} → ${bestMatch.nombre} ${bestMatch.apellido} (${bestMatch.cedula})`)
    } else if (candidates.length > 0) {
      result.candidates = candidates
      result.status = 'multiple'
      multiple++
      console.log(`🔶 ${nombreOriginal.padEnd(35)} → ${candidates.length} candidatos`)
      candidates.forEach((c, i) => console.log(`      ${i+1}. ${c.nombre} ${c.apellido} (${c.cedula})`))
    } else {
      result.status = 'not_found'
      notFound++
      console.log(`❌ ${nombreOriginal.padEnd(35)} → NO ENCONTRADO`)
    }

    results.push(result)
  }

  console.log('\n' + '='.repeat(100))
  console.log(`\nRESUMEN:`)
  console.log(`  ✅ Matched: ${matched}`)
  console.log(`  🔶 Múltiples: ${multiple}`)
  console.log(`  ❌ No encontrados: ${notFound}`)
  console.log(`  📊 Total procesados: ${results.length}`)

  // Guardar resultados
  fs.writeFileSync(
    'scripts/citas-matched-fonetico.json',
    JSON.stringify(results, null, 2)
  )
  console.log(`\nResultados guardados en scripts/citas-matched-fonetico.json`)

  // Mostrar no encontrados para revisión manual
  console.log('\n\n=== NO ENCONTRADOS (revisión manual) ===')
  results
    .filter(r => r.status === 'not_found')
    .forEach(r => console.log(`${r.nombreExtraido} | ${r.summary}`))
}

main().catch(console.error)

/**
 * Migration script: patient_legacy_records → medical_records
 *
 * Transforms ~13,972 legacy Access records into medical_records
 * so they appear in /historias with the same format as digital records.
 *
 * Prerequisites:
 *   - Migration 048_medical_records_legacy_support.sql applied
 *   - patient_legacy_records already populated (via migrate-access-data.ts)
 *
 * Run: npx tsx scripts/migrate-legacy-to-medical-records.ts
 */

import { createClient } from '@supabase/supabase-js'

// ============================================
// CONFIGURATION
// ============================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing environment variables: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

const BATCH_SIZE = 50

// ============================================
// TYPES
// ============================================

interface LegacyRecord {
  id: string
  patient_id: string
  nombre_medico: string | null
  observaciones: string | null
  observaciones_alerta: string | null
  medicamentos: string | null
  grado_varices: string | null
  tiempo_evolucion: string | null
  fecha_ingreso_original: string | null
  antecedentes: {
    familiares?: boolean
    diabetes?: boolean
    hospitalizacion?: boolean
    cirugia?: boolean
    hepatitis?: boolean
    hipertension?: boolean
    transfusiones?: boolean
    alergia?: boolean
    farmacologico?: boolean
    adolescencia?: boolean
    embarazo?: boolean
    planificacion?: boolean
    trauma?: boolean
    posquirurgico?: boolean
  }
  sintomas: {
    dolor?: boolean
    dolor_ciclo?: boolean
    cansancio?: boolean
    calambres?: boolean
    adormecimiento?: boolean
    prurito?: boolean
    ardor?: boolean
    lipodermatoesclerosis?: boolean
    edema?: boolean
    ulcera?: boolean
    eczema?: boolean
  }
  examenes: {
    mapeo_dupplex?: boolean
    escaneo_dupplex?: boolean
    fotopletismografia?: boolean
    mapeo_v_dupplex_valor?: number | null
    fotopletismografia_valor?: number | null
    escaneo_dupplex_valor?: number | null
    doppler_valor?: number | null
  }
  diagnosticos: Array<{
    tipo?: string
    fecha?: string | null
    diagnostico?: string | null
    observacion?: string | null
    observacion_terapeutica?: string | null
    observacion_sin_laser?: string | null
    preliminar?: string | null
  }>
}

interface Doctor {
  id: string
  nombre: string | null
  apellido: string | null
}

// ============================================
// DOCTOR NAME RESOLUTION
// ============================================

function buildDoctorMap(doctors: Doctor[]): Map<string, string> {
  const map = new Map<string, string>()

  for (const doc of doctors) {
    if (!doc.nombre) continue

    // Full name normalized: "ciro mario gonzalez" → UUID
    const fullName = `${doc.nombre} ${doc.apellido || ''}`.trim().toLowerCase()
    map.set(fullName, doc.id)

    // First name only: "ciro" → UUID (lower priority, set only if not already set)
    const firstName = doc.nombre.trim().toLowerCase()
    if (!map.has(firstName)) {
      map.set(firstName, doc.id)
    }

    // First + second name: "ciro mario" → UUID
    const names = doc.nombre.trim().toLowerCase().split(/\s+/)
    if (names.length >= 2) {
      const twoNames = names.slice(0, 2).join(' ')
      if (!map.has(twoNames)) {
        map.set(twoNames, doc.id)
      }
    }
  }

  return map
}

function resolveDoctorId(nombreMedico: string | null, doctorMap: Map<string, string>): string | null {
  if (!nombreMedico) return null

  const normalized = nombreMedico.trim().toLowerCase()
  if (!normalized) return null

  // Try exact match first
  if (doctorMap.has(normalized)) {
    return doctorMap.get(normalized)!
  }

  // Try partial match - check if any key is contained in the legacy name or vice versa
  for (const [key, id] of doctorMap) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return id
    }
  }

  return null
}

// ============================================
// FIELD MAPPING
// ============================================

function mapSintomas(legacy: LegacyRecord) {
  const s = legacy.sintomas || {}
  const otros: string[] = []

  if (s.dolor_ciclo) otros.push('Dolor asociado al ciclo menstrual')
  if (s.adormecimiento) otros.push('Adormecimiento')

  return {
    dolor: s.dolor || false,
    cansancio: s.cansancio || false,
    calambres: s.calambres || false,
    prurito: s.prurito || false,
    ardor: s.ardor || false,
    otros: otros.length > 0 ? otros.join(', ') : undefined,
    tiempo_evolucion: legacy.tiempo_evolucion || undefined,
  }
}

function mapSignos(legacy: LegacyRecord) {
  const s = legacy.sintomas || {}
  const otros: string[] = []

  if (s.eczema) otros.push('Eczema')

  return {
    edema: s.edema || false,
    ulcera_activa: s.ulcera || false,
    lipodermatoesclerosis: s.lipodermatoesclerosis || false,
    otros: otros.length > 0 ? otros.join(', ') : undefined,
  }
}

function mapInicioRelacionado(legacy: LegacyRecord) {
  const a = legacy.antecedentes || {}
  const otros: string[] = []

  if (a.adolescencia) otros.push('Inicio en adolescencia')

  return {
    embarazo: a.embarazo || false,
    trauma: a.trauma || false,
    anticonceptivos: a.planificacion || false,
    cirugia_previa: a.posquirurgico || false,
    otros: otros.length > 0 ? otros.join(', ') : undefined,
  }
}

function mapAntecedentes(legacy: LegacyRecord) {
  const a = legacy.antecedentes || {}
  const otros: string[] = []

  if (a.familiares) otros.push('Antecedentes familiares')
  if (a.hospitalizacion) otros.push('Hospitalizacion')
  if (a.hepatitis) otros.push('Hepatitis')
  if (a.transfusiones) otros.push('Transfusiones')
  if (a.farmacologico) otros.push('Antecedentes farmacologicos')

  // Combine observaciones
  const obsArray: string[] = []
  if (legacy.observaciones) obsArray.push(legacy.observaciones)
  if (legacy.observaciones_alerta) obsArray.push(`[ALERTA] ${legacy.observaciones_alerta}`)

  return {
    hipertension: a.hipertension || false,
    diabetes: a.diabetes || false,
    cirugia_vascular: a.cirugia || false,
    alergias: a.alergia || false,
    otros: otros.length > 0 ? otros.join(', ') : undefined,
    observaciones: obsArray.length > 0 ? obsArray.join('\n') : undefined,
  }
}

function mapLaboratorioVascular(legacy: LegacyRecord) {
  const e = legacy.examenes || {}

  // Build hallazgos from numeric values
  const hallazgos: string[] = []
  if (e.mapeo_v_dupplex_valor != null) hallazgos.push(`Mapeo Dupplex: ${e.mapeo_v_dupplex_valor}`)
  if (e.escaneo_dupplex_valor != null) hallazgos.push(`Escaneo Dupplex: ${e.escaneo_dupplex_valor}`)
  if (e.fotopletismografia_valor != null) hallazgos.push(`Fotopletismografia: ${e.fotopletismografia_valor}`)
  if (e.doppler_valor != null) hallazgos.push(`Doppler: ${e.doppler_valor}`)

  return {
    doppler_venoso: e.mapeo_dupplex || false,
    doppler_arterial: e.escaneo_dupplex || false,
    fotopletismografia: e.fotopletismografia || false,
    hallazgos: hallazgos.length > 0 ? hallazgos.join('\n') : undefined,
  }
}

function mapDiagnostico(legacy: LegacyRecord): string | null {
  const diags = legacy.diagnosticos || []
  if (diags.length === 0) return null

  const parts = diags
    .map(d => {
      const datePart = d.fecha ? `[${new Date(d.fecha).toLocaleDateString('es-CO')}]` : ''
      const tipoPart = d.tipo ? `(${d.tipo})` : ''
      const textParts: string[] = []

      if (d.diagnostico) textParts.push(d.diagnostico)
      if (d.observacion) textParts.push(`Obs: ${d.observacion}`)
      if (d.observacion_terapeutica) textParts.push(`Obs. terapeutica: ${d.observacion_terapeutica}`)
      if (d.observacion_sin_laser) textParts.push(`Obs. sin laser: ${d.observacion_sin_laser}`)
      if (d.preliminar) textParts.push(`Preliminar: ${d.preliminar}`)

      if (textParts.length === 0) return null

      return `${datePart} ${tipoPart} ${textParts.join(' | ')}`.trim()
    })
    .filter(Boolean)

  return parts.length > 0 ? parts.join('\n') : null
}

function mapCeap(gradoVarices: string | null): string | null {
  if (!gradoVarices) return null

  const normalized = gradoVarices.trim().toUpperCase()

  // Try to map G-1 → C1, G-2 → C2, etc.
  const match = normalized.match(/G[-\s]*(\d)/)
  if (match) {
    const num = parseInt(match[1])
    if (num >= 0 && num <= 6) return `C${num}`
  }

  // Try direct C notation
  const cMatch = normalized.match(/^C(\d)$/)
  if (cMatch) {
    const num = parseInt(cMatch[1])
    if (num >= 0 && num <= 6) return `C${num}`
  }

  return null
}

// ============================================
// MAIN MIGRATION
// ============================================

async function main() {
  console.log('Starting legacy → medical_records migration')
  console.log('='.repeat(50))

  // Step 1: Fetch doctors for name resolution
  console.log('\nFetching doctors for name resolution...')
  const { data: doctors, error: doctorsError } = await supabase
    .from('doctors_view')
    .select('id, nombre, apellido')

  if (doctorsError) {
    console.error('Failed to fetch doctors:', doctorsError.message)
    process.exit(1)
  }

  const doctorMap = buildDoctorMap(doctors || [])
  console.log(`  Loaded ${doctors?.length || 0} doctors, ${doctorMap.size} name variants`)

  // Step 2: Fetch all legacy records
  console.log('\nFetching legacy records...')
  let allLegacy: LegacyRecord[] = []
  let offset = 0
  const pageSize = 1000

  while (true) {
    const { data, error } = await supabase
      .from('patient_legacy_records')
      .select('id, patient_id, nombre_medico, observaciones, observaciones_alerta, medicamentos, grado_varices, tiempo_evolucion, fecha_ingreso_original, antecedentes, sintomas, examenes, diagnosticos')
      .range(offset, offset + pageSize - 1)

    if (error) {
      console.error(`Failed to fetch legacy records at offset ${offset}:`, error.message)
      process.exit(1)
    }

    if (!data || data.length === 0) break

    allLegacy = allLegacy.concat(data as LegacyRecord[])
    offset += pageSize

    if (data.length < pageSize) break
  }

  console.log(`  Found ${allLegacy.length} legacy records`)

  // Step 3: Check which legacy records are already migrated
  console.log('\nChecking for already-migrated records...')
  const { data: existingRecords, error: existingError } = await supabase
    .from('medical_records')
    .select('legacy_record_id')
    .eq('source', 'legacy_access')
    .not('legacy_record_id', 'is', null)

  if (existingError) {
    console.error('Failed to check existing records:', existingError.message)
    process.exit(1)
  }

  const alreadyMigrated = new Set(
    (existingRecords || []).map((r: { legacy_record_id: string }) => r.legacy_record_id)
  )
  console.log(`  Already migrated: ${alreadyMigrated.size} records`)

  // Step 4: Transform and insert
  console.log('\nTransforming and inserting...')
  let inserted = 0
  let skipped = 0
  let errors = 0
  let doctorResolved = 0
  let doctorUnresolved = 0

  const toInsert: any[] = []

  for (const legacy of allLegacy) {
    // Idempotency check
    if (alreadyMigrated.has(legacy.id)) {
      skipped++
      continue
    }

    // Resolve doctor
    const doctorId = resolveDoctorId(legacy.nombre_medico, doctorMap)
    if (doctorId) {
      doctorResolved++
    } else if (legacy.nombre_medico) {
      doctorUnresolved++
    }

    // Map CEAP
    const ceap = mapCeap(legacy.grado_varices)

    // Build medical record
    const record = {
      patient_id: legacy.patient_id,
      appointment_id: null,
      doctor_id: doctorId,
      sintomas: mapSintomas(legacy),
      signos: mapSignos(legacy),
      inicio_relacionado: mapInicioRelacionado(legacy),
      antecedentes: mapAntecedentes(legacy),
      laboratorio_vascular: mapLaboratorioVascular(legacy),
      diagnostico: mapDiagnostico(legacy),
      ceap_pierna_izquierda: ceap,
      ceap_pierna_derecha: null,
      tratamiento_ids: [],
      estado: 'completado',
      source: 'legacy_access',
      legacy_record_id: legacy.id,
      nombre_medico_legacy: legacy.nombre_medico || null,
      medicamentos: legacy.medicamentos || null,
      created_at: legacy.fecha_ingreso_original || new Date().toISOString(),
    }

    toInsert.push(record)
  }

  console.log(`  Records to insert: ${toInsert.length}`)
  console.log(`  Skipped (already migrated): ${skipped}`)
  console.log(`  Doctor resolved: ${doctorResolved}`)
  console.log(`  Doctor unresolved: ${doctorUnresolved}`)

  // Insert in batches
  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE)

    const { error } = await supabase
      .from('medical_records')
      .insert(batch)

    if (error) {
      console.error(`  Batch error at ${i}:`, error.message)
      if (batch[0]) {
        console.error(`  First record patient_id: ${batch[0].patient_id}`)
      }
      errors += batch.length
      continue
    }

    inserted += batch.length

    if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= toInsert.length) {
      console.log(`  Progress: ${Math.min(i + BATCH_SIZE, toInsert.length)}/${toInsert.length}`)
    }
  }

  // Summary
  console.log('\n' + '='.repeat(50))
  console.log('Migration complete!')
  console.log(`  Inserted: ${inserted}`)
  console.log(`  Skipped: ${skipped}`)
  console.log(`  Errors: ${errors}`)
  console.log(`  Doctor resolved: ${doctorResolved}/${doctorResolved + doctorUnresolved}`)
}

main().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})

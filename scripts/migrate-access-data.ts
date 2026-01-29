/**
 * Migration script: Access database → Supabase
 *
 * Migrates ALL data from Access:
 * - PACIENTES → patients (datos básicos) + patient_legacy_records (TODO lo demás)
 * - PLAN CIRUGIA → patient_legacy_records
 * - PLAN COSTOS → patient_legacy_records
 *
 * Run: npx tsx scripts/migrate-access-data.ts
 */

import { createClient } from '@supabase/supabase-js'
import { parse } from 'csv-parse/sync'
import * as fs from 'fs'
import * as path from 'path'

// ============================================
// CONFIGURATION
// ============================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing environment variables: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

const SCRIPTS_DIR = path.dirname(new URL(import.meta.url).pathname)
const PACIENTES_CSV = path.join(SCRIPTS_DIR, 'pacientes_access.csv')
const PLAN_CIRUGIA_CSV = path.join(SCRIPTS_DIR, 'plan_cirugia.csv')
const PLAN_COSTOS_CSV = path.join(SCRIPTS_DIR, 'plan_costos.csv')

// Batch size for inserts
const BATCH_SIZE = 50

// ============================================
// NORMALIZATION FUNCTIONS
// ============================================

/**
 * Normaliza nombres: "LUZ STELLA" → "Luz Stella"
 */
function normalizeName(name: string | null | undefined): string {
  if (!name) return ''

  return name
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map(word => {
      if (!word) return ''
      // Preposiciones y artículos en minúscula
      const lowercase = ['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e']
      if (lowercase.includes(word)) return word
      // Primera letra mayúscula
      return word.charAt(0).toUpperCase() + word.slice(1)
    })
    .join(' ')
}

/**
 * Normaliza direcciones: limpia espacios extras, expande abreviaturas
 */
function normalizeAddress(address: string | null | undefined): string {
  if (!address) return ''

  return address
    .trim()
    // Normalizar abreviaturas comunes
    .replace(/\bCLL\b/gi, 'Calle')
    .replace(/\bCL\b/gi, 'Calle')
    .replace(/\bCR\b/gi, 'Carrera')
    .replace(/\bCRA\b/gi, 'Carrera')
    .replace(/\bKR\b/gi, 'Carrera')
    .replace(/\bAV\b/gi, 'Avenida')
    .replace(/\bTRV\b/gi, 'Transversal')
    .replace(/\bDG\b/gi, 'Diagonal')
    .replace(/\bBRR\b/gi, 'Barrio')
    .replace(/\bURB\b/gi, 'Urbanización')
    .replace(/\bMZ\b/gi, 'Manzana')
    .replace(/\bLT\b/gi, 'Lote')
    .replace(/\bAPTO?\b/gi, 'Apartamento')
    .replace(/\bEDF?\b/gi, 'Edificio')
    .replace(/\bPISO\b/gi, 'Piso')
    // Limpiar espacios múltiples
    .replace(/\s+/g, ' ')
}

/**
 * Normaliza teléfono: solo dígitos, máximo 10
 */
function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return ''
  const digits = phone.replace(/\D/g, '')
  // Si empieza con 57 (código Colombia), quitarlo
  if (digits.startsWith('57') && digits.length > 10) {
    return digits.slice(2, 12)
  }
  return digits.slice(0, 10)
}

/**
 * Normaliza cédula: solo dígitos, 6-10 caracteres
 */
function normalizeCedula(cedula: string | number | null | undefined): string | null {
  if (cedula === null || cedula === undefined) return null
  const digits = String(cedula).replace(/\D/g, '')
  if (digits.length < 6 || digits.length > 10) return null
  return digits
}

/**
 * Parsea fecha de Access: "MM/DD/YY HH:MM:SS" → ISO string
 */
function parseAccessDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null

  // Format: "03/24/82 00:00:00" or "12/13/24 00:00:00"
  const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{2})\s/)
  if (!match) return null

  const [, month, day, year] = match
  // Assume 2000s for years < 50, 1900s otherwise
  const fullYear = parseInt(year) < 50 ? 2000 + parseInt(year) : 1900 + parseInt(year)

  const date = new Date(fullYear, parseInt(month) - 1, parseInt(day))
  if (isNaN(date.getTime())) return null

  return date.toISOString()
}

/**
 * Convierte valor de Access a boolean
 */
function boolFromAccess(val: string | undefined): boolean {
  return val === '1' || val === '-1' || val?.toLowerCase() === 'true'
}

/**
 * Convierte valor a número o null
 */
function numFromAccess(val: string | undefined): number | null {
  if (!val) return null
  const num = parseFloat(val)
  return isNaN(num) ? null : num
}

// ============================================
// CSV READING
// ============================================

function readCSV<T extends Record<string, string>>(filePath: string): T[] {
  console.log(`📂 Reading ${path.basename(filePath)}...`)
  const content = fs.readFileSync(filePath, 'utf-8')
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
  }) as T[]
  console.log(`   Found ${records.length} records`)
  return records
}

// ============================================
// MIGRATION FUNCTIONS
// ============================================

async function migratePatients(pacientes: Record<string, string>[]): Promise<Map<string, string>> {
  console.log('\n🔄 Migrating patients to patients table...')

  const cedulaToUUID = new Map<string, string>()
  let inserted = 0
  let skipped = 0
  let errors = 0

  for (let i = 0; i < pacientes.length; i += BATCH_SIZE) {
    const batch = pacientes.slice(i, i + BATCH_SIZE)

    const patientsToInsert = batch
      .map(p => {
        const cedula = normalizeCedula(p.Id)
        if (!cedula) {
          skipped++
          return null
        }

        const celular = normalizePhone(p.TelCelular) || normalizePhone(p.TelFijo)
        if (!celular) {
          skipped++
          return null
        }

        const nombre = normalizeName(p.Nombre)
        const apellido = normalizeName(p.Apellidos)
        if (!nombre || !apellido) {
          skipped++
          return null
        }

        const fechaNacStr = parseAccessDate(p.FechaNacimiento)

        const fechaRegistroStr = parseAccessDate(p.FechaIngreso)

        return {
          cedula,
          nombre,
          apellido,
          celular,
          email: p.email?.trim() || null,
          fecha_nacimiento: fechaNacStr ? fechaNacStr.split('T')[0] : null,
          direccion: normalizeAddress(p.Direccion) || null,
          // Nuevos campos
          ocupacion: normalizeName(p.Ocupacion) || null,
          estado_civil: normalizeName(p.ECivil) || null,
          ciudad: normalizeName(p.Ciudad) || null,
          pais: normalizeName(p.Pais) || 'Colombia',
          fecha_registro: fechaRegistroStr ? fechaRegistroStr.split('T')[0] : null,
          // Campos de emergencia opcionales
          contacto_emergencia_nombre: null,
          contacto_emergencia_telefono: null,
          contacto_emergencia_parentesco: null,
        }
      })
      .filter((p): p is NonNullable<typeof p> => p !== null)

    if (patientsToInsert.length === 0) continue

    const { data, error } = await supabase
      .from('patients')
      .upsert(patientsToInsert, {
        onConflict: 'cedula',
        ignoreDuplicates: true
      })
      .select('id, cedula')

    if (error) {
      console.error(`   ❌ Batch error at ${i}:`, error.message)
      errors += batch.length
      continue
    }

    if (data) {
      for (const patient of data) {
        cedulaToUUID.set(patient.cedula, patient.id)
      }
      inserted += data.length
    }

    if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= pacientes.length) {
      console.log(`   Progress: ${Math.min(i + BATCH_SIZE, pacientes.length)}/${pacientes.length}`)
    }
  }

  // Fetch all patients to complete the mapping
  console.log('   Fetching complete patient mapping...')
  const { data: allPatients } = await supabase
    .from('patients')
    .select('id, cedula')

  if (allPatients) {
    for (const p of allPatients) {
      cedulaToUUID.set(p.cedula, p.id)
    }
  }

  console.log(`   ✅ Inserted: ${inserted}, Skipped: ${skipped}, Errors: ${errors}`)
  console.log(`   📊 Total patients mapped: ${cedulaToUUID.size}`)

  return cedulaToUUID
}

async function migrateLegacyRecords(
  pacientes: Record<string, string>[],
  planCirugia: Record<string, string>[],
  planCostos: Record<string, string>[],
  cedulaToUUID: Map<string, string>
): Promise<void> {
  console.log('\n🔄 Migrating legacy records...')

  // Index PLAN CIRUGIA and PLAN COSTOS by cedula
  const planCirugiaByCedula = new Map<string, Record<string, string>[]>()
  const planCostosByCedula = new Map<string, Record<string, string>[]>()

  for (const pc of planCirugia) {
    const cedula = normalizeCedula(pc.Id)
    if (!cedula) continue
    if (!planCirugiaByCedula.has(cedula)) {
      planCirugiaByCedula.set(cedula, [])
    }
    planCirugiaByCedula.get(cedula)!.push(pc)
  }

  for (const pc of planCostos) {
    const cedula = normalizeCedula(pc.Id)
    if (!cedula) continue
    if (!planCostosByCedula.has(cedula)) {
      planCostosByCedula.set(cedula, [])
    }
    planCostosByCedula.get(cedula)!.push(pc)
  }

  // Build legacy records
  const legacyRecords: any[] = []

  for (const p of pacientes) {
    const cedula = normalizeCedula(p.Id)
    if (!cedula || !cedulaToUUID.has(cedula)) continue

    const patientId = cedulaToUUID.get(cedula)!
    const cirugias = planCirugiaByCedula.get(cedula) || []
    const costos = planCostosByCedula.get(cedula) || []

    // Parse antecedentes
    const antecedentes = {
      familiares: boolFromAccess(p.Familiares),
      diabetes: boolFromAccess(p.Diabetes),
      hospitalizacion: boolFromAccess(p.Hospitalizacion),
      cirugia: boolFromAccess(p.Cirugia),
      hepatitis: boolFromAccess(p.Hepatitis),
      hipertension: boolFromAccess(p.Hipertension),
      transfusiones: boolFromAccess(p.Transfuciones),
      alergia: boolFromAccess(p.Alergia),
      farmacologico: boolFromAccess(p.Farmacologico),
      adolescencia: boolFromAccess(p.Adolescencia),
      embarazo: boolFromAccess(p.Embarazo),
      planificacion: boolFromAccess(p['Planificación']),
      trauma: boolFromAccess(p.Trauma),
      posquirurgico: boolFromAccess(p.Posquirurgico),
      empezo: boolFromAccess(p.Empezo),
      realizo_cirugia: boolFromAccess(p.RealizoCirugia),
      confirmado: boolFromAccess(p.Confirmado),
    }

    // Parse síntomas
    const sintomas = {
      dolor: boolFromAccess(p.Dolor),
      dolor_ciclo: boolFromAccess(p.DolorCiclo),
      cansancio: boolFromAccess(p.Cansancio),
      calambres: boolFromAccess(p.Calambres),
      adormecimiento: boolFromAccess(p.Adormecimiento),
      prurito: boolFromAccess(p.Prurito),
      ardor: boolFromAccess(p.Ardor),
      lipodermatoesclerosis: boolFromAccess(p.Lipodermatoesclerosis),
      edema: boolFromAccess(p.Edema),
      ulcera: boolFromAccess(p.Ulcera),
      eczema: boolFromAccess(p.Eczema),
    }

    // Parse exámenes
    const examenes = {
      mapeo_dupplex: boolFromAccess(p.MapeoDupplex),
      escaneo_dupplex: boolFromAccess(p['Escaneo Dupplex']),
      fotopletismografia: boolFromAccess(p.Fotopletismografia),
      // Valores numéricos
      mapeo_v_dupplex_valor: numFromAccess(p.MapeoVDupplex),
      fotopletismografia_valor: numFromAccess(p.FotopletismografiaL),
      escaneo_dupplex_valor: numFromAccess(p['Val Escaneo Dupplex']),
      doppler_valor: numFromAccess(p.DopplerL),
    }

    // Parse tratamientos
    const tratamientos = {
      escleroterapia_monoterapia: boolFromAccess(p['Escleroterapia monoterapia']),
      quirurgico: boolFromAccess(p.QuirurgicoB),
      escleroterapia_laser_super: boolFromAccess(p['Escleroterapia laser super']),
      quirurgico_texto: p.Quirurgico?.trim() || null,
      valor_honorarios: numFromAccess(p.ValorHonorariosQ),
      flebologico_aplicado: p.FlebologicoAplicado?.trim() || null,
      antc_aplicado: p.AntcAplicado?.trim() || null,
      eco_escleroterapia: p.Eco_escleroterapia?.trim() || null,
      presion_media: p.Presionmedia?.trim() || null,
      total: numFromAccess(p.Total),
    }

    // Parse diagnósticos from PLAN CIRUGIA
    const diagnosticos = [
      ...cirugias.map(c => ({
        tipo: 'cirugia',
        fecha: parseAccessDate(c.FECHA),
        diagnostico: c.IMPRDIAGNOSTICA?.trim() || null,
        observacion: c.OBSERVACIONPROCTERA?.trim() || null,
        procedimientos: {
          laser_endo_mid: numFromAccess(c.LASERENDOMID),
          laser_endo_mii: numFromAccess(c.LASERENDOMII),
          ecor_mid: numFromAccess(c.ECOREABMID),
          ecor_mii: numFromAccess(c.ECOREABMII),
          flebectomia_mid: numFromAccess(c.FLEBECTOMIAMID),
          flebectomia_mii: numFromAccess(c.FLEBECTOMIAMII),
          sesiones_esclero: numFromAccess(c.SESIONESCLEROT),
          costo_sesiones_esclero: numFromAccess(c.COSTOSESIONESCLEROT),
          sesiones_laser: numFromAccess(c.SESIONLASERS),
          costo_sesiones_laser: numFromAccess(c.COSTOSESIONLASERS),
          sesiones_mono: numFromAccess(c.SESIONMONO),
          costo_sesiones_mono: numFromAccess(c.COSTOSESIONMONO),
        },
        examenes: c.EXAMENES?.trim() || null,
        total_examenes: numFromAccess(c.TOTALEXAMENES),
        presion: c.PRESIONM?.trim() || null,
        medicamentos: [
          c.MEDICA && { nombre: c.MEDICA, valor: numFromAccess(c.VALORA) },
          c.MEDICB && { nombre: c.MEDICB, valor: numFromAccess(c.VALORB) },
          c.MEDICC && { nombre: c.MEDICC, valor: numFromAccess(c.VALORC) },
        ].filter(Boolean),
      })),
      ...costos.map(c => ({
        tipo: 'escleroterapia',
        fecha: parseAccessDate(c.FECHA),
        diagnostico: c.DIAGNOSTICO?.trim() || null,
        observacion_terapeutica: c.OBSERVACIONESTERAPEU?.trim() || null,
        observacion_sin_laser: c.OBSERVACIONESSINLASER?.trim() || null,
        sesiones: {
          laser: numFromAccess(c.SESIONLASER),
          esclero: numFromAccess(c.SESIONESCLERO),
          monoter: numFromAccess(c.SESIONMONOTER),
        },
        costos: {
          laser: numFromAccess(c.COSTOSESIONLASER),
          esclero: numFromAccess(c.COSTOSESIONESCLERO),
          monoter: numFromAccess(c.VALORSESIONMONOTER),
        },
        presion: c.PRESION?.trim() || null,
        valor_presion: numFromAccess(c['VALOR PRESION']),
        preliminar: c.PRELIMINAR?.trim() || null,
        medicamentos: [
          c.MEDICAMENTOA,
          c.MEDICAMENTOB,
          c.MEDICAMENTOC,
        ].filter(Boolean),
      })),
    ]

    legacyRecords.push({
      patient_id: patientId,
      access_cedula: cedula,
      access_historia_id: parseInt(p.IdHistoria) || null,

      // RAW DATA - todo el registro original
      raw_paciente: p,
      raw_plan_cirugia: cirugias,
      raw_plan_costos: costos,

      // PARSED DATA
      antecedentes,
      sintomas,
      examenes,
      tratamientos,
      diagnosticos,

      // KEY TEXT FIELDS
      nombre_medico: p.NombreMedico?.trim() || null,
      observaciones: p.Observaciones?.trim() || null,
      observaciones_alerta: p.Obsalerta?.trim() || null,
      medicamentos: p.Medicamentos?.trim() || null,
      grado_varices: p.Grado?.trim() || null,
      tiempo_evolucion: p.TiempoEvolucion?.trim() || null,
      numero_visitas: p.NumeroVisitas?.trim() || null,
      publicidad: p.Publicidad?.trim() || null,

      // METADATA
      fecha_ingreso_original: parseAccessDate(p.FechaIngreso),
    })
  }

  console.log(`   📝 Prepared ${legacyRecords.length} legacy records`)

  // Insert in batches
  let inserted = 0
  let errors = 0

  for (let i = 0; i < legacyRecords.length; i += BATCH_SIZE) {
    const batch = legacyRecords.slice(i, i + BATCH_SIZE)

    const { error } = await supabase
      .from('patient_legacy_records')
      .insert(batch)

    if (error) {
      console.error(`   ❌ Batch error at ${i}:`, error.message)
      // Log first record of failed batch for debugging
      if (batch[0]) {
        console.error(`   First record cedula: ${batch[0].access_cedula}`)
      }
      errors += batch.length
      continue
    }

    inserted += batch.length

    if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= legacyRecords.length) {
      console.log(`   Progress: ${Math.min(i + BATCH_SIZE, legacyRecords.length)}/${legacyRecords.length}`)
    }
  }

  console.log(`   ✅ Inserted: ${inserted}, Errors: ${errors}`)
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log('🚀 Starting Access → Supabase migration')
  console.log('=' .repeat(50))
  console.log('')
  console.log('This script will:')
  console.log('1. Migrate patients to `patients` table (normalized)')
  console.log('2. Migrate ALL Access data to `patient_legacy_records`')
  console.log('   - Raw data preserved in JSONB fields')
  console.log('   - Parsed data for easy querying')
  console.log('')
  console.log('=' .repeat(50))

  // Check CSV files exist
  if (!fs.existsSync(PACIENTES_CSV)) {
    console.error(`❌ File not found: ${PACIENTES_CSV}`)
    console.log('\nExport CSVs first using mdb-export')
    process.exit(1)
  }

  // Read CSVs
  const pacientes = readCSV<Record<string, string>>(PACIENTES_CSV)
  const planCirugia = fs.existsSync(PLAN_CIRUGIA_CSV)
    ? readCSV<Record<string, string>>(PLAN_CIRUGIA_CSV)
    : []
  const planCostos = fs.existsSync(PLAN_COSTOS_CSV)
    ? readCSV<Record<string, string>>(PLAN_COSTOS_CSV)
    : []

  console.log('\n' + '='.repeat(50))

  // Step 1: Migrate patients
  const cedulaToUUID = await migratePatients(pacientes)

  // Step 2: Migrate legacy records
  await migrateLegacyRecords(pacientes, planCirugia, planCostos, cedulaToUUID)

  console.log('\n' + '='.repeat(50))
  console.log('✅ Migration complete!')
  console.log('')
  console.log('Summary:')
  console.log(`- Patients mapped: ${cedulaToUUID.size}`)
  console.log(`- PLAN CIRUGIA records: ${planCirugia.length}`)
  console.log(`- PLAN COSTOS records: ${planCostos.length}`)
  console.log('')
  console.log('Next steps:')
  console.log('1. Verify data in Supabase Dashboard')
  console.log('2. Create UI to display legacy records in patient profile')
}

main().catch(err => {
  console.error('❌ Migration failed:', err)
  process.exit(1)
})

/**
 * Agente de sincronizacion Access -> Supabase (one-way).
 *
 * Corre en el PC de la clinica (Windows) leyendo el .mdb directamente,
 * o en modo prueba leyendo los CSV exportados con mdb-export.
 *
 * Reglas de seguridad de datos:
 * - Pacientes: SOLO se insertan nuevos (match por cedula). Nunca se
 *   modifican pacientes existentes (pueden haber sido editados en el sistema).
 * - Registros legacy: espejo de Access. Se insertan nuevos y se actualizan
 *   cuando Access tiene MAS sesiones (plan cirugia / plan costos) que Supabase.
 * - Nunca se borra nada.
 *
 * Uso:
 *   node sync.mjs                  (lee ACCESS_DB_PATH del .env)
 *   node sync.mjs --from-csv DIR   (modo prueba: lee pacientes_access.csv etc. de DIR)
 *
 * Variables de entorno (.env en esta carpeta):
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY, ACCESS_DB_PATH
 *   ACCESS_TABLE_PACIENTES (default "PACIENTES")
 *   ACCESS_TABLE_CIRUGIA   (default "PLAN CIRUGIA")
 *   ACCESS_TABLE_COSTOS    (default "PLAN COSTOS")
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { hostname } from 'node:os'
import path from 'node:path'

// ============================================
// CONFIG
// ============================================

// Carga .env manualmente (sin dependencia dotenv)
const envPath = new URL('.env', import.meta.url).pathname
const envFile = process.platform === 'win32' && envPath.startsWith('/') ? envPath.slice(1) : envPath
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERROR: faltan SUPABASE_URL / SUPABASE_SERVICE_KEY en el .env')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const BATCH_SIZE = 50
const AGENT_VERSION = 'sync-access/1.0'

// ============================================
// NORMALIZACION (misma logica que la migracion original,
// pero tolerante a tipos de mdb-reader: Date, number, boolean)
// ============================================

function normalizeName(name) {
  if (!name) return ''
  return String(name)
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((word) => {
      if (!word) return ''
      const lowercase = ['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e']
      if (lowercase.includes(word)) return word
      return word.charAt(0).toUpperCase() + word.slice(1)
    })
    .join(' ')
}

function normalizeAddress(address) {
  if (!address) return ''
  return String(address)
    .trim()
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
    .replace(/\s+/g, ' ')
}

function normalizePhone(phone) {
  if (!phone) return ''
  const digits = String(phone).replace(/\D/g, '')
  if (digits.startsWith('57') && digits.length > 10) return digits.slice(2, 12)
  return digits.slice(0, 10)
}

function normalizeCedula(cedula) {
  if (cedula === null || cedula === undefined) return null
  const digits = String(cedula).replace(/\D/g, '')
  if (digits.length < 6 || digits.length > 10) return null
  return digits
}

function parseAccessDate(val) {
  if (!val) return null
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val.toISOString()
  const dateStr = String(val)
  const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{2})\s/)
  if (!match) {
    const d = new Date(dateStr)
    return isNaN(d.getTime()) ? null : d.toISOString()
  }
  const [, month, day, year] = match
  const fullYear = parseInt(year) < 50 ? 2000 + parseInt(year) : 1900 + parseInt(year)
  const date = new Date(fullYear, parseInt(month) - 1, parseInt(day))
  return isNaN(date.getTime()) ? null : date.toISOString()
}

function boolFromAccess(val) {
  if (val === true) return true
  if (typeof val === 'number') return val === 1 || val === -1
  if (typeof val === 'string') {
    const v = val.toLowerCase()
    return v === '1' || v === '-1' || v === 'true'
  }
  return false
}

function numFromAccess(val) {
  if (val === null || val === undefined || val === '') return null
  if (typeof val === 'number') return isNaN(val) ? null : val
  const num = parseFloat(String(val))
  return isNaN(num) ? null : num
}

function trimOrNull(val) {
  if (val === null || val === undefined) return null
  const s = String(val).trim()
  return s || null
}

/** Convierte una fila cruda a algo JSON-serializable (Dates -> ISO) */
function jsonSafe(row) {
  const out = {}
  for (const [k, v] of Object.entries(row)) {
    if (v instanceof Date) out[k] = isNaN(v.getTime()) ? null : v.toISOString()
    else if (typeof v === 'bigint') out[k] = Number(v)
    else if (Buffer.isBuffer?.(v)) out[k] = null
    else out[k] = v
  }
  return out
}

// ============================================
// FUENTES DE DATOS
// ============================================

async function readFromMdb(dbPath) {
  const { default: MDBReader } = await import('mdb-reader')
  const buffer = readFileSync(dbPath)
  const reader = new MDBReader(buffer)
  const tables = reader.getTableNames()

  const pick = (wanted) => {
    const name = tables.find((t) => t.trim().toUpperCase() === wanted.trim().toUpperCase())
    if (!name) {
      console.warn(`AVISO: tabla "${wanted}" no encontrada en el .mdb. Tablas: ${tables.join(', ')}`)
      return []
    }
    return reader.getTable(name).getData()
  }

  return {
    pacientes: pick(process.env.ACCESS_TABLE_PACIENTES || 'PACIENTES'),
    planCirugia: pick(process.env.ACCESS_TABLE_CIRUGIA || 'PLAN CIRUGIA'),
    planCostos: pick(process.env.ACCESS_TABLE_COSTOS || 'PLAN COSTOS'),
  }
}

async function readFromCsv(dir) {
  const { parse } = await import('csv-parse/sync')
  const read = (file) => {
    const p = path.join(dir, file)
    if (!existsSync(p)) {
      console.warn(`AVISO: ${p} no existe`)
      return []
    }
    return parse(readFileSync(p, 'utf-8'), {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      relax_quotes: true,
    })
  }
  return {
    pacientes: read('pacientes_access.csv'),
    planCirugia: read('plan_cirugia.csv'),
    planCostos: read('plan_costos.csv'),
  }
}

// ============================================
// CONSTRUCCION DE REGISTROS (identica a la migracion original)
// ============================================

function buildLegacyRecord(p, cirugias, costos, patientId, cedula) {
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

  const examenes = {
    mapeo_dupplex: boolFromAccess(p.MapeoDupplex),
    escaneo_dupplex: boolFromAccess(p['Escaneo Dupplex']),
    fotopletismografia: boolFromAccess(p.Fotopletismografia),
    mapeo_v_dupplex_valor: numFromAccess(p.MapeoVDupplex),
    fotopletismografia_valor: numFromAccess(p.FotopletismografiaL),
    escaneo_dupplex_valor: numFromAccess(p['Val Escaneo Dupplex']),
    doppler_valor: numFromAccess(p.DopplerL),
  }

  const tratamientos = {
    escleroterapia_monoterapia: boolFromAccess(p['Escleroterapia monoterapia']),
    quirurgico: boolFromAccess(p.QuirurgicoB),
    escleroterapia_laser_super: boolFromAccess(p['Escleroterapia laser super']),
    quirurgico_texto: trimOrNull(p.Quirurgico),
    valor_honorarios: numFromAccess(p.ValorHonorariosQ),
    flebologico_aplicado: trimOrNull(p.FlebologicoAplicado),
    antc_aplicado: trimOrNull(p.AntcAplicado),
    eco_escleroterapia: trimOrNull(p.Eco_escleroterapia),
    presion_media: trimOrNull(p.Presionmedia),
    total: numFromAccess(p.Total),
  }

  const diagnosticos = [
    ...cirugias.map((c) => ({
      tipo: 'cirugia',
      fecha: parseAccessDate(c.FECHA),
      diagnostico: trimOrNull(c.IMPRDIAGNOSTICA),
      observacion: trimOrNull(c.OBSERVACIONPROCTERA),
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
      examenes: trimOrNull(c.EXAMENES),
      total_examenes: numFromAccess(c.TOTALEXAMENES),
      presion: trimOrNull(c.PRESIONM),
      medicamentos: [
        c.MEDICA && { nombre: trimOrNull(c.MEDICA), valor: numFromAccess(c.VALORA) },
        c.MEDICB && { nombre: trimOrNull(c.MEDICB), valor: numFromAccess(c.VALORB) },
        c.MEDICC && { nombre: trimOrNull(c.MEDICC), valor: numFromAccess(c.VALORC) },
      ].filter(Boolean),
    })),
    ...costos.map((c) => ({
      tipo: 'escleroterapia',
      fecha: parseAccessDate(c.FECHA),
      diagnostico: trimOrNull(c.DIAGNOSTICO),
      observacion_terapeutica: trimOrNull(c.OBSERVACIONESTERAPEU),
      observacion_sin_laser: trimOrNull(c.OBSERVACIONESSINLASER),
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
      presion: trimOrNull(c.PRESION),
      valor_presion: numFromAccess(c['VALOR PRESION']),
      preliminar: trimOrNull(c.PRELIMINAR),
      medicamentos: [c.MEDICAMENTOA, c.MEDICAMENTOB, c.MEDICAMENTOC]
        .map(trimOrNull)
        .filter(Boolean),
    })),
  ]

  return {
    patient_id: patientId,
    access_cedula: cedula,
    access_historia_id: parseInt(p.IdHistoria) || null,
    raw_paciente: jsonSafe(p),
    raw_plan_cirugia: cirugias.map(jsonSafe),
    raw_plan_costos: costos.map(jsonSafe),
    antecedentes,
    sintomas,
    examenes,
    tratamientos,
    diagnosticos,
    nombre_medico: trimOrNull(p.NombreMedico),
    observaciones: trimOrNull(p.Observaciones),
    observaciones_alerta: trimOrNull(p.Obsalerta),
    medicamentos: trimOrNull(p.Medicamentos),
    grado_varices: trimOrNull(p.Grado),
    tiempo_evolucion: trimOrNull(p.TiempoEvolucion),
    numero_visitas: trimOrNull(String(p.NumeroVisitas ?? '')),
    publicidad: trimOrNull(p.Publicidad),
    fecha_ingreso_original: parseAccessDate(p.FechaIngreso),
  }
}

// ============================================
// SYNC
// ============================================

async function fetchAllRows(table, columns) {
  const all = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + PAGE - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    all.push(...data)
    if (data.length < PAGE) break
  }
  return all
}

async function main() {
  const startedAt = new Date().toISOString()
  const stats = {
    patients_new: 0,
    patients_skipped_sin_datos: 0,
    legacy_new: 0,
    legacy_updated: 0,
    legacy_unchanged: 0,
    errors: 0,
  }
  let runId = null

  // Registrar inicio de la corrida
  try {
    const { data } = await supabase
      .from('sync_runs')
      .insert({ source: 'access', started_at: startedAt, agent_info: `${AGENT_VERSION} @ ${hostname()}` })
      .select('id')
      .single()
    runId = data?.id ?? null
  } catch {
    // sin sync_runs no abortamos: la sincronizacion es lo importante
  }

  try {
    // ------------------------------------------------------------------
    // 1. Leer datos de Access (o CSV en modo prueba)
    // ------------------------------------------------------------------
    const csvFlag = process.argv.indexOf('--from-csv')
    const source =
      csvFlag !== -1
        ? await readFromCsv(process.argv[csvFlag + 1] || '.')
        : await readFromMdb(process.env.ACCESS_DB_PATH || 'clinica.mdb')

    console.log(
      `Access: ${source.pacientes.length} pacientes, ${source.planCirugia.length} plan cirugia, ${source.planCostos.length} plan costos`
    )

    // Indexar planes por cedula
    const cirugiaByCedula = new Map()
    const costosByCedula = new Map()
    for (const c of source.planCirugia) {
      const ced = normalizeCedula(c.Id)
      if (!ced) continue
      if (!cirugiaByCedula.has(ced)) cirugiaByCedula.set(ced, [])
      cirugiaByCedula.get(ced).push(c)
    }
    for (const c of source.planCostos) {
      const ced = normalizeCedula(c.Id)
      if (!ced) continue
      if (!costosByCedula.has(ced)) costosByCedula.set(ced, [])
      costosByCedula.get(ced).push(c)
    }

    // ------------------------------------------------------------------
    // 2. Estado actual en Supabase
    // ------------------------------------------------------------------
    console.log('Consultando estado actual en Supabase...')
    const existingPatients = await fetchAllRows('patients', 'id, cedula')
    const cedulaToUUID = new Map()
    for (const p of existingPatients) if (p.cedula) cedulaToUUID.set(p.cedula, p.id)

    const legacyState = await fetchAllRows(
      'legacy_sync_state',
      'access_cedula, patient_id, legacy_record_id, cirugia_count, costos_count'
    )
    const legacyByCedula = new Map()
    for (const l of legacyState) legacyByCedula.set(l.access_cedula, l)

    console.log(`Supabase: ${existingPatients.length} pacientes, ${legacyState.length} registros legacy`)

    // ------------------------------------------------------------------
    // 3. Pacientes nuevos (solo INSERT, nunca update)
    // ------------------------------------------------------------------
    const newPatientRows = []
    for (const p of source.pacientes) {
      const cedula = normalizeCedula(p.Id)
      if (!cedula || cedulaToUUID.has(cedula)) continue

      const celular = normalizePhone(p.TelCelular) || normalizePhone(p.TelFijo)
      const nombre = normalizeName(p.Nombre)
      const apellido = normalizeName(p.Apellidos)
      if (!nombre || !apellido || !celular) {
        stats.patients_skipped_sin_datos++
        continue
      }
      const fechaNac = parseAccessDate(p.FechaNacimiento)
      const fechaIng = parseAccessDate(p.FechaIngreso)
      newPatientRows.push({
        cedula,
        nombre,
        apellido,
        celular,
        email: trimOrNull(p.email),
        fecha_nacimiento: fechaNac ? fechaNac.split('T')[0] : null,
        direccion: normalizeAddress(p.Direccion) || null,
        ocupacion: normalizeName(p.Ocupacion) || null,
        estado_civil: normalizeName(p.ECivil) || null,
        ciudad: normalizeName(p.Ciudad) || null,
        pais: normalizeName(p.Pais) || 'Colombia',
        fecha_registro: fechaIng ? fechaIng.split('T')[0] : null,
      })
    }

    for (let i = 0; i < newPatientRows.length; i += BATCH_SIZE) {
      const batch = newPatientRows.slice(i, i + BATCH_SIZE)
      const { data, error } = await supabase
        .from('patients')
        .upsert(batch, { onConflict: 'cedula', ignoreDuplicates: true })
        .select('id, cedula')
      if (error) {
        console.error(`Error insertando pacientes (batch ${i}):`, error.message)
        stats.errors += batch.length
        continue
      }
      for (const row of data ?? []) {
        cedulaToUUID.set(row.cedula, row.id)
        stats.patients_new++
      }
    }
    console.log(`Pacientes nuevos: ${stats.patients_new} (omitidos por datos incompletos: ${stats.patients_skipped_sin_datos})`)

    // ------------------------------------------------------------------
    // 4. Registros legacy: insertar nuevos / actualizar los que crecieron
    // ------------------------------------------------------------------
    const toInsert = []
    const toUpdate = []

    for (const p of source.pacientes) {
      const cedula = normalizeCedula(p.Id)
      if (!cedula) continue
      const patientId = cedulaToUUID.get(cedula)
      if (!patientId) continue // paciente omitido (sin datos minimos)

      const cirugias = cirugiaByCedula.get(cedula) || []
      const costos = costosByCedula.get(cedula) || []
      const existing = legacyByCedula.get(cedula)

      if (!existing) {
        toInsert.push(buildLegacyRecord(p, cirugias, costos, patientId, cedula))
      } else if (
        cirugias.length > existing.cirugia_count ||
        costos.length > existing.costos_count
      ) {
        toUpdate.push({
          id: existing.legacy_record_id,
          record: buildLegacyRecord(p, cirugias, costos, existing.patient_id, cedula),
        })
      } else {
        stats.legacy_unchanged++
      }
    }

    for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
      const batch = toInsert.slice(i, i + BATCH_SIZE)
      const { error } = await supabase.from('patient_legacy_records').insert(batch)
      if (error) {
        console.error(`Error insertando legacy (batch ${i}):`, error.message)
        stats.errors += batch.length
        continue
      }
      stats.legacy_new += batch.length
    }

    for (const u of toUpdate) {
      const { error } = await supabase
        .from('patient_legacy_records')
        .update(u.record)
        .eq('id', u.id)
      if (error) {
        console.error(`Error actualizando legacy ${u.record.access_cedula}:`, error.message)
        stats.errors++
        continue
      }
      stats.legacy_updated++
    }

    console.log(
      `Legacy: ${stats.legacy_new} nuevos, ${stats.legacy_updated} actualizados, ${stats.legacy_unchanged} sin cambios, ${stats.errors} errores`
    )

    // ------------------------------------------------------------------
    // 5. Cerrar la corrida
    // ------------------------------------------------------------------
    if (runId) {
      await supabase
        .from('sync_runs')
        .update({ finished_at: new Date().toISOString(), ok: stats.errors === 0, stats })
        .eq('id', runId)
    }

    console.log('Sincronizacion completa.', JSON.stringify(stats))
    process.exit(stats.errors > 0 ? 1 : 0)
  } catch (err) {
    console.error('FALLO la sincronizacion:', err.message)
    if (runId) {
      await supabase
        .from('sync_runs')
        .update({ finished_at: new Date().toISOString(), ok: false, stats, error: String(err.message).slice(0, 2000) })
        .eq('id', runId)
    }
    process.exit(1)
  }
}

main()

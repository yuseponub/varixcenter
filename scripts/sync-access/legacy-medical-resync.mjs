/**
 * Incremental patient_legacy_records -> medical_records synchronization.
 *
 * This module is both:
 * - imported by sync.mjs as the final step of the hourly Access sync; and
 * - executable on its own with `node legacy-medical-resync.mjs`.
 *
 * It never deletes data. It only creates missing legacy_access mirrors or
 * refreshes mirrors that have not been edited by a platform user.
 */

import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const PAGE_SIZE = 1000
const FETCH_BATCH_SIZE = 100
const WRITE_BATCH_SIZE = 50

const LEGACY_FIELDS = [
  'id',
  'patient_id',
  'nombre_medico',
  'observaciones',
  'observaciones_alerta',
  'medicamentos',
  'grado_varices',
  'tiempo_evolucion',
  'fecha_ingreso_original',
  'antecedentes',
  'sintomas',
  'examenes',
  'diagnosticos',
  'created_at',
  'updated_at',
].join(', ')

// ============================================
// DOCTOR NAME RESOLUTION
// ============================================

export function buildDoctorMap(doctors) {
  const map = new Map()

  for (const doctor of doctors) {
    if (!doctor.nombre) continue

    const fullName = `${doctor.nombre} ${doctor.apellido || ''}`
      .trim()
      .toLowerCase()
    map.set(fullName, doctor.id)

    const firstName = doctor.nombre.trim().toLowerCase()
    if (!map.has(firstName)) {
      map.set(firstName, doctor.id)
    }

    const names = doctor.nombre.trim().toLowerCase().split(/\s+/)
    if (names.length >= 2) {
      const twoNames = names.slice(0, 2).join(' ')
      if (!map.has(twoNames)) {
        map.set(twoNames, doctor.id)
      }
    }
  }

  return map
}

export function resolveDoctorId(nombreMedico, doctorMap) {
  if (!nombreMedico) return null

  const normalized = nombreMedico.trim().toLowerCase()
  if (!normalized) return null

  if (doctorMap.has(normalized)) {
    return doctorMap.get(normalized)
  }

  for (const [key, id] of doctorMap) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return id
    }
  }

  return null
}

// ============================================
// LEGACY -> MEDICAL RECORD MAPPING
// ============================================

function mapSintomas(legacy) {
  const symptoms = legacy.sintomas || {}
  const others = []

  if (symptoms.dolor_ciclo) others.push('Dolor asociado al ciclo menstrual')
  if (symptoms.adormecimiento) others.push('Adormecimiento')

  return {
    dolor: symptoms.dolor || false,
    cansancio: symptoms.cansancio || false,
    calambres: symptoms.calambres || false,
    prurito: symptoms.prurito || false,
    ardor: symptoms.ardor || false,
    ...(others.length > 0 ? { otros: others.join(', ') } : {}),
    ...(legacy.tiempo_evolucion
      ? { tiempo_evolucion: legacy.tiempo_evolucion }
      : {}),
  }
}

function mapSignos(legacy) {
  const symptoms = legacy.sintomas || {}
  const others = []

  if (symptoms.eczema) others.push('Eczema')

  return {
    edema: symptoms.edema || false,
    ulcera_activa: symptoms.ulcera || false,
    lipodermatoesclerosis: symptoms.lipodermatoesclerosis || false,
    ...(others.length > 0 ? { otros: others.join(', ') } : {}),
  }
}

function mapInicioRelacionado(legacy) {
  const history = legacy.antecedentes || {}
  const others = []

  if (history.adolescencia) others.push('Inicio en adolescencia')

  return {
    embarazo: history.embarazo || false,
    trauma: history.trauma || false,
    anticonceptivos: history.planificacion || false,
    cirugia_previa: history.posquirurgico || false,
    ...(others.length > 0 ? { otros: others.join(', ') } : {}),
  }
}

function mapAntecedentes(legacy) {
  const history = legacy.antecedentes || {}
  const others = []

  if (history.familiares) others.push('Antecedentes familiares')
  if (history.hospitalizacion) others.push('Hospitalizacion')
  if (history.hepatitis) others.push('Hepatitis')
  if (history.transfusiones) others.push('Transfusiones')
  if (history.farmacologico) others.push('Antecedentes farmacologicos')

  const observations = []
  if (legacy.observaciones) observations.push(legacy.observaciones)
  if (legacy.observaciones_alerta) {
    observations.push(`[ALERTA] ${legacy.observaciones_alerta}`)
  }

  return {
    hipertension: history.hipertension || false,
    diabetes: history.diabetes || false,
    cirugia_vascular: history.cirugia || false,
    alergias: history.alergia || false,
    ...(others.length > 0 ? { otros: others.join(', ') } : {}),
    ...(observations.length > 0
      ? { observaciones: observations.join('\n') }
      : {}),
  }
}

function mapLaboratorioVascular(legacy) {
  const exams = legacy.examenes || {}
  const findings = []

  if (exams.mapeo_v_dupplex_valor != null) {
    findings.push(`Mapeo Dupplex: ${exams.mapeo_v_dupplex_valor}`)
  }
  if (exams.escaneo_dupplex_valor != null) {
    findings.push(`Escaneo Dupplex: ${exams.escaneo_dupplex_valor}`)
  }
  if (exams.fotopletismografia_valor != null) {
    findings.push(
      `Fotopletismografia: ${exams.fotopletismografia_valor}`
    )
  }
  if (exams.doppler_valor != null) {
    findings.push(`Doppler: ${exams.doppler_valor}`)
  }

  return {
    doppler_venoso: exams.mapeo_dupplex || false,
    doppler_arterial: exams.escaneo_dupplex || false,
    fotopletismografia: exams.fotopletismografia || false,
    ...(findings.length > 0 ? { hallazgos: findings.join('\n') } : {}),
  }
}

function formatLegacyDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)

  return new Intl.DateTimeFormat('es-CO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'America/Bogota',
  }).format(date)
}

function mapDiagnostico(legacy) {
  const diagnostics = legacy.diagnosticos || []
  if (diagnostics.length === 0) return null

  const parts = diagnostics
    .map((diagnostic) => {
      const datePart = diagnostic.fecha
        ? `[${formatLegacyDate(diagnostic.fecha)}]`
        : ''
      const typePart = diagnostic.tipo ? `(${diagnostic.tipo})` : ''
      const textParts = []

      if (diagnostic.diagnostico) textParts.push(diagnostic.diagnostico)
      if (diagnostic.observacion) {
        textParts.push(`Obs: ${diagnostic.observacion}`)
      }
      if (diagnostic.observacion_terapeutica) {
        textParts.push(
          `Obs. terapeutica: ${diagnostic.observacion_terapeutica}`
        )
      }
      if (diagnostic.observacion_sin_laser) {
        textParts.push(`Obs. sin laser: ${diagnostic.observacion_sin_laser}`)
      }
      if (diagnostic.preliminar) {
        textParts.push(`Preliminar: ${diagnostic.preliminar}`)
      }

      if (textParts.length === 0) return null
      return `${datePart} ${typePart} ${textParts.join(' | ')}`.trim()
    })
    .filter(Boolean)

  return parts.length > 0 ? parts.join('\n') : null
}

function mapCeap(gradoVarices) {
  if (!gradoVarices) return null

  const normalized = gradoVarices.trim().toUpperCase()
  const gradeMatch = normalized.match(/G[-\s]*(\d)/)
  if (gradeMatch) {
    const grade = Number.parseInt(gradeMatch[1], 10)
    if (grade >= 0 && grade <= 6) return `C${grade}`
  }

  const ceapMatch = normalized.match(/^C(\d)$/)
  if (ceapMatch) {
    const grade = Number.parseInt(ceapMatch[1], 10)
    if (grade >= 0 && grade <= 6) return `C${grade}`
  }

  return null
}

export function mapLegacyToMedicalRecord(legacy, doctorMap = new Map()) {
  return {
    legacy_record_id: legacy.id,
    legacy_source_updated_at: legacy.updated_at,
    doctor_id: resolveDoctorId(legacy.nombre_medico, doctorMap),
    sintomas: mapSintomas(legacy),
    signos: mapSignos(legacy),
    inicio_relacionado: mapInicioRelacionado(legacy),
    antecedentes: mapAntecedentes(legacy),
    laboratorio_vascular: mapLaboratorioVascular(legacy),
    diagnostico: mapDiagnostico(legacy),
    ceap_pierna_izquierda: mapCeap(legacy.grado_varices),
    nombre_medico_legacy: legacy.nombre_medico || null,
    medicamentos: legacy.medicamentos || null,
    created_at:
      legacy.fecha_ingreso_original ||
      legacy.created_at ||
      new Date().toISOString(),
  }
}

// ============================================
// INCREMENTAL SYNCHRONIZATION
// ============================================

async function fetchPaged(buildQuery) {
  const rows = []

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery().range(
      from,
      from + PAGE_SIZE - 1
    )
    if (error) throw new Error(error.message)

    rows.push(...(data || []))
    if (!data || data.length < PAGE_SIZE) break
  }

  return rows
}

function sourceIsNewer(sourceUpdatedAt, convertedSourceUpdatedAt) {
  if (!convertedSourceUpdatedAt) return true

  const sourceTime = Date.parse(sourceUpdatedAt)
  const convertedTime = Date.parse(convertedSourceUpdatedAt)
  if (!Number.isFinite(sourceTime) || !Number.isFinite(convertedTime)) {
    throw new Error('Marca de tiempo legacy invalida')
  }

  return sourceTime > convertedTime
}

function hasOutOfBandEdit(record) {
  if (!record.legacy_synced_at) return false

  const updatedTime = Date.parse(record.updated_at)
  const syncedTime = Date.parse(record.legacy_synced_at)
  if (!Number.isFinite(updatedTime) || !Number.isFinite(syncedTime)) {
    return true
  }

  return updatedTime > syncedTime
}

function emptyStats() {
  return {
    medical_total_legacy: 0,
    medical_candidates: 0,
    medical_inserted: 0,
    medical_updated: 0,
    medical_unchanged: 0,
    medical_protected: 0,
    medical_stale: 0,
    medical_errors: 0,
  }
}

export async function syncLegacyMedicalRecords(
  supabase,
  { dryRun = false, limit = null, logger = console } = {}
) {
  const stats = emptyStats()

  const [{ data: doctors, error: doctorsError }, sourceVersions, mirrors] =
    await Promise.all([
      supabase.from('doctors_view').select('id, nombre, apellido'),
      fetchPaged(() =>
        supabase
          .from('patient_legacy_records')
          .select('id, updated_at')
          .order('id')
      ),
      fetchPaged(() =>
        supabase
          .from('medical_records')
          .select(
            'id, legacy_record_id, source, updated_by, updated_at, legacy_source_updated_at, legacy_synced_at'
          )
          .not('legacy_record_id', 'is', null)
          .order('legacy_record_id')
      ),
    ])

  if (doctorsError) {
    throw new Error(`doctors_view: ${doctorsError.message}`)
  }

  stats.medical_total_legacy = sourceVersions.length
  const doctorMap = buildDoctorMap(doctors || [])
  const mirrorByLegacyId = new Map(
    mirrors.map((record) => [record.legacy_record_id, record])
  )
  const candidateIds = []

  for (const source of sourceVersions) {
    const mirror = mirrorByLegacyId.get(source.id)
    if (!mirror) {
      candidateIds.push(source.id)
      continue
    }

    const needsSync = sourceIsNewer(
      source.updated_at,
      mirror.legacy_source_updated_at
    )
    if (!needsSync) {
      stats.medical_unchanged++
      continue
    }

    if (
      mirror.source !== 'legacy_access' ||
      mirror.updated_by ||
      hasOutOfBandEdit(mirror)
    ) {
      stats.medical_protected++
      continue
    }

    candidateIds.push(source.id)
  }

  stats.medical_candidates = candidateIds.length
  const selectedIds =
    limit == null ? candidateIds : candidateIds.slice(0, Math.max(0, limit))

  logger.log(
    `Historias visibles: ${stats.medical_candidates} pendientes, ` +
      `${stats.medical_protected} protegidas por edicion manual, ` +
      `${stats.medical_unchanged} al dia`
  )

  if (dryRun || selectedIds.length === 0) {
    return stats
  }

  let processed = 0
  for (
    let fetchOffset = 0;
    fetchOffset < selectedIds.length;
    fetchOffset += FETCH_BATCH_SIZE
  ) {
    const ids = selectedIds.slice(
      fetchOffset,
      fetchOffset + FETCH_BATCH_SIZE
    )
    const { data: legacyRecords, error: legacyError } = await supabase
      .from('patient_legacy_records')
      .select(LEGACY_FIELDS)
      .in('id', ids)

    if (legacyError) {
      logger.error(
        `Error leyendo lote legacy (${ids.length} registros): ${legacyError.message}`
      )
      stats.medical_errors += ids.length
      continue
    }

    const payloads = (legacyRecords || []).map((legacy) =>
      mapLegacyToMedicalRecord(legacy, doctorMap)
    )
    const missingPayloads = ids.length - payloads.length
    if (missingPayloads > 0) {
      stats.medical_errors += missingPayloads
    }

    for (
      let writeOffset = 0;
      writeOffset < payloads.length;
      writeOffset += WRITE_BATCH_SIZE
    ) {
      const batch = payloads.slice(
        writeOffset,
        writeOffset + WRITE_BATCH_SIZE
      )
      const { data: results, error: syncError } = await supabase.rpc(
        'sync_legacy_medical_records',
        { p_records: batch }
      )

      if (syncError) {
        logger.error(
          `Error convirtiendo lote (${batch.length} registros): ${syncError.message}`
        )
        stats.medical_errors += batch.length
        continue
      }

      for (const result of results || []) {
        switch (result.sync_status) {
          case 'inserted':
            stats.medical_inserted++
            break
          case 'updated':
            stats.medical_updated++
            break
          case 'unchanged':
            stats.medical_unchanged++
            break
          case 'protected_manual':
          case 'protected_source':
          case 'protected_race':
            stats.medical_protected++
            break
          case 'stale_source':
            stats.medical_stale++
            break
          default:
            stats.medical_errors++
            break
        }
      }

      if ((results || []).length < batch.length) {
        stats.medical_errors += batch.length - (results || []).length
      }

      processed += batch.length
      if (processed % 500 === 0 || processed === selectedIds.length) {
        logger.log(
          `Historias visibles procesadas: ${processed}/${selectedIds.length}`
        )
      }
    }
  }

  return stats
}

// ============================================
// STANDALONE COMMAND
// ============================================

function loadLocalEnv() {
  const envUrl = new URL('.env', import.meta.url)
  let envFile = envUrl.pathname
  if (process.platform === 'win32' && envFile.startsWith('/')) {
    envFile = envFile.slice(1)
  }

  if (!existsSync(envFile)) return

  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, '')
    }
  }
}

async function runStandalone() {
  loadLocalEnv()

  const url =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'Faltan SUPABASE_URL / SUPABASE_SERVICE_KEY en el entorno'
    )
  }

  const dryRun = process.argv.includes('--dry-run')
  const limitArgument = process.argv.find((argument) =>
    argument.startsWith('--limit=')
  )
  const limit = limitArgument
    ? Number.parseInt(limitArgument.split('=')[1], 10)
    : null
  if (limitArgument && (!Number.isFinite(limit) || limit < 0)) {
    throw new Error('--limit debe ser un entero no negativo')
  }

  const client = createClient(url, key)
  const stats = await syncLegacyMedicalRecords(client, { dryRun, limit })
  console.log('Resincronizacion de historias completa.', JSON.stringify(stats))
  process.exit(stats.medical_errors > 0 ? 1 : 0)
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href

if (isMain) {
  runStandalone().catch((error) => {
    console.error('FALLO la resincronizacion de historias:', error.message)
    process.exit(1)
  })
}

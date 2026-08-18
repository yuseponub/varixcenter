import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Índice de nombres de pacientes para mapear eventos de Outlook (texto libre en
 * el asunto) a pacientes existentes por nombre. Se cachea en memoria del proceso
 * porque la lista completa (~12k) no cambia entre cargas del calendario.
 */
export interface IndexedPatient {
  id: string
  cedula: string
  celular: string
  name: string
  /** Nombre completo normalizado (sin tildes, mayúsculas) para comparar. */
  normalized: string
  tokens: string[]
}

const TTL_MS = 10 * 60 * 1000
let cache: { at: number; patients: IndexedPatient[] } | null = null

export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export async function getPatientNameIndex(): Promise<IndexedPatient[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.patients

  // Lectura de solo nombres (dato no sensible entre el personal de la clínica).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any
  const patients: IndexedPatient[] = []
  const pageSize = 1000
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await db
      .from('patients')
      .select('id, nombre, apellido, cedula, celular')
      .range(offset, offset + pageSize - 1)
    if (error) {
      if (offset === 0) throw error
      break
    }
    if (!data || data.length === 0) break
    for (const p of data as Array<{
      id: string
      nombre: string | null
      apellido: string | null
      cedula: string | null
      celular: string | null
    }>) {
      const name = `${p.nombre ?? ''} ${p.apellido ?? ''}`.replace(/\s+/g, ' ').trim()
      const normalized = normalizeName(name)
      patients.push({
        id: p.id,
        cedula: p.cedula ?? '',
        celular: p.celular ?? '',
        name,
        normalized,
        tokens: normalized.split(' ').filter((token) => token.length >= 3),
      })
    }
    if (data.length < pageSize) break
  }

  cache = { at: Date.now(), patients }
  return patients
}

/**
 * Devuelve el paciente cuyo nombre completo aparece dentro del asunto (todos los
 * tokens ≥3 letras presentes). Solo vincula si el match es ÚNICO — pacientes
 * duplicados en la BD (misma cédula) cuentan como uno; si hay varias cédulas
 * distintas es ambiguo y no se vincula.
 */
export function matchPatientBySubject(
  subject: string,
  index: IndexedPatient[]
): IndexedPatient | null {
  const normalizedSubject = normalizeName(subject)
  if (!normalizedSubject) return null

  const matches = index.filter(
    (patient) =>
      patient.tokens.length >= 2 &&
      patient.tokens.every((token) => normalizedSubject.includes(token))
  )
  if (matches.length === 0) return null

  const byCedula = new Map<string, IndexedPatient>()
  for (const match of matches) byCedula.set(match.cedula || match.id, match)
  if (byCedula.size !== 1) return null

  // Entre duplicados de la misma persona, preferir el de tokens más largos.
  return matches.reduce((best, current) =>
    current.tokens.length > best.tokens.length ? current : best
  )
}

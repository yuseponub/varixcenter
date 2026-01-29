/**
 * Migrar citas del CSV revisado a Supabase
 * - Lee el CSV con los matches verificados
 * - Filtra las que tienen anotaciones (no subir)
 * - Crea pacientes nuevos si es necesario
 * - Crea las citas con motivo_consulta extraído
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Doctores
const DOCTORES = {
  carolina: 'aee08e40-5c60-481e-966f-51af351351e8',
  ciro: 'fa3e2e8d-faf4-40b0-a3cb-a8d50780988d',
}

// Duración por defecto de citas (30 minutos)
const DURACION_MINUTOS = 30

interface CitaCSV {
  fecha: string
  hora: string
  nombreCalendario: string
  nombreBD: string
  cedula: string
  telefono: string
  estado: string
  anotaciones: string
}

function parseCSV(content: string): CitaCSV[] {
  const lines = content.split('\n').filter((l) => l.trim())
  lines.shift() // Remove header

  return lines.map((line) => {
    const parts = line.split(';')
    return {
      fecha: parts[0] || '',
      hora: parts[1] || '',
      nombreCalendario: parts[2] || '',
      nombreBD: parts[3] || '',
      cedula: parts[4] || '',
      telefono: parts[5] || '',
      estado: parts[6] || '',
      anotaciones: parts[7] || '',
    }
  })
}

function extraerMotivoConsulta(nombreCalendario: string): string {
  const motivos: string[] = []
  const upper = nombreCalendario.toUpperCase()

  if (/\d+\s*SESION/.test(upper)) {
    const match = upper.match(/(\d+)\s*SESION/)
    motivos.push(match ? `${match[1]} SESIONES` : 'SESIONES')
  }
  if (/\bCONTROL\b/.test(upper)) motivos.push('CONTROL')
  if (/\bREVISION\b/.test(upper)) motivos.push('REVISION')
  if (/\bRESIDUOS?\b/.test(upper)) motivos.push('RESIDUOS')
  if (/\bECOR\b/.test(upper)) motivos.push('ECOR')
  if (/\bVSI\b/.test(upper)) motivos.push('VSI')
  if (/\bLASER\b/.test(upper)) motivos.push('LASER')
  if (/\bSCANEO\b/.test(upper)) motivos.push('SCANEO')
  if (/\bFLEBECTOMIA\b/.test(upper)) motivos.push('FLEBECTOMIA')
  if (/\bRETIRO\s*DE\s*PUNTOS\b/.test(upper)) motivos.push('RETIRO DE PUNTOS')
  if (/\bLOCION\b/.test(upper)) motivos.push('LOCION')
  if (/\bMEDIA\b/.test(upper)) motivos.push('MEDIA')
  if (/\bTROMBOS\b/.test(upper)) motivos.push('TROMBOS')
  if (/\b1\s*VEZ\b/.test(upper)) motivos.push('1 VEZ')

  return motivos.join(', ') || ''
}

function determinarDoctor(nombreCalendario: string): string {
  if (/\bDRA\b/i.test(nombreCalendario)) {
    return DOCTORES.carolina
  }
  return DOCTORES.ciro
}

function parseFechaHora(fecha: string, hora: string): Date | null {
  try {
    // Fecha: "29/01/2026"
    const [dia, mes, anio] = fecha.split('/')

    // Hora: "01:00 a. m." o "01:00 p. m."
    const horaMatch = hora.match(/(\d{1,2}):(\d{2})\s*(a\.?\s*m\.?|p\.?\s*m\.?)/i)
    if (!horaMatch) return null

    let horas = parseInt(horaMatch[1])
    const minutos = parseInt(horaMatch[2])
    const ampm = horaMatch[3].toLowerCase().replace(/[\s.]/g, '')

    // Convertir a 24h
    if (ampm === 'pm' && horas < 12) horas += 12
    if (ampm === 'am' && horas === 12) horas = 0

    // Crear fecha en timezone Colombia (UTC-5)
    const fechaStr = `${anio}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}T${horas.toString().padStart(2, '0')}:${minutos.toString().padStart(2, '0')}:00-05:00`

    return new Date(fechaStr)
  } catch (e) {
    console.error('Error parsing fecha/hora:', fecha, hora, e)
    return null
  }
}

async function getOrCreatePatient(cita: CitaCSV): Promise<string | null> {
  // Si tiene cédula, buscar por cédula
  if (cita.cedula && cita.cedula.trim()) {
    const { data } = await supabase
      .from('patients')
      .select('id')
      .eq('cedula', cita.cedula.trim())
      .single()

    if (data) return data.id
  }

  // Si es paciente nuevo, crear
  if (cita.estado === 'Nuevo' || cita.nombreBD === 'PACIENTE NUEVO') {
    // Extraer nombre del calendario
    const nombreLimpio = cita.nombreCalendario
      .replace(/^\d+[\s.:]+\d*\s*/i, '')
      .replace(/\s*(CEL|TEL)[\s.:]*[\d\s.\-]+.*/gi, '')
      .replace(/\s*\d+\s*(SESION|SESIONES|VEZ).*/gi, '')
      .replace(/\s*(CONTROL|REVISION|RESIDUOS|ECOR|VSI|DRA|DR).*/gi, '')
      .trim()

    const palabras = nombreLimpio.split(/\s+/)
    const nombre = palabras.slice(0, 2).join(' ') || nombreLimpio
    const apellido = palabras.slice(2).join(' ') || ''

    const { data, error } = await supabase
      .from('patients')
      .insert({
        nombre: nombre,
        apellido: apellido || 'PENDIENTE',
        celular: cita.telefono?.replace(/\D/g, '').slice(0, 10) || null,
        cedula: null,
      })
      .select('id')
      .single()

    if (error) {
      console.error('Error creando paciente:', nombreLimpio, error.message)
      return null
    }

    console.log(`  🆕 Paciente creado: ${nombre} ${apellido}`)
    return data.id
  }

  // Buscar por nombre en BD si no tiene cédula
  if (cita.nombreBD && cita.nombreBD !== 'PACIENTE NUEVO') {
    // Intentar buscar por nombre exacto
    const palabras = cita.nombreBD.trim().split(/\s+/)
    const primerNombre = palabras[0]
    const apellido = palabras.length > 1 ? palabras[palabras.length - 1] : ''

    const { data } = await supabase
      .from('patients')
      .select('id, nombre, apellido')
      .ilike('nombre', `%${primerNombre}%`)
      .ilike('apellido', `%${apellido}%`)
      .limit(10)

    // Buscar el que mejor coincida
    const nombreBDLower = cita.nombreBD.toLowerCase()
    const match = data?.find((p) => {
      const fullName = `${p.nombre} ${p.apellido}`.toLowerCase()
      return fullName === nombreBDLower ||
             fullName.includes(nombreBDLower) ||
             nombreBDLower.includes(fullName)
    })

    if (match) return match.id
  }

  console.error('  ❌ No se encontró paciente:', cita.nombreCalendario, '→', cita.nombreBD)
  return null
}

async function main() {
  console.log('📂 Leyendo CSV...')
  const csvPath = '/mnt/c/Users/Usuario/Downloads/Copia de citas-matching-resultado.csv'
  const content = fs.readFileSync(csvPath, 'utf-8')
  const citas = parseCSV(content)

  console.log(`Total citas en CSV: ${citas.length}`)

  // Filtrar las que NO tienen anotaciones
  const citasASubir = citas.filter((c) => !c.anotaciones || c.anotaciones.trim() === '')
  const citasConAnotaciones = citas.filter((c) => c.anotaciones && c.anotaciones.trim() !== '')

  console.log(`✅ Citas a subir: ${citasASubir.length}`)
  console.log(`⏭️ Citas con anotaciones (no subir): ${citasConAnotaciones.length}`)

  console.log('\n=== CITAS CON ANOTACIONES (NO SE SUBIRÁN) ===')
  citasConAnotaciones.forEach((c) => {
    console.log(`  - ${c.nombreCalendario} | ${c.anotaciones}`)
  })

  console.log('\n=== SUBIENDO CITAS ===\n')

  let creadas = 0
  let errores = 0

  for (const cita of citasASubir) {
    // Parsear fecha/hora
    const fechaInicio = parseFechaHora(cita.fecha, cita.hora)
    if (!fechaInicio) {
      console.error(`❌ Error parseando fecha: ${cita.fecha} ${cita.hora}`)
      errores++
      continue
    }

    // Calcular fecha fin (30 min después)
    const fechaFin = new Date(fechaInicio.getTime() + DURACION_MINUTOS * 60 * 1000)

    // Obtener o crear paciente
    const patientId = await getOrCreatePatient(cita)
    if (!patientId) {
      errores++
      continue
    }

    // Determinar doctor
    const doctorId = determinarDoctor(cita.nombreCalendario)

    // Extraer motivo de consulta
    const motivoConsulta = extraerMotivoConsulta(cita.nombreCalendario)

    // Crear cita
    const { error } = await supabase.from('appointments').insert({
      patient_id: patientId,
      doctor_id: doctorId,
      fecha_hora_inicio: fechaInicio.toISOString(),
      fecha_hora_fin: fechaFin.toISOString(),
      estado: 'programada',
      motivo_consulta: motivoConsulta || null,
      notas: `Migrado de Outlook: ${cita.nombreCalendario}`,
    })

    if (error) {
      console.error(`❌ Error creando cita: ${cita.nombreCalendario}`, error.message)
      errores++
    } else {
      const doctor = doctorId === DOCTORES.carolina ? 'DRA' : 'DR'
      console.log(`✅ ${cita.fecha} ${cita.hora} | ${cita.nombreBD} | ${doctor} | ${motivoConsulta || '-'}`)
      creadas++
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log('RESUMEN')
  console.log('='.repeat(60))
  console.log(`✅ Citas creadas: ${creadas}`)
  console.log(`❌ Errores: ${errores}`)
  console.log(`⏭️ Omitidas (con anotaciones): ${citasConAnotaciones.length}`)
}

main().catch(console.error)

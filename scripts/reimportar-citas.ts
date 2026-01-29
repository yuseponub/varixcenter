/**
 * Reimportar citas de Outlook corrigiendo las horas
 * 1. Borrar todas las citas migradas anteriormente
 * 2. Importar con horas corregidas (01:00-07:30 a.m. → PM)
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

const DOCTORES = {
  carolina: 'aee08e40-5c60-481e-966f-51af351351e8',
  ciro: 'fa3e2e8d-faf4-40b0-a3cb-a8d50780988d',
}

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
  lines.shift()
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
    const [dia, mes, anio] = fecha.split('/')
    const horaMatch = hora.match(/(\d{1,2}):(\d{2})\s*(a\.?\s*m\.?|p\.?\s*m\.?)/i)
    if (!horaMatch) return null

    let horas = parseInt(horaMatch[1])
    const minutos = parseInt(horaMatch[2])
    let ampm = horaMatch[3].toLowerCase().replace(/[\s.]/g, '')

    // CORRECCIÓN: horas 1-7 con "a.m." son realmente PM (tarde)
    // horas 8-12 con "a.m." son realmente AM (mañana)
    if (ampm === 'am' && horas >= 1 && horas <= 7) {
      ampm = 'pm' // Convertir a PM
    }

    // Convertir a 24h
    if (ampm === 'pm' && horas < 12) horas += 12
    if (ampm === 'am' && horas === 12) horas = 0

    const fechaStr = `${anio}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}T${horas.toString().padStart(2, '0')}:${minutos.toString().padStart(2, '0')}:00-05:00`
    return new Date(fechaStr)
  } catch (e) {
    console.error('Error parsing fecha/hora:', fecha, hora, e)
    return null
  }
}

async function getOrCreatePatient(cita: CitaCSV): Promise<string | null> {
  if (cita.cedula && cita.cedula.trim()) {
    const { data } = await supabase
      .from('patients')
      .select('id')
      .eq('cedula', cita.cedula.trim())
      .single()
    if (data) return data.id
  }

  if (cita.estado === 'Nuevo' || cita.nombreBD === 'PACIENTE NUEVO') {
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

  if (cita.nombreBD && cita.nombreBD !== 'PACIENTE NUEVO') {
    const palabras = cita.nombreBD.trim().split(/\s+/)
    const primerNombre = palabras[0]
    const apellido = palabras.length > 1 ? palabras[palabras.length - 1] : ''

    const { data } = await supabase
      .from('patients')
      .select('id, nombre, apellido')
      .ilike('nombre', `%${primerNombre}%`)
      .ilike('apellido', `%${apellido}%`)
      .limit(10)

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
  // 1. BORRAR CITAS MIGRADAS ANTERIORMENTE
  console.log('🗑️ Borrando citas migradas anteriormente...')
  const { data: citasAnteriores, error: errBorrar } = await supabase
    .from('appointments')
    .delete()
    .like('notas', 'Migrado de Outlook:%')
    .select('id')

  if (errBorrar) {
    console.error('Error borrando:', errBorrar.message)
  } else {
    console.log(`   Borradas: ${citasAnteriores?.length || 0} citas\n`)
  }

  // 2. LEER CSV
  console.log('📂 Leyendo CSV...')
  const csvPath = '/mnt/c/Users/Usuario/Downloads/Copia de citas-matching-resultado.csv'
  const content = fs.readFileSync(csvPath, 'utf-8')
  const citas = parseCSV(content)

  console.log(`Total citas en CSV: ${citas.length}`)

  const citasASubir = citas.filter((c) => !c.anotaciones || c.anotaciones.trim() === '')
  const citasConAnotaciones = citas.filter((c) => c.anotaciones && c.anotaciones.trim() !== '')

  console.log(`✅ Citas a subir: ${citasASubir.length}`)
  console.log(`⏭️ Citas con anotaciones (no subir): ${citasConAnotaciones.length}`)

  // 3. SUBIR CITAS
  console.log('\n=== SUBIENDO CITAS ===\n')

  let creadas = 0
  let errores = 0
  const conflictos: string[] = []

  for (const cita of citasASubir) {
    const fechaInicio = parseFechaHora(cita.fecha, cita.hora)
    if (!fechaInicio) {
      console.error(`❌ Error parseando fecha: ${cita.fecha} ${cita.hora}`)
      errores++
      continue
    }

    const fechaFin = new Date(fechaInicio.getTime() + DURACION_MINUTOS * 60 * 1000)
    const patientId = await getOrCreatePatient(cita)
    if (!patientId) {
      errores++
      continue
    }

    const doctorId = determinarDoctor(cita.nombreCalendario)
    const motivoConsulta = extraerMotivoConsulta(cita.nombreCalendario)

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
      if (error.message.includes('no_overlapping_appointments')) {
        // Conflicto - intentar con el otro doctor
        const otroDoctor = doctorId === DOCTORES.ciro ? DOCTORES.carolina : DOCTORES.ciro
        const { error: error2 } = await supabase.from('appointments').insert({
          patient_id: patientId,
          doctor_id: otroDoctor,
          fecha_hora_inicio: fechaInicio.toISOString(),
          fecha_hora_fin: fechaFin.toISOString(),
          estado: 'programada',
          motivo_consulta: motivoConsulta || null,
          notas: `Migrado de Outlook: ${cita.nombreCalendario}`,
        })

        if (error2) {
          console.error(`❌ Conflicto sin resolver: ${cita.nombreCalendario}`)
          conflictos.push(`${cita.fecha} ${cita.hora} | ${cita.nombreCalendario}`)
          errores++
        } else {
          const doctor = otroDoctor === DOCTORES.carolina ? 'DRA (reasignada)' : 'DR (reasignado)'
          console.log(`⚠️ ${cita.fecha} ${cita.hora} | ${cita.nombreBD} | ${doctor}`)
          creadas++
        }
      } else {
        console.error(`❌ Error creando cita: ${cita.nombreCalendario}`, error.message)
        errores++
      }
    } else {
      const doctor = doctorId === DOCTORES.carolina ? 'DRA' : 'DR'
      const horaCorrecta = fechaInicio.toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' })
      console.log(`✅ ${cita.fecha} ${horaCorrecta} | ${cita.nombreBD} | ${doctor}`)
      creadas++
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log('RESUMEN')
  console.log('='.repeat(60))
  console.log(`✅ Citas creadas: ${creadas}`)
  console.log(`❌ Errores: ${errores}`)
  console.log(`⏭️ Omitidas (con anotaciones): ${citasConAnotaciones.length}`)

  if (conflictos.length > 0) {
    console.log('\n⚠️ CONFLICTOS SIN RESOLVER:')
    conflictos.forEach(c => console.log(`   - ${c}`))
  }
}

main().catch(console.error)

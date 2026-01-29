import * as fs from 'fs'

const data = JSON.parse(fs.readFileSync('scripts/citas-matched-fonetico.json', 'utf-8'))
const original = JSON.parse(fs.readFileSync('scripts/appointments-to-review.json', 'utf-8'))

// Crear CSV
const rows: string[] = []
rows.push('Fecha,Hora,Nombre en Calendario,Nombre en BD,Cedula,Telefono,Estado')

function limpiarNombre(summary: string): string {
  return summary
    .replace(/^\d+[\s.:]+\d*\s*/i, '')
    .replace(/\s*(CEL|TEL)[\s.:]*[\d\s.\-]+.*/gi, '')
    .replace(/\s*CC[\s.:]*[\d\s.]+.*/gi, '')
    .replace(/\s*\d+\s*(SESION|SESIONES|VEZ|VECES).*/gi, '')
    .replace(/\s*(CONTROL|REVISION|RESIDUOS|ECOR|VSI|DRA|DR|LOCION|RETIRO|TROMBOS|MEDIA|LASER|SCANEO|FLEBECTOMIA).*/gi, '')
    .replace(/\s*(CONFIRMAR|OJO).*/gi, '')
    .trim()
    .substring(0, 50)
}

function extraerTelefono(summary: string): string {
  const match = summary.match(/(?:CEL|TEL)[\s.:]*(\d[\d\s.\-]+\d)/i)
  return match ? match[1].replace(/[\s.\-]/g, '') : ''
}

function escapeCsv(str: string): string {
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

// Agregar exactas originales
if (original.exact) {
  for (const c of original.exact) {
    const fecha = new Date(c.fecha)
    const fechaStr = fecha.toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })
    const horaStr = fecha.toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Bogota',
    })

    const nombreCalendario = limpiarNombre(c.summary || '')

    rows.push(
      [
        fechaStr,
        horaStr,
        escapeCsv(nombreCalendario),
        escapeCsv(c.patient_name || ''),
        '',
        '',
        'Exacto',
      ].join(',')
    )
  }
}

// Agregar matched del algoritmo fonético
for (const c of data) {
  if (c.status === 'matched' && c.patient) {
    const fecha = new Date(c.fecha)
    const fechaStr = fecha.toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })
    const horaStr = fecha.toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Bogota',
    })

    const nombreCalendario = limpiarNombre(c.summary || '')
    const nombreBD = (c.patient.nombre || '') + ' ' + (c.patient.apellido || '')

    rows.push(
      [
        fechaStr,
        horaStr,
        escapeCsv(nombreCalendario),
        escapeCsv(nombreBD),
        c.patient.cedula || '',
        c.patient.celular || '',
        'Matched',
      ].join(',')
    )
  }
}

// Agregar nuevos
for (const c of data) {
  if (c.status === 'nuevo') {
    const fecha = new Date(c.fecha)
    const fechaStr = fecha.toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })
    const horaStr = fecha.toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Bogota',
    })

    const nombreCalendario = limpiarNombre(c.summary || '')
    const tel = extraerTelefono(c.summary || '')

    rows.push(
      [fechaStr, horaStr, escapeCsv(nombreCalendario), 'PACIENTE NUEVO', '', tel, 'Nuevo'].join(',')
    )
  }
}

// Ordenar por fecha y hora
const header = rows.shift()
rows.sort((a, b) => {
  const partsA = a.split(',')
  const partsB = b.split(',')
  const dateCompare = partsA[0].localeCompare(partsB[0])
  if (dateCompare !== 0) return dateCompare
  return partsA[1].localeCompare(partsB[1])
})

if (header) {
  rows.unshift(header)
}

fs.writeFileSync('scripts/citas-matching-resultado.csv', rows.join('\n'))
console.log('Archivo creado: scripts/citas-matching-resultado.csv')
console.log('Total filas:', rows.length - 1)

// Mostrar preview
console.log('\n=== PREVIEW (primeras 15 filas) ===\n')
rows.slice(0, 16).forEach((r) => console.log(r))

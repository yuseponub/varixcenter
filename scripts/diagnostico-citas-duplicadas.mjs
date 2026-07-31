/**
 * Diagnóstico de citas duplicadas (solo lectura).
 *
 * Responde: ¿un mismo clic creó dos citas, o se agendó dos veces a mano?
 * Lo dice la distancia entre los `created_at` de las citas y el rastro del
 * audit_log (misma sesión y user-agent = mismo envío del navegador).
 *
 * Uso, desde la raíz del repo:
 *   node --env-file=.env.local scripts/diagnostico-citas-duplicadas.mjs "nombre apellido"
 *   node --env-file=.env.local scripts/diagnostico-citas-duplicadas.mjs --dias 30
 *
 * Sin argumento de nombre, busca duplicados (mismo paciente y misma hora de
 * inicio) en los últimos `--dias` días.
 *
 * La salida es anónima a propósito: no imprime nombres, cédulas ni teléfonos,
 * solo identificadores cortos y tiempos. Se puede pegar en un chat o un issue.
 */

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!URL_BASE || !KEY || !URL_BASE.startsWith('http')) {
  console.error(
    'Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Ejecute:  node --env-file=.env.local scripts/diagnostico-citas-duplicadas.mjs "nombre apellido"'
  )
  process.exit(1)
}

const args = process.argv.slice(2)
const diasIndex = args.indexOf('--dias')
const dias = diasIndex >= 0 ? Number(args[diasIndex + 1] ?? 30) : 30
const termino = args.filter((a, i) => !a.startsWith('--') && i !== diasIndex + 1).join(' ').trim()

const short = (id) => (id ? String(id).slice(0, 8) : '—')
const bogota = (iso) =>
  iso ? new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota', hour12: false }) : '—'

async function q(path) {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return res.json()
}

/** Pacientes cuyo nombre completo contiene todas las palabras del término. */
async function buscarPacientes(texto) {
  const palabras = texto.toLowerCase().split(/\s+/).filter(Boolean)
  const primera = encodeURIComponent(`*${palabras[0]}*`)
  const candidatos = await q(
    `patients?select=id,nombre,apellido,cedula,created_at,created_by&or=(nombre.ilike.${primera},apellido.ilike.${primera})&limit=200`
  )
  return candidatos.filter((p) => {
    const full = `${p.nombre} ${p.apellido}`.toLowerCase()
    return palabras.every((w) => full.includes(w))
  })
}

async function citasDe(patientIds) {
  if (patientIds.length === 0) return []
  return q(
    `appointments?select=id,patient_id,doctor_id,fecha_hora_inicio,estado,created_at,created_by` +
      `&patient_id=in.(${patientIds.join(',')})&order=created_at`
  )
}

/** Rastro del audit_log: quién y con qué sesión/navegador se creó cada cita. */
async function rastro(appointmentIds) {
  if (appointmentIds.length === 0) return []
  const inList = appointmentIds.map((id) => `"${id}"`).join(',')
  try {
    return await q(
      `audit_log?select=record_id,action,changed_at,changed_by,client_ip,user_agent,session_id` +
        `&table_name=eq.public.appointments&record_id=in.(${inList})&order=changed_at`
    )
  } catch {
    return []
  }
}

function reportar(citas, huellas) {
  const porCita = new Map()
  for (const h of huellas) {
    if (h.action !== 'INSERT') continue
    porCita.set(h.record_id, h)
  }

  let anterior = null
  for (const c of citas) {
    const h = porCita.get(c.id)
    const delta = anterior
      ? ((new Date(c.created_at) - new Date(anterior.created_at)) / 1000).toFixed(1)
      : null

    console.log(
      `  cita ${short(c.id)} · paciente ${short(c.patient_id)} · doctor ${short(c.doctor_id)}\n` +
        `    inicio  ${bogota(c.fecha_hora_inicio)}  estado ${c.estado}\n` +
        `    creada  ${c.created_at}  por ${short(c.created_by)}` +
        (delta !== null ? `  (+${delta}s respecto de la anterior)` : '') +
        (h
          ? `\n    origen  sesion ${short(h.session_id)} · ip ${h.client_ip ?? '—'} · ` +
            `agente ${(h.user_agent ?? '—').slice(0, 60)}`
          : '\n    origen  sin registro en audit_log')
    )
    anterior = c
  }

  // Veredicto: dos citas del mismo paciente a la misma hora creadas con pocos
  // segundos de diferencia = un solo envío que se duplicó.
  const porClave = new Map()
  for (const c of citas) {
    const clave = `${c.patient_id}|${c.fecha_hora_inicio}`
    porClave.set(clave, [...(porClave.get(clave) ?? []), c])
  }
  const duplicadas = [...porClave.values()].filter((g) => g.length > 1)

  if (duplicadas.length === 0) {
    console.log('\n  Sin citas duplicadas (mismo paciente y misma hora de inicio).')
    return
  }

  console.log(`\n  DUPLICADAS: ${duplicadas.length} grupo(s)`)
  for (const grupo of duplicadas) {
    const tiempos = grupo.map((c) => new Date(c.created_at).getTime()).sort((a, b) => a - b)
    const separacion = (tiempos[tiempos.length - 1] - tiempos[0]) / 1000
    console.log(
      `    ${grupo.map((c) => short(c.id)).join(' + ')} · ${grupo.length} citas · ` +
        `separadas ${separacion.toFixed(1)}s → ` +
        (separacion < 15
          ? 'un solo envío que se duplicó (doble Enter/clic o reintento)'
          : 'se agendó dos veces en momentos distintos')
    )
  }
}

async function main() {
  if (termino) {
    const pacientes = await buscarPacientes(termino)
    console.log(`Pacientes que coinciden: ${pacientes.length}`)
    for (const p of pacientes) {
      console.log(
        `  paciente ${short(p.id)} · cedula ${p.cedula ? 'sí' : 'no'} · ` +
          `creado ${bogota(p.created_at)} por ${short(p.created_by)}`
      )
    }
    if (pacientes.length > 1) {
      console.log('  (más de una ficha: el paciente también quedó duplicado)')
    }
    if (pacientes.length === 0) return

    const citas = await citasDe(pacientes.map((p) => p.id))
    console.log(`\nCitas: ${citas.length}`)
    reportar(citas, await rastro(citas.map((c) => c.id)))
    return
  }

  // Barrido general de duplicados recientes.
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString()
  const citas = await q(
    `appointments?select=id,patient_id,doctor_id,fecha_hora_inicio,estado,created_at,created_by` +
      `&created_at=gte.${desde}&order=created_at`
  )
  const porClave = new Map()
  for (const c of citas) {
    const clave = `${c.patient_id}|${c.fecha_hora_inicio}`
    porClave.set(clave, [...(porClave.get(clave) ?? []), c])
  }
  const sospechosas = [...porClave.values()].filter((g) => g.length > 1).flat()
  console.log(
    `Citas creadas en los últimos ${dias} días: ${citas.length} · ` +
      `duplicadas: ${sospechosas.length}\n`
  )
  reportar(sospechosas, await rastro(sospechosas.map((c) => c.id)))
}

main().catch((e) => {
  console.error('Error:', e.message ?? e)
  process.exit(1)
})

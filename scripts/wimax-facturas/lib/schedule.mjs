const BOGOTA_TIME_ZONE = 'America/Bogota'

const BLOCKING_JOB_STATES = new Set([
  'en_cola',
  'preparando',
  'esperando_aprobacion',
  'aprobada',
  'verificando',
  'bloqueada_duplicado',
  'emitida_sin_cufe',
  'requiere_revision',
  'error',
])

function bogotaParts(now) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: BOGOTA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  return Object.fromEntries(
    formatter
      .formatToParts(now)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)])
  )
}

function dateKey(parts) {
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

function previousDateKey(parts) {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day - 1))
    .toISOString()
    .slice(0, 10)
}

export function parseClock(value) {
  const match = String(value ?? '').trim().match(/^([01]\d|2[0-3]):([0-5]\d)$/)
  if (!match) throw new Error('CONFIG: WIMAX_END_OF_DAY_TIME debe ser HH:MM')
  return Number(match[1]) * 60 + Number(match[2])
}

export function dailyWindow({
  now = new Date(),
  start = '21:00',
  windowMinutes = 360,
} = {}) {
  if (!Number.isInteger(windowMinutes) || windowMinutes < 1 || windowMinutes > 720) {
    throw new Error('CONFIG: ventana de cierre invalida')
  }
  const startMinutes = parseClock(start)
  const parts = bogotaParts(now)
  const currentMinutes = parts.hour * 60 + parts.minute
  const sameDayElapsed = currentMinutes - startMinutes
  if (sameDayElapsed >= 0 && sameDayElapsed < windowMinutes) {
    return {
      active: true,
      elapsedMinutes: sameDayElapsed,
      businessDate: dateKey(parts),
    }
  }

  const overnightElapsed = currentMinutes + 24 * 60 - startMinutes
  if (overnightElapsed >= 0 && overnightElapsed < windowMinutes) {
    return {
      active: true,
      elapsedMinutes: overnightElapsed,
      businessDate: previousDateKey(parts),
    }
  }

  return { active: false, elapsedMinutes: null, businessDate: null }
}

export function shutdownBlockers(jobs) {
  return (jobs ?? []).filter((job) => BLOCKING_JOB_STATES.has(job.estado))
}

export function shutdownDecision({
  jobs,
  quietElapsedSeconds,
  quietRequiredSeconds,
  reconciliationScheduled,
}) {
  const blockers = shutdownBlockers(jobs)
  if (blockers.length > 0) return { allowed: false, reason: 'trabajos_pendientes', blockers }
  if (reconciliationScheduled) return { allowed: false, reason: 'conciliacion_pendiente', blockers }
  if (quietElapsedSeconds < quietRequiredSeconds) {
    return { allowed: false, reason: 'esperando_lote', blockers }
  }
  return { allowed: true, reason: 'seguro', blockers }
}

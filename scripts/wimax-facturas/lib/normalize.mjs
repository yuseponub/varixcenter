export function digitsOnly(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits || null
}

export function textOrNull(value) {
  const text = String(value ?? '').trim()
  return text || null
}

export function normalizeKey(value) {
  return String(value ?? '').trim().toUpperCase()
}

export function normalizeName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function numericValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (value === null || value === undefined) return null

  let text = String(value).trim().replace(/\s/g, '')
  if (!text) return null
  const lastComma = text.lastIndexOf(',')
  const lastDot = text.lastIndexOf('.')
  if (lastComma > lastDot) {
    text = text.replace(/\./g, '').replace(',', '.')
  } else {
    text = text.replace(/,/g, '')
  }
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : null
}

export function dateOnly(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  const text = String(value ?? '').trim()
  if (!text) return null
  const iso = text.match(/^(\d{4})[-/]([01]\d)[-/]([0-3]\d)/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const latin = text.match(/^([0-3]?\d)[-/]([01]?\d)[-/](\d{4})/)
  if (latin) {
    return `${latin[3]}-${latin[2].padStart(2, '0')}-${latin[1].padStart(2, '0')}`
  }
  return null
}

export function normalizeInvoiceNumber(type, number) {
  const raw = normalizeKey(number).replace(/\s+/g, '')
  if (!raw) return null
  if (/^FE\d+$/.test(raw)) return raw
  if (normalizeKey(type) === 'FE' && /^\d+$/.test(raw)) return `FE${raw}`
  return raw
}

export function buildCustomerCode(cedula, firstNames) {
  const digits = digitsOnly(cedula)
  const letters = normalizeName(firstNames).replace(/[^A-Z]/g, '')
  if (!digits || digits.length < 2 || letters.length < 3) return null
  return `${digits.slice(0, 2)}${letters.slice(0, 3)}`
}

export function splitPatientName(patient) {
  const firstNames = String(patient?.nombre ?? '').trim().split(/\s+/).filter(Boolean)
  const lastNames = String(patient?.apellido ?? '').trim().split(/\s+/).filter(Boolean)
  return {
    primerNombre: firstNames[0] ?? '',
    segundoNombre: firstNames.slice(1).join(' '),
    primerApellido: lastNames[0] ?? '',
    segundoApellido: lastNames.slice(1).join(' '),
  }
}

export function amountEqual(left, right) {
  return Math.abs(Number(left) - Number(right)) < 0.005
}

export function addDays(dateText, days) {
  const date = new Date(`${dateText}T12:00:00`)
  if (Number.isNaN(date.getTime())) throw new Error('Fecha de pago invalida')
  date.setDate(date.getDate() + days)
  return dateOnly(date)
}

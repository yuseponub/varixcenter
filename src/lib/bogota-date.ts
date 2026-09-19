/**
 * Fechas en America/Bogota. Colombia usa UTC-5 fijo (sin horario de verano),
 * así que el desplazamiento se puede aplicar aritméticamente.
 */
const OFFSET_MS = 5 * 3600_000

/** Fecha de hoy (YYYY-MM-DD) en Bogotá. */
export function bogotaToday(): string {
  return new Date(Date.now() - OFFSET_MS).toISOString().slice(0, 10)
}

/** Límites ISO (UTC) del día calendario de Bogotá. */
export function bogotaDayBounds(fecha: string): { start: string; end: string } {
  return {
    start: new Date(`${fecha}T00:00:00-05:00`).toISOString(),
    end: new Date(`${fecha}T23:59:59.999-05:00`).toISOString(),
  }
}

/** HH:MM en Bogotá a partir de un timestamp ISO. */
export function bogotaHHMM(iso: string): string {
  return new Date(new Date(iso).getTime() - OFFSET_MS).toISOString().slice(11, 16)
}

export function isValidIsoDate(value: string | undefined): value is string {
  return (
    !!value &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  )
}

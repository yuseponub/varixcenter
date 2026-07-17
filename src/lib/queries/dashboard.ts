import { createClient } from '@/lib/supabase/server'

/**
 * Queries del dashboard operativo: lo que el staff necesita ver al abrir
 * el sistema (citas de hoy, pagos de hoy, estado del sync con Access).
 * Colombia es UTC-5 fijo (sin horario de verano).
 */

function bogotaTodayBounds(): { start: string; end: string; date: string } {
  const now = new Date(Date.now() - 5 * 3600_000)
  const date = now.toISOString().slice(0, 10)
  return {
    date,
    start: new Date(`${date}T00:00:00-05:00`).toISOString(),
    end: new Date(`${date}T23:59:59.999-05:00`).toISOString(),
  }
}

export interface TodayAppointment {
  id: string
  fecha_hora_inicio: string
  estado: string
  motivo_consulta: string | null
  patient: { id: string; nombre: string; apellido: string } | null
  doctor_id: string | null
}

export async function getTodayAppointments(): Promise<TodayAppointment[]> {
  const supabase = await createClient()
  const { start, end } = bogotaTodayBounds()

  const { data, error } = await supabase
    .from('appointments')
    .select(
      'id, fecha_hora_inicio, estado, motivo_consulta, doctor_id, patient:patients(id, nombre, apellido)'
    )
    .gte('fecha_hora_inicio', start)
    .lte('fecha_hora_inicio', end)
    .neq('estado', 'cancelada')
    .order('fecha_hora_inicio', { ascending: true })
    .limit(50)

  if (error) {
    console.error('getTodayAppointments error:', error)
    return []
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []) as any
}

export interface TodayPaymentsSummary {
  count: number
  total: number
}

export async function getTodayPaymentsSummary(): Promise<TodayPaymentsSummary> {
  const supabase = await createClient()
  const { start, end } = bogotaTodayBounds()

  const { data, error } = await supabase
    .from('payments')
    .select('total, estado')
    .gte('created_at', start)
    .lte('created_at', end)
    .eq('estado', 'activo')

  if (error) {
    console.error('getTodayPaymentsSummary error:', error)
    return { count: 0, total: 0 }
  }
  const rows = data ?? []
  return {
    count: rows.length,
    total: rows.reduce((sum, r) => sum + Number(r.total ?? 0), 0),
  }
}

export interface LastSyncRun {
  started_at: string
  finished_at: string | null
  ok: boolean | null
  stats: Record<string, number> | null
}

export async function getLastSyncRun(): Promise<LastSyncRun | null> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('sync_runs')
    .select('started_at, finished_at, ok, stats')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    // La tabla puede no existir aun en este entorno; el widget simplemente no se muestra
    return null
  }
  return data
}

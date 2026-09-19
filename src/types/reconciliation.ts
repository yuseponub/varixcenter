/**
 * Conciliación diaria agenda vs pagos.
 *
 * Cruza las citas del día (estado de la agenda), la marca "atendido" del
 * médico (patient_attendances) y los pagos registrados ese día, y clasifica
 * cada cita y cada pago en una categoría para detectar discrepancias antes
 * del cierre de caja.
 */

export type ReconciliationCategory =
  | 'asistio_sin_pago'
  | 'pago_sin_marcar_agenda'
  | 'no_asistio_con_pago'
  | 'sin_estado_sin_pago'
  | 'ok'
  | 'ok_no_asistio'

export interface ReconciliationAppointment {
  id: string
  patient_id: string
  patient_nombre: string
  patient_apellido: string
  patient_cedula: string | null
  hora: string // HH:MM en America/Bogota
  estado: string
  doctor_nombre: string
  motivo_consulta: string | null
  /** Servicios agendados, ya formateados ("Consulta x1, ECOR x2") */
  servicios: string
}

export interface ReconciliationPayment {
  id: string
  patient_id: string
  appointment_id: string | null
  patient_nombre: string
  patient_apellido: string
  numero_factura: string
  total: number
  estado: string
  hora: string // HH:MM en America/Bogota
  /** Ítems del pago, ya formateados */
  servicios: string
}

export interface ReconciliationAttendance {
  patient_id: string
  hora: string // HH:MM
  marked_by_nombre: string
}

export interface ReconciliationInput {
  fecha: string
  appointments: ReconciliationAppointment[]
  payments: ReconciliationPayment[]
  attendances: ReconciliationAttendance[]
  medias_ventas_count: number
  medias_ventas_total: number
}

export interface ReconciliationRow {
  category: ReconciliationCategory
  appointment: ReconciliationAppointment
  attendance: ReconciliationAttendance | null
  payment: ReconciliationPayment | null
  /** true si el pago está enlazado por appointment_id; false si solo coincide el paciente */
  payment_linked: boolean
}

export interface ReconciliationTotals {
  citas: number
  por_estado: Record<string, number>
  marcados_por_medico: number
  pagos_activos: number
  pagos_activos_total: number
  pagos_enlazados_a_cita: number
  pagos_anulados: number
  medias_ventas_count: number
  medias_ventas_total: number
  discrepancias: number
}

export interface ReconciliationReport {
  fecha: string
  totals: ReconciliationTotals
  rows: ReconciliationRow[]
  /** Pagos activos de pacientes que no tienen ninguna cita ese día */
  pagos_sin_cita: ReconciliationPayment[]
  /** Pacientes con más de un pago activo el mismo día (posible cobro doble) */
  pagos_dobles: Array<{
    patient_id: string
    patient_nombre: string
    patient_apellido: string
    payments: ReconciliationPayment[]
  }>
  pagos_anulados: ReconciliationPayment[]
}

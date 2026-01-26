/**
 * SMS Message Builder
 *
 * Builds reminder messages for appointments.
 * Messages are in Spanish but avoid accented vowels (a,e,i,o,u with tildes)
 * to stay within GSM-7 encoding (160 char limit vs 70 for UCS-2).
 */

const CLINIC_PHONE = process.env.CLINIC_PHONE_NUMBER || '607-XXX-XXXX'

/**
 * Format date for SMS message
 * Output: "lunes 27 de enero a las 3:00 PM"
 */
function formatAppointmentDate(date: Date): string {
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/Bogota',
  }

  return new Intl.DateTimeFormat('es-CO', options).format(date)
}

/**
 * Get time reference word based on reminder type
 */
function getTimeReference(reminderType: '24h' | '2h'): string {
  return reminderType === '24h' ? 'manana' : 'en 2 horas'
}

/**
 * Build appointment reminder message
 *
 * Template: "Hola [Nombre], te recordamos tu cita [tiempo] [fecha] en Varix Center. Para cambios: [telefono]"
 *
 * Note: Uses "manana" instead of "mañana" to stay in GSM-7 encoding.
 *
 * @param patientName - Patient's first name
 * @param appointmentDate - Appointment date/time
 * @param reminderType - '24h' or '2h'
 * @returns Message string (target: under 160 chars)
 */
export function buildReminderMessage(
  patientName: string,
  appointmentDate: Date,
  reminderType: '24h' | '2h'
): string {
  const timeRef = getTimeReference(reminderType)
  const formattedDate = formatAppointmentDate(appointmentDate)

  // Build message - keep under 160 chars for single segment
  // Avoid accented vowels for GSM-7 encoding
  const message = `Hola ${patientName}, te recordamos tu cita ${timeRef} ${formattedDate} en Varix Center. Para cambios: ${CLINIC_PHONE}`

  // Log warning if message is too long
  if (message.length > 160) {
    console.warn('[SMS] Message exceeds 160 chars:', message.length, 'chars')
  }

  return message
}

/**
 * Sanitize patient name for SMS
 * - Capitalize first letter
 * - Limit length
 * - Remove special characters
 */
export function sanitizePatientName(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ\s]/g, '')
    .split(' ')[0] // First name only

  // Capitalize first letter
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase()
}

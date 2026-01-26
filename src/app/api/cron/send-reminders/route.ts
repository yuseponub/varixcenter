/**
 * Cron API Route: Send Appointment Reminders
 *
 * Triggered by Vercel Cron every 15 minutes.
 * Sends SMS reminders for appointments 24h and 2h away.
 *
 * Authentication: Bearer token matching CRON_SECRET env var.
 *
 * @see vercel.json for cron schedule configuration
 */
import type { NextRequest } from 'next/server'
import { addMinutes } from 'date-fns'
import { sendSMS, isPermanentError } from '@/lib/twilio/sms'
import { buildReminderMessage, sanitizePatientName } from '@/lib/twilio/message-builder'
import {
  getAppointmentsNeedingReminder,
  getNotificationsForRetry,
  createNotification,
  updateNotificationStatus,
} from '@/lib/queries/notifications'
import type { ReminderType } from '@/types/notifications'

// Force dynamic rendering (no caching)
export const dynamic = 'force-dynamic'

// Allow up to 60 seconds for cron execution
export const maxDuration = 60

/**
 * Verify cron request authentication
 */
function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    console.error('[Cron] CRON_SECRET not configured')
    return false
  }

  return authHeader === `Bearer ${cronSecret}`
}

/**
 * Format phone number to E.164 format for Colombia
 * Input: "3001234567" or "+573001234567"
 * Output: "+573001234567"
 */
function formatPhoneE164(phone: string): string {
  // Remove all non-digits
  const digits = phone.replace(/\D/g, '')

  // If already has country code
  if (digits.startsWith('57') && digits.length === 12) {
    return `+${digits}`
  }

  // Add Colombia country code
  if (digits.length === 10 && digits.startsWith('3')) {
    return `+57${digits}`
  }

  // Return as-is if format unclear (will fail at Twilio with helpful error)
  return `+${digits}`
}

/**
 * Process reminders for a specific type (24h or 2h)
 */
async function processReminders(
  reminderType: ReminderType
): Promise<{ sent: number; failed: number; skipped: number }> {
  const results = { sent: 0, failed: 0, skipped: 0 }

  try {
    const appointments = await getAppointmentsNeedingReminder(reminderType)
    console.log(`[Cron] Found ${appointments.length} appointments for ${reminderType} reminder`)

    for (const apt of appointments) {
      // Skip if no phone number
      if (!apt.patients?.celular) {
        console.log(`[Cron] Skipping ${apt.id}: no phone number`)
        results.skipped++
        continue
      }

      // Build message
      const patientName = sanitizePatientName(apt.patients.nombre)
      const appointmentDate = new Date(apt.fecha_hora_inicio)
      const message = buildReminderMessage(patientName, appointmentDate, reminderType)
      const phoneE164 = formatPhoneE164(apt.patients.celular)

      // Create notification record (will fail if duplicate)
      const notification = await createNotification({
        appointment_id: apt.id,
        patient_id: apt.patients.id,
        tipo_recordatorio: reminderType,
        telefono_destino: phoneE164,
        mensaje: message,
      })

      if (!notification) {
        // Duplicate - already sent or pending
        results.skipped++
        continue
      }

      // Send SMS
      const smsResult = await sendSMS(phoneE164, message)

      if (smsResult.success) {
        // Update notification as sent
        await updateNotificationStatus(notification.id, {
          estado: 'enviado',
          twilio_message_sid: smsResult.messageSid || null,
          enviado_at: new Date().toISOString(),
          intentos: 1,
        })
        results.sent++
      } else {
        // Handle failure
        const shouldRetry = !isPermanentError(smsResult.errorCode ?? null)

        await updateNotificationStatus(notification.id, {
          estado: shouldRetry ? 'reintentando' : 'fallido',
          error_code: smsResult.errorCode ?? null,
          error_message: smsResult.errorMessage ?? null,
          intentos: 1,
          siguiente_reintento_at: shouldRetry
            ? addMinutes(new Date(), 30).toISOString()
            : null,
        })
        results.failed++
      }
    }
  } catch (error) {
    console.error(`[Cron] Error processing ${reminderType} reminders:`, error)
  }

  return results
}

/**
 * Process retry queue
 */
async function processRetries(): Promise<{ sent: number; failed: number }> {
  const results = { sent: 0, failed: 0 }

  try {
    const notifications = await getNotificationsForRetry()
    console.log(`[Cron] Found ${notifications.length} notifications to retry`)

    for (const notif of notifications) {
      // Retry send
      const smsResult = await sendSMS(notif.telefono_destino, notif.mensaje)

      if (smsResult.success) {
        await updateNotificationStatus(notif.id, {
          estado: 'enviado',
          twilio_message_sid: smsResult.messageSid || null,
          enviado_at: new Date().toISOString(),
          intentos: notif.intentos + 1,
        })
        results.sent++
      } else {
        // Mark as failed after retry (max 2 attempts)
        await updateNotificationStatus(notif.id, {
          estado: 'fallido',
          error_code: smsResult.errorCode ?? null,
          error_message: smsResult.errorMessage ?? null,
          intentos: notif.intentos + 1,
          siguiente_reintento_at: null,
        })
        results.failed++
      }
    }
  } catch (error) {
    console.error('[Cron] Error processing retries:', error)
  }

  return results
}

/**
 * GET handler for cron endpoint
 */
export async function GET(request: NextRequest) {
  // Verify authorization
  if (!isAuthorized(request)) {
    console.warn('[Cron] Unauthorized request')
    return new Response('Unauthorized', { status: 401 })
  }

  console.log('[Cron] Starting reminder job at', new Date().toISOString())

  const results = {
    timestamp: new Date().toISOString(),
    reminders_24h: { sent: 0, failed: 0, skipped: 0 },
    reminders_2h: { sent: 0, failed: 0, skipped: 0 },
    retries: { sent: 0, failed: 0 },
  }

  try {
    // Process 24h reminders
    results.reminders_24h = await processReminders('24h')

    // Process 2h reminders
    results.reminders_2h = await processReminders('2h')

    // Process retry queue
    results.retries = await processRetries()

    console.log('[Cron] Job completed:', results)

    return Response.json({
      success: true,
      ...results,
    })
  } catch (error) {
    console.error('[Cron] Job failed:', error)

    return Response.json(
      {
        success: false,
        error: 'Internal error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}

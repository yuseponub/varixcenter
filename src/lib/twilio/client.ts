/**
 * Twilio Client Configuration
 *
 * Singleton client for sending SMS via Twilio API.
 * Requires environment variables:
 * - TWILIO_ACCOUNT_SID
 * - TWILIO_AUTH_TOKEN
 * - TWILIO_PHONE_NUMBER
 */
import twilio from 'twilio'

let twilioClient: ReturnType<typeof twilio> | null = null

/**
 * Read credentials only when an SMS is actually going to be sent. Next.js
 * evaluates route modules while building, so constructing the client at module
 * load made a clean checkout impossible to validate without production secrets.
 */
export function getTwilioClient(): ReturnType<typeof twilio> | null {
  if (twilioClient) return twilioClient

  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim()
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim()
  if (!accountSid || !authToken) return null

  twilioClient = twilio(accountSid, authToken)
  return twilioClient
}

export function getTwilioPhoneNumber(): string | null {
  return process.env.TWILIO_PHONE_NUMBER?.trim() || null
}

/**
 * Check if Twilio is configured
 */
export function isTwilioConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
    process.env.TWILIO_AUTH_TOKEN?.trim() &&
    getTwilioPhoneNumber()
  )
}

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

// Validate environment variables at module load time
// This will throw during build if env vars are missing (which is desired)
const accountSid = process.env.TWILIO_ACCOUNT_SID
const authToken = process.env.TWILIO_AUTH_TOKEN
export const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER

// In development, allow missing credentials with warning
if (!accountSid || !authToken) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Missing Twilio credentials: TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required')
  }
  console.warn('[Twilio] Missing credentials - SMS sending will be disabled')
}

// Create client only if credentials exist
export const twilioClient = accountSid && authToken ? twilio(accountSid, authToken) : null

/**
 * Check if Twilio is configured
 */
export function isTwilioConfigured(): boolean {
  return twilioClient !== null && !!TWILIO_PHONE_NUMBER
}

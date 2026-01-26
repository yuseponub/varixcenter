/**
 * SMS Sending Functions
 *
 * Wraps Twilio API with proper error handling and logging.
 */
import { twilioClient, TWILIO_PHONE_NUMBER, isTwilioConfigured } from './client'
import type { SendSMSResult } from '@/types/notifications'

// Twilio error codes that should NOT be retried
// https://www.twilio.com/docs/api/errors
const PERMANENT_ERROR_CODES = [
  21211, // Invalid 'To' phone number
  21212, // Invalid 'From' phone number
  21214, // 'To' phone number cannot be reached
  21217, // Phone number not verified
  21608, // Unverified phone number
]

/**
 * Send SMS via Twilio
 *
 * @param to - Recipient phone number in E.164 format (+573001234567)
 * @param body - Message body (max 160 chars recommended)
 * @returns SendSMSResult with success status and messageSid or error details
 */
export async function sendSMS(to: string, body: string): Promise<SendSMSResult> {
  // Check if Twilio is configured
  if (!isTwilioConfigured()) {
    console.warn('[SMS] Twilio not configured, skipping send to:', to)
    return {
      success: false,
      errorCode: 0,
      errorMessage: 'Twilio not configured',
    }
  }

  if (!twilioClient || !TWILIO_PHONE_NUMBER) {
    return {
      success: false,
      errorCode: 0,
      errorMessage: 'Twilio client not initialized',
    }
  }

  try {
    const message = await twilioClient.messages.create({
      body,
      from: TWILIO_PHONE_NUMBER,
      to,
    })

    console.log('[SMS] Sent successfully:', {
      sid: message.sid,
      to,
      status: message.status,
    })

    return {
      success: true,
      messageSid: message.sid,
    }
  } catch (error) {
    // Handle Twilio-specific errors
    if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
      const twilioError = error as { code: number; message: string }

      console.error('[SMS] Twilio error:', {
        code: twilioError.code,
        message: twilioError.message,
        to,
      })

      return {
        success: false,
        errorCode: twilioError.code,
        errorMessage: twilioError.message,
      }
    }

    // Handle unexpected errors
    console.error('[SMS] Unexpected error:', error)
    return {
      success: false,
      errorCode: -1,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Check if an error code is permanent (should not retry)
 */
export function isPermanentError(errorCode: number | null): boolean {
  if (errorCode === null) return false
  return PERMANENT_ERROR_CODES.includes(errorCode)
}

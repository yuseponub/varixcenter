# Phase 9: Notifications - Research

**Researched:** 2026-01-26
**Domain:** SMS Notifications via Twilio + Vercel Cron
**Confidence:** HIGH

## Summary

This phase implements an automated SMS appointment reminder system using the existing Twilio account and Vercel Cron for scheduling. The system will send two reminders per appointment (24 hours and 2 hours before) with one retry attempt for failed messages.

The research confirms that Twilio's Node.js SDK (`twilio` npm package) is the standard approach for sending SMS programmatically. For scheduling, Vercel Cron jobs are the recommended approach given the user already has Vercel hosting. The cron job will call an API route that queries upcoming appointments and sends SMS reminders.

Key architectural decision: Use Vercel Cron to trigger a server-side API route rather than Twilio's built-in Message Scheduling feature. This is because: (1) Message Scheduling requires a Twilio Messaging Service which adds complexity, (2) our approach is simpler to implement and debug, (3) we need to track notification history in our database anyway.

**Primary recommendation:** Use `twilio` npm package with Vercel Cron job running every 15 minutes to check for appointments needing reminders. Store notification history in a `notifications` table with status tracking.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| twilio | ^5.x | SMS sending | Official Twilio Node.js SDK |
| date-fns | ^4.1.0 | Date calculations | Already in project, no new dependency |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| date-fns-tz | ^3.x | Timezone handling | Optional - only if timezone issues arise |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Vercel Cron | Twilio Message Scheduling | Requires Messaging Service, more complex setup |
| Vercel Cron | External cron service | Adds external dependency, costs |
| Per-minute cron | Per-15-minute cron | Hobby plan has hourly precision only; 15-min is reasonable granularity |

**Installation:**
```bash
npm install twilio
```

**Environment Variables:**
```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1xxxxxxxxxx
CRON_SECRET=random_string_16_chars_minimum
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/
│   ├── api/
│   │   └── cron/
│   │       └── send-reminders/
│   │           └── route.ts        # Cron endpoint (GET)
│   └── (protected)/
│       └── notificaciones/
│           └── page.tsx            # Notification history page
├── components/
│   └── notifications/
│       ├── notifications-table.tsx # History table with filters
│       └── notification-badge.tsx  # Status badge component
├── lib/
│   ├── twilio/
│   │   └── client.ts              # Twilio client singleton
│   ├── queries/
│   │   └── notifications.ts       # Database queries
│   └── validations/
│       └── notification.ts        # Zod schemas
└── types/
    └── notifications.ts           # TypeScript types
```

### Pattern 1: Vercel Cron with CRON_SECRET Authentication
**What:** Secure cron endpoint that verifies requests come from Vercel
**When to use:** All cron job API routes
**Example:**
```typescript
// Source: https://vercel.com/docs/cron-jobs/manage-cron-jobs
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  // Process reminders...
  return Response.json({ success: true, sent: count })
}
```

### Pattern 2: Twilio SMS Sending with Error Handling
**What:** Send SMS with proper error handling and logging
**When to use:** All SMS operations
**Example:**
```typescript
// Source: https://www.twilio.com/docs/messaging/quickstart/node
import twilio from 'twilio'

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
)

async function sendSMS(to: string, body: string): Promise<{
  success: boolean
  messageSid?: string
  errorCode?: number
  errorMessage?: string
}> {
  try {
    const message = await client.messages.create({
      body,
      from: process.env.TWILIO_PHONE_NUMBER,
      to,
    })
    return { success: true, messageSid: message.sid }
  } catch (error) {
    if (error instanceof twilio.RestException) {
      return {
        success: false,
        errorCode: error.code,
        errorMessage: error.message,
      }
    }
    throw error
  }
}
```

### Pattern 3: Notification Status Tracking
**What:** Track each notification attempt with status
**When to use:** Every SMS send operation
**Example:**
```typescript
// Notification statuses matching Twilio + our needs
type NotificationStatus =
  | 'pendiente'    // Scheduled but not yet sent
  | 'enviado'      // Sent to Twilio successfully
  | 'entregado'    // Delivery confirmed (optional - requires webhook)
  | 'fallido'      // Failed after retries
  | 'reintentando' // Will retry

interface Notification {
  id: string
  appointment_id: string
  patient_id: string
  tipo_recordatorio: '24h' | '2h'  // Which reminder
  telefono_destino: string
  mensaje: string
  estado: NotificationStatus
  twilio_message_sid: string | null
  error_code: number | null
  error_message: string | null
  intentos: number
  enviado_at: string | null
  created_at: string
}
```

### Pattern 4: Appointment Query for Reminders
**What:** Find appointments needing reminders in a time window
**When to use:** Cron job execution
**Example:**
```typescript
// Query appointments needing 24h reminder
// Window: 23h30m to 24h30m before appointment
async function getAppointmentsNeedingReminder(
  reminderType: '24h' | '2h'
): Promise<AppointmentForReminder[]> {
  const now = new Date()
  const hoursAhead = reminderType === '24h' ? 24 : 2

  // Window: 30 min before to 30 min after target time
  const windowStart = addHours(now, hoursAhead - 0.5)
  const windowEnd = addHours(now, hoursAhead + 0.5)

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('appointments')
    .select(`
      id,
      fecha_hora_inicio,
      patients!inner (
        id,
        nombre,
        apellido,
        celular
      )
    `)
    .gte('fecha_hora_inicio', windowStart.toISOString())
    .lte('fecha_hora_inicio', windowEnd.toISOString())
    .in('estado', ['programada', 'confirmada'])
    // Exclude if reminder already sent
    .not('id', 'in', (
      supabase
        .from('notifications')
        .select('appointment_id')
        .eq('tipo_recordatorio', reminderType)
        .in('estado', ['enviado', 'entregado'])
    ))

  if (error) throw error
  return data ?? []
}
```

### Anti-Patterns to Avoid
- **Storing phone numbers without E.164 format:** Always store as +CountryCode followed by number (e.g., +573001234567)
- **Sending reminders for canceled appointments:** Always check appointment status before sending
- **No idempotency:** Cron can run twice; use database check to prevent duplicate sends
- **Hardcoding message content:** Keep message template configurable

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SMS sending | Raw HTTP to Twilio API | `twilio` npm package | Handles auth, retries, error codes |
| Phone number formatting | String manipulation | E.164 format validation in Zod | Edge cases with country codes |
| Date calculations | Manual math | `date-fns` addHours/subHours | DST, edge cases |
| Cron scheduling | setInterval in server | Vercel Cron | Serverless-friendly, managed |

**Key insight:** Phone number handling has many edge cases (country codes, formatting, validation). Always use E.164 format (+573001234567) and validate at input time.

## Common Pitfalls

### Pitfall 1: SMS Character Encoding
**What goes wrong:** Spanish characters like accents (a, i, u) force UCS-2 encoding, reducing max length from 160 to 70 characters
**Why it happens:** GSM-7 (standard SMS encoding) includes n and some accents but NOT a, i, u
**How to avoid:**
- Keep messages under 70 characters to be safe, or
- Avoid accented vowels: use "manana" instead of "manana", "clinica" instead of "clinica"
- Or accept multi-segment messages (charged per segment)
**Warning signs:** Messages being split into multiple segments unexpectedly

### Pitfall 2: Duplicate Reminders
**What goes wrong:** Cron runs multiple times, or runs during deployment, sending duplicate reminders
**Why it happens:** Vercel's event-driven system can occasionally deliver same cron event twice; new deployments don't interrupt running crons
**How to avoid:**
- Check database before sending: "has this reminder already been sent?"
- Use notification record as idempotency key (appointment_id + tipo_recordatorio)
- Mark notification as 'enviado' immediately after Twilio accepts
**Warning signs:** Patients receiving same reminder twice

### Pitfall 3: Timezone Confusion
**What goes wrong:** Reminders sent at wrong time relative to appointment
**Why it happens:** Mixing local time and UTC, or cron running in UTC while appointments stored in local time
**How to avoid:**
- Appointments are already stored as TIMESTAMPTZ (with timezone) in Supabase
- Vercel Cron always runs in UTC
- Use ISO strings for all comparisons
- The existing codebase stores `fecha_hora_inicio` as TIMESTAMPTZ which handles this
**Warning signs:** Reminders being early/late by hours matching UTC offset

### Pitfall 4: Rate Limiting and Throughput
**What goes wrong:** Twilio rate limits hit, messages queued but not sent
**Why it happens:** Sending too many messages too quickly (Twilio has per-second limits)
**How to avoid:**
- For this clinic's scale (likely <50 appointments/day), not a concern
- If needed: add small delay between sends (100ms)
- Twilio's default rate limit is 1 message/second for standard numbers
**Warning signs:** 429 errors from Twilio, messages stuck in 'queued' status

### Pitfall 5: Failed Retry Logic
**What goes wrong:** Retries happen immediately or never, or retry same invalid number
**Why it happens:** Not distinguishing between permanent failures (invalid number) and temporary failures (carrier issue)
**How to avoid:**
- Check Twilio error codes: 21211 (invalid number) = don't retry; 30008 (unknown error) = retry
- Schedule retry 30 minutes later, not immediately
- Max 1 retry as per requirements
**Warning signs:** Repeated failed attempts to same invalid number

## Code Examples

Verified patterns from official sources:

### Twilio Client Setup
```typescript
// src/lib/twilio/client.ts
// Source: https://www.twilio.com/docs/messaging/quickstart/node
import twilio from 'twilio'

if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
  throw new Error('Missing Twilio credentials in environment variables')
}

export const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
)

export const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER
```

### Message Template
```typescript
// Based on CONTEXT.md requirements
function buildReminderMessage(
  patientName: string,
  appointmentDate: Date,
  reminderType: '24h' | '2h',
  clinicPhone: string
): string {
  // Format: "Lunes 27 de enero a las 3:00 PM"
  const dateFormatter = new Intl.DateTimeFormat('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })

  const formattedDate = dateFormatter.format(appointmentDate)
  const timeWord = reminderType === '24h' ? 'manana' : 'en 2 horas'

  // Keep under 160 chars, avoid accented vowels for GSM-7
  return `Hola ${patientName}, te recordamos tu cita ${timeWord} ${formattedDate} en Varix Center. Para cambios: ${clinicPhone}`
}
```

### Cron API Route
```typescript
// src/app/api/cron/send-reminders/route.ts
// Source: https://vercel.com/docs/cron-jobs/manage-cron-jobs
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { twilioClient, TWILIO_PHONE_NUMBER } from '@/lib/twilio/client'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const results = {
    checked24h: 0,
    checked2h: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
  }

  try {
    // Process 24h reminders
    const appointments24h = await getAppointmentsNeedingReminder('24h')
    results.checked24h = appointments24h.length

    for (const apt of appointments24h) {
      const result = await sendReminder(apt, '24h')
      if (result.sent) results.sent++
      else if (result.skipped) results.skipped++
      else results.failed++
    }

    // Process 2h reminders
    const appointments2h = await getAppointmentsNeedingReminder('2h')
    results.checked2h = appointments2h.length

    for (const apt of appointments2h) {
      const result = await sendReminder(apt, '2h')
      if (result.sent) results.sent++
      else if (result.skipped) results.skipped++
      else results.failed++
    }

    // Process retries
    await processRetries()

    return Response.json({ success: true, ...results })
  } catch (error) {
    console.error('Cron error:', error)
    return Response.json({ success: false, error: 'Internal error' }, { status: 500 })
  }
}
```

### vercel.json Configuration
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    {
      "path": "/api/cron/send-reminders",
      "schedule": "*/15 * * * *"
    }
  ]
}
```
Note: On Hobby plan, Vercel may invoke this anywhere within the hour. For appointment reminders, this is acceptable since we use a 1-hour window for reminder eligibility.

### Notifications Table Schema
```sql
-- Migration: XXX_notifications.sql
CREATE TYPE public.notification_status AS ENUM (
  'pendiente',
  'enviado',
  'entregado',
  'fallido',
  'reintentando'
);

CREATE TYPE public.reminder_type AS ENUM (
  '24h',
  '2h'
);

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,

  -- Notification details
  tipo_recordatorio reminder_type NOT NULL,
  telefono_destino VARCHAR(15) NOT NULL,  -- E.164 format
  mensaje TEXT NOT NULL,

  -- Status tracking
  estado notification_status NOT NULL DEFAULT 'pendiente',
  twilio_message_sid VARCHAR(50),
  error_code INTEGER,
  error_message TEXT,
  intentos INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  enviado_at TIMESTAMPTZ,
  siguiente_reintento_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Unique constraint: one notification per appointment per type
  CONSTRAINT unique_notification_per_appointment_type
    UNIQUE (appointment_id, tipo_recordatorio)
);

-- Indexes
CREATE INDEX idx_notifications_appointment ON public.notifications(appointment_id);
CREATE INDEX idx_notifications_patient ON public.notifications(patient_id);
CREATE INDEX idx_notifications_estado ON public.notifications(estado);
CREATE INDEX idx_notifications_created_at ON public.notifications(created_at DESC);
CREATE INDEX idx_notifications_retry ON public.notifications(siguiente_reintento_at)
  WHERE estado = 'reintentando';

-- RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- All staff can view notifications
CREATE POLICY "Staff can view notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'medico', 'enfermera', 'secretaria')
    )
  );

-- Only system (service role) can insert/update
-- Cron job will use service role or supabase admin
CREATE POLICY "System can manage notifications"
  ON public.notifications FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| node-cron in Express | Vercel Cron | 2023 | No server to manage, built-in to Vercel |
| Custom scheduling logic | Twilio Message Scheduling | 2022 | Simpler for simple use cases (but adds Messaging Service requirement) |
| Polling for delivery status | Webhook callbacks | Always available | More efficient, real-time status |

**Deprecated/outdated:**
- Using `moment.js` for dates: Use `date-fns` instead (already in project)
- Twilio REST API v1: Use v2 (default in current SDK)

## Open Questions

Things that couldn't be fully resolved:

1. **Twilio Number Registration for Colombia**
   - What we know: SMS to Colombia works, user has existing Twilio account
   - What's unclear: Whether the Twilio number is already registered for Colombia SMS
   - Recommendation: Test with user's existing setup; Twilio handles carrier routing

2. **Delivery Confirmation**
   - What we know: Twilio can send delivery status via webhook
   - What's unclear: Whether user wants real-time delivery status updates
   - Recommendation: For MVP, track 'enviado' status only. Add webhook for delivery confirmation in future phase.

3. **Message Character Count in Spanish**
   - What we know: Accented vowels (a,i,u) force UCS-2 encoding (70 char limit)
   - What's unclear: Whether user prefers shorter messages or accepts multi-segment billing
   - Recommendation: Design messages under 70 characters to avoid surprise costs; use "manana" instead of "manana"

## Sources

### Primary (HIGH confidence)
- [Twilio Messaging Quickstart Node.js](https://www.twilio.com/docs/messaging/quickstart/node) - SDK usage, authentication
- [Twilio Messages Resource](https://www.twilio.com/docs/messaging/api/message-resource) - Message statuses, error codes
- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs) - Configuration, setup
- [Vercel Managing Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs) - Security, CRON_SECRET, duration
- [Vercel Cron Usage and Pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing) - Plan limits

### Secondary (MEDIUM confidence)
- [Twilio SMS Character Limit](https://www.twilio.com/docs/glossary/what-sms-character-limit) - GSM-7 vs UCS-2 encoding
- [Twilio Appointment Reminders Tutorial](https://www.twilio.com/docs/messaging/tutorials/appointment-reminders/node) - Architecture patterns

### Tertiary (LOW confidence)
- WebSearch results on Twilio error handling best practices - Verified with official docs
- WebSearch results on Next.js 15 route handlers - Verified with official docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Official Twilio docs + Vercel docs
- Architecture: HIGH - Verified patterns from official tutorials
- Pitfalls: MEDIUM - Based on official docs + verified community patterns
- Database schema: HIGH - Follows existing codebase patterns

**Research date:** 2026-01-26
**Valid until:** 2026-02-26 (30 days - stable libraries)

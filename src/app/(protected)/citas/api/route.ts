import { NextRequest, NextResponse } from 'next/server'
import { getAppointmentsForCalendar } from '@/lib/queries/appointments'
import { getOutlookSyncStatus } from '@/lib/queries/outlook'

/**
 * GET /citas/api - Fetch calendar events
 *
 * Query params:
 * - start: ISO date string (required)
 * - end: ISO date string (required)
 * - doctor_id: UUID (optional filter)
 *
 * Returns: { events: CalendarEvent[] }
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const start = searchParams.get('start')
  const end = searchParams.get('end')
  const doctorId = searchParams.get('doctor_id') || undefined

  // Validate required params
  if (!start || !end) {
    return NextResponse.json(
      { error: 'start and end parameters are required' },
      { status: 400 }
    )
  }

  try {
    const [events, outlookStatus] = await Promise.all([
      getAppointmentsForCalendar(start, end, doctorId),
      getOutlookSyncStatus(),
    ])
    return NextResponse.json({ events, outlookStatus })
  } catch (error) {
    console.error('Error fetching calendar events:', error)
    return NextResponse.json(
      { error: 'Error fetching appointments' },
      { status: 500 }
    )
  }
}

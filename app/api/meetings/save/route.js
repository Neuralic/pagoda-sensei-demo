import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabaseServer'

export async function POST(req) {
  try {
    const json = await req.json().catch(() => ({}))
    const {
      eventId,
      meetLink,
      tourGuideId,
      userId,
      startTime,
      endTime,
    } = json || {}

    // Validate required fields
    const missing = []
    if (!eventId) missing.push('eventId')
    if (!meetLink) missing.push('meetLink')
    if (!tourGuideId) missing.push('tourGuideId')
    if (!userId) missing.push('userId')
    if (!startTime) missing.push('startTime')
    if (!endTime) missing.push('endTime')

    if (missing.length > 0) {
      return NextResponse.json({
        success: false,
        error: `Missing required fields: ${missing.join(', ')}`,
      }, { status: 400 })
    }

    const supabase = getSupabaseServer()

    // Map to snake_case columns commonly used in this project
    const payload = {
      event_id: String(eventId),
      meet_link: String(meetLink),
      tour_guide_id: String(tourGuideId),
      user_id: String(userId),
      start_time: new Date(startTime).toISOString(),
      end_time: new Date(endTime).toISOString(),
    }

    const { data, error } = await supabase
      .from('meetings')
      .insert(payload)
      .select()
      .single()

    if (error) {
      return NextResponse.json({
        success: false,
        error: 'Failed to save meeting',
        detail: error.message,
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      meetLink: payload.meet_link,
      eventId: payload.event_id,
      startTime: payload.start_time,
      endTime: payload.end_time,
      id: data?.id ?? null,
    })
  } catch (err) {
    console.error('[Meetings] save error:', err)
    return NextResponse.json({
      success: false,
      error: 'Unexpected server error',
      detail: err instanceof Error ? err.message : String(err),
    }, { status: 500 })
  }
}

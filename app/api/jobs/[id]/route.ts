import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabaseServer'
import { cookies } from 'next/headers'
import { UpdateJobData } from '@/app/types'
import { denyIfActivityNotApproved } from '@/lib/activity-approval'
import {
  assertJobItineraryAccess,
  denyActivityUnlessAdmin,
  requireSessionActor,
} from '@/lib/itinerary-access'
import { pruneItineraryPdfFieldsAfterActivityRemoved } from '@/lib/prune-itinerary-pdf-on-activity-remove'
import { canonicalizeActivityTypeLabel } from '@/lib/tour-activity-types'
import { withResolvedTourLinkedFields } from '@/lib/tour-linked-line-fields'

export const runtime = 'nodejs'

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    if (!id) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 })

    const jar = await cookies()
    const uid = jar.get('userId')?.value
    const r = jar.get('role')?.value
    const supabase = getSupabaseServer()
    if (uid && (r === 'agent' || r === 'guide')) {
      const activityBlock = await denyIfActivityNotApproved(uid, supabase)
      if (activityBlock) return activityBlock
    }

    const { data, error } = await supabase
      .from('jobs')
      .select(`id, itinerary_id, name, activity_type, job_available, start_time, end_time, location, description, images, min_price, max_price, languages, group_size, notes, is_active, created_at, updated_at, tour_id, tour_field_snapshot, released_at, adults, children, infants, tour:tour_id(id, user_id, name, description)`)
      .eq('id', id)
      .single()

    if (error) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })

    const tourJoin = (data as { tour?: { name?: string | null; description?: string | null } | { name?: string | null; description?: string | null }[] }).tour;
    const tourRow = Array.isArray(tourJoin) ? tourJoin[0] : tourJoin;

    return NextResponse.json({
      ok: true,
      job: withResolvedTourLinkedFields({ ...data, tour: tourRow }),
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unexpected error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSessionActor();
    if (!session.ok) return session.response;

    const { id } = await context.params
    if (!id) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 })

    const supabase = getSupabaseServer()
    const activityBlock = await denyActivityUnlessAdmin(session.actor, supabase)
    if (activityBlock) return activityBlock

    const access = await assertJobItineraryAccess(supabase, session.actor, id, 'write')
    if (!access.ok) return access.response

    const { data: jobRow } = await supabase
      .from('jobs')
      .select('id, name, start_time, itinerary_id')
      .eq('id', id)
      .maybeSingle()

    const { error: deleteError } = await supabase
      .from('jobs')
      .delete()
      .eq('id', id)

    if (deleteError) return NextResponse.json({ ok: false, error: 'Database error' }, { status: 500 })

    if (jobRow?.itinerary_id) {
      try {
        await pruneItineraryPdfFieldsAfterActivityRemoved(supabase, {
          itineraryId: String(jobRow.itinerary_id),
          title: jobRow.name,
          activityDate: jobRow.start_time,
        })
      } catch (pruneErr) {
        console.error('[jobs DELETE] PDF field prune failed:', pruneErr)
      }
    }

    return NextResponse.json({ ok: true, message: 'Job deleted successfully' })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unexpected error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}


export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSessionActor();
    if (!session.ok) return session.response;

    const body = await req.json()
    const { 
      id, 
      name, 
      activityType, 
      startTime, 
      endTime, 
      location, 
      description,
      activityDateISO,
      images, // Add images from the request
      min_price,
      max_price,
      languages,
      group_size,
      adults,
      children,
      infants,
      notes,
      status
    } = body

    if (!id) return NextResponse.json({ ok: false, error: 'Missing job id' }, { status: 400 })

    const supabase = getSupabaseServer()
    const activityPatch = await denyActivityUnlessAdmin(session.actor, supabase)
    if (activityPatch) return activityPatch

    const access = await assertJobItineraryAccess(supabase, session.actor, id, 'write')
    if (!access.ok) return access.response

    // Build update data
    const updateData: UpdateJobData = {
      updated_at: new Date().toISOString()
    }

    // Only add fields that are provided
    if (name !== undefined) updateData.name = name
    if (activityType !== undefined)
      updateData.activity_type = canonicalizeActivityTypeLabel(activityType) || activityType
    if (location !== undefined) updateData.location = location
    if (description !== undefined) updateData.description = description
    if (images !== undefined) updateData.images = images // Handle images
    if (min_price !== undefined) updateData.min_price = min_price
    if (max_price !== undefined) updateData.max_price = max_price
    if (languages !== undefined) updateData.languages = languages
    if (group_size !== undefined) updateData.group_size = group_size
    if (adults !== undefined) (updateData as any).adults = adults
    if (children !== undefined) (updateData as any).children = children
    if (infants !== undefined) (updateData as any).infants = infants
    if (notes !== undefined) updateData.notes = notes
    if (status !== undefined) updateData.status = status

    // Handle time conversion if provided
    if (startTime && activityDateISO) {
      const startDateTime = `${activityDateISO}T${startTime}:00Z`
      updateData.start_time = startDateTime
    }

    if (endTime && activityDateISO) {
      const endDateTime = `${activityDateISO}T${endTime}:00Z`
      updateData.end_time = endDateTime
    }

    // Update the job
    const { data, error: updateError } = await supabase
      .from('jobs')
      .update(updateData)
      .eq('id', id)
      .select()

    if (updateError) {
      console.error('Update error:', updateError)
      return NextResponse.json({ ok: false, error: 'Failed to update job' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, job: data?.[0] })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unexpected error'
    console.error('PATCH error:', msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}



export async function PUT(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const jar = await cookies()
    const userId = jar.get('userId')?.value
    if (!userId) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

    const { id } = await context.params
    if (!id)
      return NextResponse.json(
        { ok: false, error: 'Missing id' },
        { status: 400 }
      )

    const supabase = getSupabaseServer()
    const activityPut = await denyIfActivityNotApproved(userId, supabase)
    if (activityPut) return activityPut

    // 1️⃣ Fetch the job
    const { data: job, error: fetchError } = await supabase
      .from('jobs')
      .select('id, job_available')
      .eq('id', id)
      .maybeSingle()

    if (fetchError)
      return NextResponse.json(
        { ok: false, error: 'Database error' },
        { status: 500 }
      )

    if (!job)
      return NextResponse.json(
        { ok: false, error: 'Job not found' },
        { status: 404 }
      )

    // 2️⃣ Toggle the job_available value
    const newStatus = !job.job_available

    // 3️⃣ Update the job availability
    const { error: updateError } = await supabase
      .from('jobs')
      .update({
        job_available: newStatus,
        board_hidden_reason: newStatus ? null : 'manual',
      })
      .eq('id', id)

    if (updateError)
      return NextResponse.json(
        { ok: false, error: 'Database update error' },
        { status: 500 }
      )

    return NextResponse.json({
      ok: true,
      message: 'Job availability updated successfully',
      job_available: newStatus
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unexpected error'
    return NextResponse.json(
      { ok: false, error: msg },
      { status: 500 }
    )
  }
}
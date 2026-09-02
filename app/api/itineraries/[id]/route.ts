import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabaseServer'
import {
  sendItineraryPublishedNotificationEmail,
  sendPagodaBuildIntakeNotification,
} from '@/lib/mailer'
import {
  intakeDataForApi,
  normalizeBuildMode,
  parseIntakeData,
  validateIntakeForPagodaBuild,
} from '@/lib/itinerary-intake'
import {
  DEFAULT_PDF_SUBTITLE,
  DEFAULT_PDF_TITLE,
  itineraryDayIds,
  mergeArrivalLocationsFromStays,
} from '@/lib/itinerary-pdf-defaults'
import {
  normalizeMarginStrategy,
  parseMarkupPct,
} from '@/lib/advisor-markup'
import {
  assertItineraryAccess,
  denyActivityUnlessAdmin,
  requireSessionActor,
} from '@/lib/itinerary-access'
import { isDeliverableUserEmail } from '@/lib/admin-account-type'

function applyMarkupFieldsFromBody(
  body: Record<string, unknown>,
  updates: Record<string, unknown>
) {
  if (body.markup_pct !== undefined) updates.markup_pct = body.markup_pct
  if (body.markupPct !== undefined) updates.markup_pct = body.markupPct
  if (body.margin_strategy !== undefined) updates.margin_strategy = body.margin_strategy
  if (body.marginStrategy !== undefined) updates.margin_strategy = body.marginStrategy
  if (updates.markup_pct !== undefined) {
    updates.markup_pct = parseMarkupPct(updates.markup_pct)
  }
  if (updates.margin_strategy !== undefined) {
    updates.margin_strategy = normalizeMarginStrategy(updates.margin_strategy)
  }
}

function parseIntakeFromRow(raw: unknown) {
  return parseIntakeData(raw)
}

export const runtime = 'nodejs'


export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSessionActor();
    if (!session.ok) return session.response;

    const { id } = await context.params;
    if (!id)
      return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });

    const supabase = getSupabaseServer();
    const activityBlock = await denyActivityUnlessAdmin(session.actor, supabase);
    if (activityBlock) return activityBlock;

    if (session.actor.isAdmin) {
      const access = await assertItineraryAccess(supabase, session.actor, id, "read");
      if (!access.ok) return access.response;
    }

    let { data, error } = await supabase
      .from("itineraries")
      .select(`
        id, 
        name, 
        location, 
        start_date, 
        end_date, 
        image, 
        description, 
        status, 
        highlights, 
        created_at, 
        updated_at, 
        arrival_transfer, 
        arrival_flight_number, 
        arrival_flight_time, 
        departure_transfer, 
        departure_flight_number, 
        departure_flight_time, 
        trips_summary, 
        arrival_location,
        arrival_heading,
        pdf_title,
        pdf_subtitle,
        build_mode,
        intake_data,
        markup_pct,
        margin_strategy,
        user_id
      `)
      .eq("id", id)
      .maybeSingle();

    if (error && /markup_pct|margin_strategy|column/i.test(error.message || "")) {
      const fallback = await supabase
        .from("itineraries")
        .select(`
          id, name, location, start_date, end_date, image, description, status, highlights,
          created_at, updated_at, arrival_transfer, arrival_flight_number, arrival_flight_time,
          departure_transfer, departure_flight_number, departure_flight_time, trips_summary,
          arrival_location, arrival_heading, pdf_title, pdf_subtitle, build_mode, intake_data,
          user_id
        `)
        .eq("id", id)
        .maybeSingle();
      data = fallback.data as typeof data;
      error = fallback.error;
    }

    if (error)
      return NextResponse.json({ ok: false, error: "Database error" }, { status: 500 });
    if (!data)
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    // Parse JSON fields if stored as strings
    const trips_summary = typeof data.trips_summary === "string" 
      ? JSON.parse(data.trips_summary) 
      : data.trips_summary;

    const arrival_location = typeof data.arrival_location === "string" 
      ? JSON.parse(data.arrival_location) 
      : data.arrival_location;

       const arrival_heading = typeof data.arrival_heading === "string" 
      ? JSON.parse(data.arrival_heading) 
      : data.arrival_heading;

    let owner: {
      id: string;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
    } | null = null;
    const ownerId = (data as { user_id?: string | null }).user_id;
    if (ownerId) {
      const { data: ownerRow } = await supabase
        .from("users")
        .select("id, first_name, last_name, email")
        .eq("id", ownerId)
        .maybeSingle();
      if (ownerRow) {
        owner = {
          id: String(ownerRow.id),
          first_name: ownerRow.first_name ?? null,
          last_name: ownerRow.last_name ?? null,
          email: ownerRow.email ?? null,
        };
      }
    }

    return NextResponse.json({
      ok: true,
      itinerary: {
        ...data,
        trips_summary,
        arrival_location,
        arrival_heading,
        intake_data: parseIntakeFromRow(data.intake_data),
        owner,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// PUT - Update an itinerary (full or partial update)
export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSessionActor();
    if (!session.ok) return session.response;

    const { id } = await context.params
    if (!id) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 })

    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })

  const allowedFields = ['name', 'location', 'start_date', 'end_date', 'image', 'description', 'status', 'highlights', 'arrival_transfer', 'arrival_flight_number', 'arrival_flight_time', 'departure_transfer', 'departure_flight_number', 'departure_flight_time', 'build_mode', 'intake_data', 'trips_summary', 'arrival_heading', 'arrival_location', 'pdf_title', 'pdf_subtitle']
    const updates: Record<string, unknown> = {}
    allowedFields.forEach(field => {
      if (body[field] !== undefined) {
        updates[field] = body[field]
      }
    })

    if (updates.build_mode !== undefined) {
      updates.build_mode = normalizeBuildMode(updates.build_mode)
    }
    if (updates.intake_data !== undefined) {
      updates.intake_data = intakeDataForApi(parseIntakeData(updates.intake_data))
    }
    applyMarkupFieldsFromBody(body as Record<string, unknown>, updates)

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: false, error: 'No valid fields to update' }, { status: 400 })
    }

    updates.updated_at = new Date().toISOString()

    const supabase = getSupabaseServer()
    const activityBlock = await denyActivityUnlessAdmin(session.actor, supabase)
    if (activityBlock) return activityBlock

    const access = await assertItineraryAccess(supabase, session.actor, id, 'write')
    if (!access.ok) return access.response

    const { data: before } = await supabase
      .from('itineraries')
      .select('build_mode, intake_data, name, location, start_date, end_date, arrival_transfer, arrival_flight_number, arrival_flight_time, departure_transfer, departure_flight_number, departure_flight_time, user_id, arrival_location, pdf_title, pdf_subtitle')
      .eq('id', id)
      .maybeSingle()

    const nextBuildMode =
      updates.build_mode !== undefined
        ? normalizeBuildMode(updates.build_mode)
        : normalizeBuildMode(before?.build_mode)
    const nextIntake =
      updates.intake_data !== undefined
        ? parseIntakeData(updates.intake_data)
        : parseIntakeData(before?.intake_data)

    // When city stays change (or intake is saved), fill blank day destinations automatically
    if (updates.intake_data !== undefined) {
      const start = String(updates.start_date || before?.start_date || '')
      const end = String(updates.end_date || before?.end_date || '')
      const dayIds = itineraryDayIds(start, end)
      const existingLoc =
        before?.arrival_location && typeof before.arrival_location === 'object'
          ? (before.arrival_location as Record<string, string>)
          : {}
      updates.arrival_location = mergeArrivalLocationsFromStays(
        dayIds,
        existingLoc,
        nextIntake.destinationStays
      )
      if (!String(before?.pdf_title || '').trim()) {
        updates.pdf_title = DEFAULT_PDF_TITLE
      }
      if (!String(before?.pdf_subtitle || '').trim()) {
        updates.pdf_subtitle = DEFAULT_PDF_SUBTITLE
      }
    }

    if (nextBuildMode === 'pagoda_build' && updates.build_mode === 'pagoda_build') {
      const intakeErr = validateIntakeForPagodaBuild(nextIntake)
      if (intakeErr) {
        return NextResponse.json({ ok: false, error: intakeErr }, { status: 400 })
      }
    }

    const { data, error: updateError } = await supabase
      .from('itineraries')
      .update(updates)
      .eq('id', id)
      .select('id, name, location, start_date, end_date, image, description, status, highlights, created_at, updated_at, arrival_transfer, arrival_flight_number, arrival_flight_time, departure_transfer, departure_flight_number, departure_flight_time, build_mode, intake_data, markup_pct, margin_strategy, arrival_location, arrival_heading, pdf_title, pdf_subtitle, trips_summary')
      .single()

    if (updateError) return NextResponse.json({ ok: false, error: 'Database error' }, { status: 500 })

    const becamePagodaBuild =
      nextBuildMode === 'pagoda_build' &&
      normalizeBuildMode(before?.build_mode) !== 'pagoda_build'

    if (becamePagodaBuild) {
      try {
        const ownerId = before?.user_id || access.ownerUserId
        const { data: advisor } = await supabase
          .from('users')
          .select('first_name, last_name, email')
          .eq('id', ownerId)
          .maybeSingle()
        const { data: admins } = await supabase.from('admin').select('email')
        const adminEmails = (admins ?? [])
          .map((a) => (a as { email?: string }).email)
          .filter((e): e is string => typeof e === 'string' && e.length > 0)
        const advisorName = advisor
          ? `${advisor.first_name || ''} ${advisor.last_name || ''}`.trim() || 'Advisor'
          : 'Advisor'
        await sendPagodaBuildIntakeNotification(adminEmails, {
          itineraryId: String(id),
          itineraryName: String(data.name || before?.name || ''),
          location: String(data.location || before?.location || ''),
          startDate: String(data.start_date || before?.start_date || ''),
          endDate: String(data.end_date || before?.end_date || ''),
          advisorName,
          advisorEmail: advisor?.email || '',
          arrivalTransfer: Boolean(data.arrival_transfer ?? before?.arrival_transfer),
          arrivalFlightNumber: (data.arrival_flight_number ?? before?.arrival_flight_number) as string | null,
          arrivalFlightTime: (data.arrival_flight_time ?? before?.arrival_flight_time) as string | null,
          departureTransfer: Boolean(data.departure_transfer ?? before?.departure_transfer),
          departureFlightNumber: (data.departure_flight_number ?? before?.departure_flight_number) as string | null,
          departureFlightTime: (data.departure_flight_time ?? before?.departure_flight_time) as string | null,
          intake: nextIntake,
        })
      } catch (emailErr) {
        console.error('[itineraries PUT] Pagoda build intake email failed:', emailErr)
      }
    }

    return NextResponse.json({
      ok: true,
      itinerary: {
        ...data,
        intake_data: parseIntakeFromRow(data.intake_data),
      },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unexpected error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
// In /api/itineraries/[id]/route.ts
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSessionActor();
    if (!session.ok) return session.response;

    const { id } = await context.params
    if (!id) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 })

    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })

  const allowedFields = ['name', 'location', 'start_date', 'end_date', 'image', 'description', 'highlights', 'status', 'arrival_transfer', 'arrival_flight_number', 'arrival_flight_time', 'departure_transfer', 'departure_flight_number', 'departure_flight_time', 'build_mode', 'intake_data']
    const updates: Record<string, unknown> = {}
    allowedFields.forEach(field => {
      if (body[field] !== undefined) {
        updates[field] = body[field]
      }
    })
    applyMarkupFieldsFromBody(body as Record<string, unknown>, updates)

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: false, error: 'No valid fields to update' }, { status: 400 })
    }

    updates.updated_at = new Date().toISOString()

    const supabase = getSupabaseServer()
    const activityBlockPatch = await denyActivityUnlessAdmin(session.actor, supabase)
    if (activityBlockPatch) return activityBlockPatch

    const access = await assertItineraryAccess(supabase, session.actor, id, 'write')
    if (!access.ok) return access.response
    const ownerUserId = access.ownerUserId

    // Check if status is being changed to "published" (proposal approved)
    const isStatusChangeToPublished = body.status === 'published' && updates.status === 'published';
    
    // Get current status before update to check if it's a status change
    const { data: currentItinerary } = await supabase
      .from('itineraries')
      .select('status')
      .eq('id', id)
      .single();

    const wasStatusChange = currentItinerary && currentItinerary.status !== updates.status;
    const isAlreadyPublished = currentItinerary?.status === 'published';
    /** First transition to published — used so we email all guides once, not on every save while published */
    const becamePublished =
      Boolean(currentItinerary && currentItinerary.status !== 'published' && updates.status === 'published');

    // Update the itinerary
    const { data, error: updateError } = await supabase
      .from('itineraries')
      .update(updates)
      .eq('id', id)
      .select('id, name, location, start_date, end_date, image, description, highlights, status, created_at, updated_at, arrival_transfer, arrival_flight_number, arrival_flight_time, departure_transfer, departure_flight_number, departure_flight_time, build_mode, intake_data, markup_pct, margin_strategy')
      .single()

    if (updateError) return NextResponse.json({ ok: false, error: 'Database error' }, { status: 500 })

    // Note: Publishing the itinerary does NOT convert candidates to hired
    // Candidates remain as candidates until the proposal is separately approved
    // The conversion to hired status should happen in a separate approval workflow

    // Set released_at for Tour Library jobs when itinerary is published
    // This starts the 24-hour exclusive window for tour owners
    if (updates.status === 'published') {
      try {
        const now = new Date().toISOString();
        
        if (isStatusChangeToPublished && wasStatusChange) {
          // First time publishing: Set released_at for ALL Tour Library jobs
          const { data: tourLibraryJobs } = await supabase
            .from('jobs')
            .select('id, name, tour_id, created_by, tour:tour_id(user_id)')
            .eq('itinerary_id', id)
            .not('tour_id', 'is', null);

          if (tourLibraryJobs && tourLibraryJobs.length > 0) {
            const jobIds = tourLibraryJobs.map(job => job.id);

            // Set released_at for all Tour Library jobs
            const { error: updateError } = await supabase
              .from('jobs')
              .update({ released_at: now })
              .in('id', jobIds);
              
            if (updateError) {
              console.error('Error setting released_at for Tour Library jobs:', updateError);
            } else {
              console.log(`[Publish] Set released_at for ${jobIds.length} Tour Library jobs on first publish`);
            }
          }
        } else if (isAlreadyPublished) {
          // Already published, but publishing again: Only update jobs without released_at (newly added jobs)
          const { data: tourLibraryJobsWithoutRelease } = await supabase
            .from('jobs')
            .select('id, name, tour_id, created_by, tour:tour_id(user_id)')
            .eq('itinerary_id', id)
            .not('tour_id', 'is', null)
            .is('released_at', null);

          if (tourLibraryJobsWithoutRelease && tourLibraryJobsWithoutRelease.length > 0) {
            const jobIds = tourLibraryJobsWithoutRelease.map(job => job.id);

            // Set released_at for newly added Tour Library jobs
            const { error: updateError } = await supabase
              .from('jobs')
              .update({ released_at: now })
              .in('id', jobIds);
              
            if (updateError) {
              console.error('Error setting released_at for newly added Tour Library jobs:', updateError);
            } else {
              console.log(`[Publish] Set released_at for ${jobIds.length} newly added Tour Library jobs`);
            }
          }
        }
      } catch (releaseError) {
        console.error('Error setting released_at for Tour Library jobs:', releaseError);
        // Don't fail the request if this fails
      }

      // Email all guides once when the itinerary first becomes published (not on every PATCH with status=published)
      if (becamePublished) {
        try {
          const { data: itineraryJobs } = await supabase
            .from('jobs')
            .select('id, name, tour_id, created_by, tour:tour_id(user_id)')
            .eq('itinerary_id', id);

          if (itineraryJobs && itineraryJobs.length > 0) {
            const itineraryName = data?.name || 'Itinerary';

            const { data: agent } = await supabase
              .from('users')
              .select('first_name, last_name')
              .eq('id', ownerUserId)
              .single();

            const agentName = agent
              ? `${agent.first_name || ''} ${agent.last_name || ''}`.trim() || 'Agent'
              : 'Agent';

            const { data: guides } = await supabase
              .from('users')
              .select('id, email, first_name, last_name')
              .eq('role', 'guide');

            // Skip managed-guide placeholders (@managed.pagoda.local) — they bounce as spam
            const deliverableGuides = (guides ?? []).filter((g) =>
              isDeliverableUserEmail(g.email)
            );

            if (deliverableGuides.length > 0) {
              const jobNames = itineraryJobs
                .map(job => job.name)
                .filter((name): name is string => typeof name === 'string' && name.length > 0);

              const getOwnTourJobNames = (guideId: string) =>
                itineraryJobs
                  .filter(job => job.tour_id != null && (job.tour as { user_id?: string } | null)?.user_id === guideId)
                  .map(job => job.name)
                  .filter((name): name is string => typeof name === 'string' && name.length > 0);

              const getPrimaryOwnTourJobId = (guideId: string) => {
                const own = itineraryJobs.find(
                  (job) =>
                    job.tour_id != null &&
                    (job.tour as { user_id?: string } | null)?.user_id === guideId &&
                    typeof job.id === 'string'
                );
                return own?.id ?? null;
              };

              const primaryJobId =
                itineraryJobs.find((job) => typeof job.id === 'string')?.id ?? null;

              const emailPromises = deliverableGuides.map((guide) => {
                const guideName = `${guide.first_name || ''} ${guide.last_name || ''}`.trim() || 'Guide';
                const ownTourJobNames = getOwnTourJobNames(guide.id);
                return sendItineraryPublishedNotificationEmail(
                  guide.email,
                  guideName,
                  itineraryName,
                  agentName,
                  jobNames,
                  ownTourJobNames,
                  {
                    itineraryId: id,
                    primaryOwnTourJobId: getPrimaryOwnTourJobId(guide.id),
                    primaryJobId,
                  }
                ).catch((err) => {
                  console.error(`Failed to send notification to ${guide.email}:`, err);
                  return { ok: false, error: err };
                });
              });

              Promise.all(emailPromises).catch((err) => {
                console.error('Error sending itinerary published notifications:', err);
              });
            }
          }
        } catch (notificationError) {
          console.error('Error sending itinerary published notifications:', notificationError);
        }
      }
    }

    return NextResponse.json({ ok: true, itinerary: data })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unexpected error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
// DELETE - Remove an itinerary
export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSessionActor();
    if (!session.ok) return session.response;

    const { id } = await context.params
    if (!id) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 })

    const supabase = getSupabaseServer()
    const activityBlockDel = await denyActivityUnlessAdmin(session.actor, supabase)
    if (activityBlockDel) return activityBlockDel

    const access = await assertItineraryAccess(supabase, session.actor, id, 'write')
    if (!access.ok) return access.response

    // Delete related jobs first (to maintain referential integrity)
    const { error: jobsDeleteError } = await supabase
      .from('jobs')
      .delete()
      .eq('itinerary_id', id)

    if (jobsDeleteError) {
      console.error('Error deleting related jobs:', jobsDeleteError)
      return NextResponse.json({ ok: false, error: 'Failed to delete related jobs' }, { status: 500 })
    }

    // Delete the itinerary
    const { error: deleteError } = await supabase
      .from('itineraries')
      .delete()
      .eq('id', id)

    if (deleteError) return NextResponse.json({ ok: false, error: 'Database error' }, { status: 500 })

    return NextResponse.json({ ok: true, message: 'Itinerary and related jobs deleted successfully' })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unexpected error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
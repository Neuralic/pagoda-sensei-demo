import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabaseServer'
import { denyIfActivityNotApproved } from '@/lib/activity-approval'
import { cookies } from 'next/headers'
import {
  shouldShowOnGuideJobBoard,
} from '@/lib/job-board-visibility'
import { parseItineraryTimeframe, todayUtcDateString } from '@/lib/itinerary-timeframe'

export const runtime = 'nodejs'

function parseNotesSource(notes: unknown): string | null {
  if (typeof notes !== "string") return null
  const raw = notes.trim()
  if (!raw) return null
  try {
    const j = JSON.parse(raw) as unknown
    if (j && typeof j === "object" && !Array.isArray(j)) {
      const s = (j as Record<string, unknown>).source
      if (typeof s === "string" && s.trim()) return s.trim()
    }
  } catch {
    // ignore invalid JSON notes
  }
  return null
}

function isTransferProviderJobHiddenFromGuides(job: { notes?: unknown } | null | undefined): boolean {
  return parseNotesSource(job?.notes) === "transferz"
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const sp = url.searchParams
    const page = Math.max(1, Number(sp.get('page') || '1'))
    const pageSize = Math.min(100, Math.max(1, Number(sp.get('pageSize') || '10')))
    const search = (sp.get('search') || '').trim()
    const sort = sp.get('sort') || 'created_at'
    const order = (sp.get('order') || 'desc').toLowerCase() === 'asc' ? true : false
    const startDate = sp.get('startDate') || null
    const endDate = sp.get('endDate') || null
    const includeJobs = sp.get('includeJobs') === 'true'
    const timeframe = parseItineraryTimeframe(sp.get('timeframe'))

    const jar = await cookies()
    const role = jar.get('role')?.value
    const userId = jar.get('userId')?.value ?? null

    const supabase = getSupabaseServer()
    const activityBlock = await denyIfActivityNotApproved(userId, supabase)
    if (activityBlock) return activityBlock

    let query = supabase
      .from('itineraries')
      .select('id, name, location, start_date, end_date, image, created_at, updated_at, status, arrival_transfer, arrival_flight_number, arrival_flight_time, departure_transfer, departure_flight_number, departure_flight_time', { count: 'exact' })

    // If user is a guide, only show published itineraries
    // Agents can see all itineraries (including drafts)
    if (role === 'guide') {
      query = query.eq('status', 'published')
      if (timeframe === 'upcoming') {
        query = query.gte('end_date', todayUtcDateString())
      } else if (timeframe === 'completed') {
        query = query.lt('end_date', todayUtcDateString())
      }
    }

    if (search) {
      // Search in name OR location (case-insensitive)
      const pattern = `%${search.replace(/%/g, '\\%')}%`
      query = query.or(`name.ilike.${pattern},location.ilike.${pattern}`)
    }

    if (startDate) query = query.gte('start_date', startDate)
    if (endDate) query = query.lte('end_date', endDate)

    // Apply ordering
    query = query.order(sort as string, { ascending: order })

    const from = (page - 1) * pageSize
    const to = page * pageSize - 1
    query = query.range(from, to)

    const { data, count, error } = await query
    if (error) return NextResponse.json({ ok: false, error: 'Database error' }, { status: 500 })

    const items = Array.isArray(data) ? data : []

    if (!includeJobs || items.length === 0) {
      return NextResponse.json({ ok: true, itineraries: items, count: count ?? 0, page, pageSize })
    }

    // For guides, hide jobs with an active hire. Do not hide jobs whose hire was
    // closed (guide removed / tour completed) — those should reopen on the board.
    const { data: hiredJobsData } = await supabase
      .from('job_hiring_history')
      .select('job_id')
      .eq('is_closed', false)
    
    const hiredJobIds = hiredJobsData?.map((h: any) => h.job_id).filter((id: string | null): id is string => Boolean(id)) || []

    // Fetch jobs for returned itineraries in parallel
    const jobPromises = items.map(async (it) => {
      const itObj = it as Record<string, unknown>
      const itId = itObj['id'] ? String(itObj['id']) : ''
      if (!itId) return []
      try {
        let jobQuery = supabase
          .from('jobs')
          .select('id, name, activity_type, start_time, end_time, location, description, images, languages, group_size, created_at, is_active, job_available, tour_id, released_at, created_by, notes, tour:tour_id(id, user_id)')
          .eq('itinerary_id', itId)
          .order('start_time', { ascending: true })
        
        // Only filter by is_active if the column exists and we want to show only active jobs
        // For now, show all jobs (is_active filter might be too restrictive)
        // jobQuery = jobQuery.eq('is_active', true)
        
        const { data: jdata, error: jErr } = await jobQuery
        
        if (jErr) {
          console.error(`[Itineraries All] Error fetching jobs for itinerary ${itId}:`, jErr);
          return []
        }
        
        const jobs = Array.isArray(jdata) ? jdata : []
        let openJobs =
          role === "guide" && hiredJobIds.length > 0
            ? jobs.filter((job: any) => !hiredJobIds.includes(job.id))
            : jobs

        if (timeframe !== 'completed') {
          openJobs = openJobs.filter((job: any) => job.is_active !== false)
        }

        // Guide job board: hide hired, accepted, past-date, and manually closed jobs (data stays in DB).
        // Completed trips show all historical jobs regardless of board visibility.
        if (role === "guide" && timeframe !== "completed") {
          const boardJobIds = openJobs.map((j: { id?: string }) => j.id).filter(Boolean) as string[];
          let appsByJob: Record<string, Array<{ offer_status?: string; hire_id?: string }>> = {};
          if (boardJobIds.length > 0) {
            const { data: boardApps } = await supabase
              .from("job_applications")
              .select("job_id, offer_status, hire_id")
              .in("job_id", boardJobIds);
            for (const row of boardApps || []) {
              const jid = (row as { job_id?: string }).job_id;
              if (!jid) continue;
              if (!appsByJob[jid]) appsByJob[jid] = [];
              appsByJob[jid].push(row as { offer_status?: string; hire_id?: string });
            }
          }
          openJobs = openJobs.filter((job: any) =>
            shouldShowOnGuideJobBoard(job, appsByJob[job.id] || [])
          );
        }

        // Hide transfer-provider "no guide" jobs from guides completely (upcoming board only).
        if (role === "guide" && timeframe !== "completed") {
          openJobs = openJobs.filter((job: any) => !isTransferProviderJobHiddenFromGuides(job as { notes?: unknown }))
        }

        // Add creator_is_active so guides see "no longer available" when agent is suspended
        const creatorIds = [...new Set(openJobs.map((j: any) => j.created_by).filter(Boolean))]
        let creatorActiveMap: Record<string, boolean> = {}
        if (creatorIds.length > 0) {
          const { data: creators } = await supabase
            .from('users')
            .select('id, is_active')
            .in('id', creatorIds)
          creators?.forEach((c: any) => { creatorActiveMap[c.id] = c.is_active !== false })
        }
        openJobs = openJobs.map((job: any) => ({
          ...job,
          creator_is_active: job.created_by ? (creatorActiveMap[job.created_by] !== false) : true,
        }))

        // For guide upcoming board: hide unreleased tour jobs from non-owners; add bid_available_at for 24h window
        const HOURS_EXCLUSIVE = 24
        if (role === 'guide' && userId && timeframe !== 'completed') {
          const now = new Date()
          openJobs = openJobs
            .filter((job: any) => {
              if (!job.tour_id) return true
              const tourOwnerId = (job.tour as any)?.user_id
              if (userId === tourOwnerId) return true
              return !!job.released_at
            })
            .map((job: any) => {
              let bid_available_at: string | null = null
              const tourOwnerId = (job.tour as any)?.user_id
              const isOwnTour = Boolean(job.tour_id && userId && userId === tourOwnerId)
              if (job.tour_id) {
                const isTourOwner = userId === tourOwnerId
                if (!isTourOwner && job.released_at) {
                  try {
                    const releasedAt = new Date(job.released_at)
                    if (!isNaN(releasedAt.getTime())) {
                      const hoursSinceRelease = (now.getTime() - releasedAt.getTime()) / (1000 * 60 * 60)
                      if (hoursSinceRelease < HOURS_EXCLUSIVE) {
                        const availableAt = new Date(releasedAt.getTime() + HOURS_EXCLUSIVE * 60 * 60 * 1000)
                        bid_available_at = availableAt.toISOString()
                      }
                    }
                  } catch { /* keep null */ }
                }
              }
              return { ...job, bid_available_at, is_own_tour: isOwnTour }
            })
        } else if (role === 'guide' && userId) {
          openJobs = openJobs.map((job: any) => {
            const tourOwnerId = (job.tour as any)?.user_id
            const isOwnTour = Boolean(job.tour_id && userId === tourOwnerId)
            return { ...job, is_own_tour: isOwnTour }
          })
        }

        // Remove notes from guide payloads (not needed client-side, avoids accidental rendering).
        if (role === "guide") {
          openJobs = openJobs.map((j: any) => {
            const { notes, ...rest } = j || {}
            return rest
          })
        }

        return openJobs
      } catch (err) {
        console.error(`[Itineraries All] Exception fetching jobs for itinerary ${itId}:`, err);
        return []
      }
    })

    const jobsResults = await Promise.all(jobPromises)

  const withJobs = items.map((it, idx: number) => ({ ...(it as Record<string, unknown>), jobs: jobsResults[idx] || [] }))

    return NextResponse.json({ ok: true, itineraries: withJobs, count: count ?? 0, page, pageSize })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unexpected error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

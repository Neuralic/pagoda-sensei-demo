import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseServer } from '@/lib/supabaseServer'
import { denyIfActivityNotApproved } from '@/lib/activity-approval'
import { BUCKETS } from '@/lib/buckets'
import { shouldShowOnGuideJobBoard } from '@/lib/job-board-visibility'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const activityType = searchParams.get('activityType') || ''
    const location = searchParams.get('location') || ''
    const minPrice = searchParams.get('minPrice') ? parseFloat(searchParams.get('minPrice')!) : null
    const maxPrice = searchParams.get('maxPrice') ? parseFloat(searchParams.get('maxPrice')!) : null
    const isActive = searchParams.get('isActive') !== 'false' // default to true

    const offset = (page - 1) * limit

    // Get user role to determine if we should filter by published status
    const jar = await cookies()
    const role = jar.get('role')?.value

    const supabase = getSupabaseServer()
    const userIdAll = jar.get('userId')?.value
    if (userIdAll && (role === 'agent' || role === 'guide')) {
      const activityBlock = await denyIfActivityNotApproved(userIdAll, supabase)
      if (activityBlock) return activityBlock
    }

    // Hide jobs that currently have an active hire (is_closed=false).
    const closedJobsPromise = supabase
      .from('job_hiring_history')
      .select('job_id')
      .eq("is_closed", false)

    // If user is a guide, get only published itinerary IDs - run in parallel with closed jobs query
    const publishedItinerariesPromise = role === 'guide'
      ? supabase
          .from('itineraries')
          .select('id')
          .eq('status', 'published')
      : Promise.resolve({ data: null, error: null })

    // Execute parallel queries
    const [closedJobsResult, publishedItinerariesResult] = await Promise.all([
      closedJobsPromise,
      publishedItinerariesPromise
    ])

    const closedJobIds = closedJobsResult?.data?.map((h: any) => h.job_id).filter((id: string | null): id is string => Boolean(id)) || []

    let publishedItineraryIds: string[] = []
    if (role === 'guide') {
      publishedItineraryIds = publishedItinerariesResult?.data?.map((it: any) => it.id).filter((id: string | null): id is string => Boolean(id)) || []
      
      // If no published itineraries, return empty result
      if (publishedItineraryIds.length === 0) {
        return NextResponse.json({
          ok: true,
          jobs: [],
          pagination: {
            page,
            limit,
            total: 0,
            totalPages: 0,
            hasNext: false,
            hasPrev: false,
          },
          filters: {
            activityType,
            location,
            minPrice,
            maxPrice,
            isActive,
          }
        })
      }
    }

    // Build query with filters
    let query = supabase
      .from('jobs')
      .select('id, itinerary_id, name, activity_type, start_time, end_time, location, description, images, min_price, max_price, languages, group_size, notes, is_active, job_available, created_at, updated_at, created_by, tour_id, released_at, tour:tour_id(user_id)', { count: 'exact' })
      .eq('is_active', isActive)

    // If guide, only show jobs from published itineraries
    if (role === 'guide' && publishedItineraryIds.length > 0) {
      query = query.in('itinerary_id', publishedItineraryIds)
    }

    // Exclude closed jobs - use array syntax for Supabase
    if (closedJobIds.length > 0) {
      // Filter out closed jobs after fetching (more reliable than complex query)
      // We'll filter in the code instead
    }

    // Apply filters
    if (activityType) {
      query = query.ilike('activity_type', `%${activityType}%`)
    }

    if (location) {
      query = query.ilike('location', `%${location}%`)
    }

    if (minPrice !== null) {
      query = query.gte('min_price', minPrice)
    }

    if (maxPrice !== null) {
      query = query.lte('max_price', maxPrice)
    }

    // Execute query with pagination
    const { data: jobs, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      return NextResponse.json({ ok: false, error: 'Database error', detail: error.message }, { status: 500 })
    }

    // Filter out jobs that currently have an active hire
    let openJobs = closedJobIds.length > 0
      ? (jobs || []).filter((job: any) => !closedJobIds.includes(job.id))
      : (jobs || [])

    // Guide job board: hide hired, accepted, past, and unavailable jobs.
    if (role === 'guide') {
      const boardJobIds = openJobs.map((j: { id?: string }) => j.id).filter(Boolean) as string[]
      let appsByJob: Record<string, Array<{ offer_status?: string; hire_id?: string }>> = {}
      if (boardJobIds.length > 0) {
        const { data: boardApps } = await supabase
          .from('job_applications')
          .select('job_id, offer_status, hire_id')
          .in('job_id', boardJobIds)
        for (const row of boardApps || []) {
          const jid = (row as { job_id?: string }).job_id
          if (!jid) continue
          if (!appsByJob[jid]) appsByJob[jid] = []
          appsByJob[jid].push(row as { offer_status?: string; hire_id?: string })
        }
      }
      openJobs = openJobs.filter((job: any) =>
        shouldShowOnGuideJobBoard(job, appsByJob[job.id] || [])
      )
    }

    // Filter Tour Library jobs: if guide, hide jobs within 24-hour window (unless they're the tour owner)
    if (role === 'guide') {
      const userId = jar.get('userId')?.value
      const now = new Date()
      
      openJobs = openJobs.filter((job: any) => {
        // If job has tour_id, it's a Tour Library job
        if (job.tour_id) {
          const tourOwnerId = (job.tour as any)?.user_id
          
          // If job hasn't been released yet, only tour owner can see it
          if (!job.released_at) {
            return userId === tourOwnerId
          }
          
          // If job has been released, check 24-hour window
          const releasedAt = new Date(job.released_at)
          const hoursSinceRelease = (now.getTime() - releasedAt.getTime()) / (1000 * 60 * 60)
          
          // If within 24 hours, only tour owner can see it
          if (hoursSinceRelease < 24) {
            return userId === tourOwnerId
          }
          
          // After 24 hours, all guides can see it
          return true
        }
        
        // Non-Tour Library jobs are always visible
        return true
      })
    }

    // Get creator details for all jobs (use filtered openJobs)
    const creatorIds = [...new Set(openJobs.map((job) => job.created_by).filter((id): id is string => typeof id === 'string'))]

    let creators: Array<Record<string, unknown>> = []
    let creatorProfiles: Array<Record<string, unknown>> = []

    if (creatorIds.length > 0) {
      // Get user details (including is_active for "no longer available" when creator suspended) and profile pictures in parallel
      const [usersResult, profilesResult] = await Promise.all([
        supabase
          .from('users')
          .select('id, first_name, last_name, email, is_active')
          .in('id', creatorIds),
        supabase
          .from('profiles')
          .select('id, user_id, profile_picture_path')
          .in('user_id', creatorIds)
      ])
      
      if (usersResult.error) {
        return NextResponse.json({ ok: false, error: 'Database error', detail: usersResult.error.message }, { status: 500 })
      }
      creators = usersResult.data || []

      if (profilesResult.error) {
        return NextResponse.json({ ok: false, error: 'Database error', detail: profilesResult.error.message }, { status: 500 })
      }
      creatorProfiles = profilesResult.data || []
    }

    // Create lookup maps
    const creatorsById: Record<string, Record<string, unknown>> = {}
    for (const u of creators) {
      const id = (u as Record<string, unknown>)?.id
      if (typeof id === 'string') creatorsById[id] = u
    }

    const profileByUserId: Record<string, Record<string, unknown>> = {}
    for (const p of creatorProfiles) {
      const uid = (p as Record<string, unknown>)?.user_id
      if (typeof uid === 'string') profileByUserId[uid] = p
    }

    // Enrich jobs with creator (agent) details
    const enrichedJobs = openJobs.map((job) => {
      const creatorId = job.created_by
      const user = creatorId ? creatorsById[creatorId] || null : null
      const profile = creatorId ? profileByUserId[creatorId] || null : null

      // Build agent name
      const agencyName = user
        ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Agency'
        : 'Agency'

      // Avatar URL will be resolved client-side or use public URL directly
      // Don't create signed URLs here as it's slow - use public URLs or batch sign on client
      let avatarUrl: string | null = null
      const path = profile?.profile_picture_path
      if (typeof path === 'string' && path) {
        // Use public URL directly for better performance
        try {
          const { data: pub } = supabase.storage.from(BUCKETS.avatars).getPublicUrl(path)
          avatarUrl = (pub as Record<string, unknown> | null)?.publicUrl as string || null
        } catch {
          avatarUrl = null
        }
      }

      return {
        ...job,
        creator_is_active: user ? (user as { is_active?: boolean }).is_active !== false : true,
        agent: {
          id: creatorId,
          name: agencyName,
          user: user ? {
            id: user.id,
            firstName: user.first_name,
            lastName: user.last_name,
            email: user.email
          } : null,
          profile: profile ? {
            id: profile.id,
            userId: profile.user_id,
            avatarPath: profile.profile_picture_path,
            avatarUrl: avatarUrl
          } : null,
        },
      }
    })

    return NextResponse.json({
      ok: true,
      jobs: enrichedJobs,
      pagination: {
        page,
        limit,
        total: enrichedJobs.length, // Adjusted count after filtering closed jobs
        totalPages: Math.ceil(enrichedJobs.length / limit),
        hasNext: enrichedJobs.length >= limit, // Approximate
        hasPrev: page > 1,
      },
      filters: {
        activityType,
        location,
        minPrice,
        maxPrice,
        isActive,
      }
    })

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unexpected error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
import { NextResponse } from 'next/server'
import { requireSessionActor } from "@/lib/itinerary-access";
import { getSupabaseServer } from '@/lib/supabaseServer'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  // Middleware rejects anonymous callers; this keeps the route correct on its own.
  const session = await requireSessionActor();
  if (!session.ok) return session.response;

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

    const supabase = getSupabaseServer()

    let query = supabase
      .from('itinerary')
      .select('id, name, location, start_date, end_date, image, created_at, updated_at', { count: 'exact' })

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
      return NextResponse.json({ ok: true, itinerary: items, count: count ?? 0, page, pageSize })
    }

    // Fetch jobs for returned itinerary in parallel
    const jobPromises = items.map(async (it) => {
      const itObj = it as Record<string, unknown>
      const itId = itObj['id'] ? String(itObj['id']) : ''
      if (!itId) return []
      const { data: jdata, error: jErr } = await supabase
        .from('jobs')
        .select('id, name, activity_type, start_time, end_time, location, description, images, languages, group_size, created_at')
        .eq('itinerary_id', itId)
        .order('start_time', { ascending: true })
      if (jErr) return []
      return Array.isArray(jdata) ? jdata : []
    })

    const jobsResults = await Promise.all(jobPromises)

  const withJobs = items.map((it, idx: number) => ({ ...(it as Record<string, unknown>), jobs: jobsResults[idx] || [] }))

    return NextResponse.json({ ok: true, itinerary: withJobs, count: count ?? 0, page, pageSize })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unexpected error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

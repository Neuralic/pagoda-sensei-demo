import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseServer } from '@/lib/supabaseServer'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const jar = await cookies()
    const userId = jar.get('userId')?.value
    if (!userId) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

    const supabase = getSupabaseServer()
    const { data, error } = await supabase
      .from('itinerary')
      .select('id, name, location, description, status, start_date, end_date, image, created_at, updated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ ok: false, error: 'Database error' }, { status: 500 })

    return NextResponse.json({ ok: true, itinerary: data ?? [] })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unexpected error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const jar = await cookies()
    const userId = jar.get('userId')?.value
    if (!userId) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

    const body = await req.json().catch(() => ({})) as {
      name?: string
      location?: string
      startDate?: string
      endDate?: string
      imagePath?: string | null
      description?: string | null
      status?: string | null
      highlights?: string[] | null
    }

    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const location = typeof body.location === 'string' ? body.location.trim() : ''
    const startDate = typeof body.startDate === 'string' ? body.startDate : ''
    const endDate = typeof body.endDate === 'string' ? body.endDate : ''
    const imagePath = typeof body.imagePath === 'string' ? body.imagePath : null
    const description = typeof body.description === 'string' ? body.description : null
    const status = typeof body.status === 'string' ? body.status : null
    const highlights = Array.isArray(body.highlights) && body.highlights.every((h) => typeof h === 'string')
      ? body.highlights
      : null

    if (!name || !location || !startDate || !endDate || !status) {
      return NextResponse.json({ ok: false, error: 'Missing required fields' }, { status: 400 })
    }

    // Basic date validation (YYYY-MM-DD)
    const isoDate = /^\d{4}-\d{2}-\d{2}$/
    if (!isoDate.test(startDate) || !isoDate.test(endDate)) {
      return NextResponse.json({ ok: false, error: 'Invalid date format' }, { status: 400 })
    }

    const supabase = getSupabaseServer()

    // Fetch profile id for user
    const { data: profile, error: pErr } = await supabase
      .from('profiles')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle()

    if (pErr) return NextResponse.json({ ok: false, error: 'Database error' }, { status: 500 })
    if (!profile?.id) {
      return NextResponse.json(
        {
          ok: false,
          code: 'PROFILE_REQUIRED',
          error: 'Please complete your profile before creating an itinerary.',
        },
        { status: 400 }
      )
    }

    const insert = {
      user_id: userId,
      profile_id: profile.id as string,
      name,
      location,
      start_date: startDate,
      end_date: endDate,
      image: imagePath,
      description,
      status,
      highlights,
    }

    const { data, error } = await supabase.from('itinerary').insert(insert).select('id').single()
    if (error) return NextResponse.json({ ok: false, error: 'Insert failed' }, { status: 500 })

    return NextResponse.json({ ok: true, id: data?.id ?? null })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unexpected error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

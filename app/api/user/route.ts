import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseServer } from '@/lib/supabaseServer'
import bcrypt from 'bcryptjs'
import { parseMarkupPct } from '@/lib/advisor-markup'

export const runtime = 'nodejs'

type UserPayload = {
  email?: string
  phone?: string
  dateOfBirth?: string
  password?: string
  name?: string
  lastName?: string
  country?: string
  city?: string
  defaultMarkupPct?: number | null
}

export async function GET() {
  const jar = await cookies()
  const userId = jar.get('userId')?.value
  if (!userId) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

  const supabase = getSupabaseServer()
  const { data: user, error } = await supabase
    .from('users')
    .select('id, email, first_name, last_name, created_at, country, city, phone, guide_number, role, default_markup_pct')
    .eq('id', userId)
    .single()

  if (error || !user) return NextResponse.json({ ok: false, error: 'User not found' }, { status: 404 })

  return NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.first_name || '',
      lastName: user.last_name || '',
      guideNumber: user.guide_number || '',
      phone: user.phone || '',
      role: user.role || '',
      dateOfBirth: '',
      country: user.country || '',      
      city: user.city || '',
      createdAt: (user as { created_at?: string | null }).created_at ?? null,
      defaultMarkupPct:
        (user as { default_markup_pct?: number | null }).default_markup_pct != null
          ? Number((user as { default_markup_pct?: number | null }).default_markup_pct)
          : null,
    },
  })
}

export async function PUT(req: Request) {
  try {
    const jar = await cookies()
    const userId = jar.get('userId')?.value
    if (!userId) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

    const body = (await req.json().catch(() => ({}))) as UserPayload
    const { password, name, lastName, defaultMarkupPct } = body


    const updates: Record<string, unknown> = {}
    if (typeof name === 'string') updates.first_name = name
    if (typeof lastName === 'string') updates.last_name = lastName
    if (defaultMarkupPct !== undefined) {
      updates.default_markup_pct = parseMarkupPct(defaultMarkupPct)
    }

    if (typeof password === 'string' && password) {
      if (password.length < 8) {
        return NextResponse.json({ ok: false, error: 'Password must be at least 8 characters' }, { status: 400 })
      }
      const salt = await bcrypt.genSalt(10)
      const hash = await bcrypt.hash(password, salt)
      updates.password_hash = hash
    }

    if (!Object.keys(updates).length) {
      return NextResponse.json({ ok: true })
    }

    const supabase = getSupabaseServer()
    const { error } = await supabase.from('users').update(updates).eq('id', userId)
    if (error) return NextResponse.json({ ok: false, error: 'Database error' }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unexpected error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

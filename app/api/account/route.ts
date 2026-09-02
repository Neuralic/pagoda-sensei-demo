import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseServer } from '@/lib/supabaseServer'

export const runtime = 'nodejs'

type AccountPayload = {
  email?: string
  phone?: string
  dateOfBirth?: string
  password?: string
}

export async function GET() {
  const jar = await cookies()
  const userId = jar.get('userId')?.value
  if (!userId) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

  const supabase = getSupabaseServer()
  const { data, error } = await supabase.auth.admin.getUserById(userId)
  if (error || !data?.user) return NextResponse.json({ ok: false, error: 'User not found' }, { status: 404 })

  const user = data.user
  const meta = (user.user_metadata || {}) as Record<string, unknown>
  return NextResponse.json({
    ok: true,
    account: {
      email: user.email,
      phone: typeof meta.phone === 'string' ? meta.phone : '',
      dateOfBirth:
        typeof meta.dateOfBirth === 'string'
          ? meta.dateOfBirth
          : (typeof (meta as Record<string, unknown>)['dob'] === 'string'
              ? (meta as Record<string, unknown>)['dob']
              : ''),
      createdAt: user.created_at,
    },
  })
}

export async function PUT(req: Request) {
  try {
    const jar = await cookies()
    const userId = jar.get('userId')?.value
    if (!userId) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

    const body = (await req.json().catch(() => ({}))) as AccountPayload
    const { email, phone, dateOfBirth, password } = body

  const updates: Record<string, unknown> = {}
    if (typeof email === 'string' && email.trim()) updates.email = email.trim()
    if (typeof password === 'string' && password) updates.password = password
    const user_metadata: Record<string, string> = {}
    if (typeof phone === 'string') user_metadata.phone = phone
    if (typeof dateOfBirth === 'string') user_metadata.dateOfBirth = dateOfBirth
    if (Object.keys(user_metadata).length) updates.user_metadata = user_metadata

    if (!Object.keys(updates).length) {
      return NextResponse.json({ ok: true })
    }

    const supabase = getSupabaseServer()
    const { error } = await supabase.auth.admin.updateUserById(userId, updates)
    if (error) return NextResponse.json({ ok: false, error: error.message || 'Update failed' }, { status: 400 })

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unexpected error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

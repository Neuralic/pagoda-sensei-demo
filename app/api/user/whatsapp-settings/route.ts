import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseServer } from '@/lib/supabaseServer'
import { isWhatsAppCloudConfigured } from '@/lib/whatsapp-cloud'
import { digitsForWhatsAppApi } from '@/lib/phone-whatsapp'

export const dynamic = 'force-dynamic'

/**
 * Opt-in: when enabled, new in-app messages from the other party are mirrored to this user's WhatsApp
 * (requires profile phone in a format we can send to Meta, and server WhatsApp env configured).
 */
export async function GET() {
  try {
    const jar = await cookies()
    const userId = jar.get('userId')?.value
    if (!userId) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

    const supabase = getSupabaseServer()
    const { data: user, error } = await supabase
      .from('users')
      .select('phone, whatsapp_sync_enabled')
      .eq('id', userId)
      .maybeSingle()

    if (error || !user) {
      return NextResponse.json({ ok: false, error: 'User not found' }, { status: 500 })
    }

    const phoneOk = Boolean(digitsForWhatsAppApi(user.phone as string | null))

    return NextResponse.json({
      ok: true,
      cloudConfigured: isWhatsAppCloudConfigured(),
      enabled: Boolean(user.whatsapp_sync_enabled),
      hasPhone: phoneOk,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unexpected error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const jar = await cookies()
    const userId = jar.get('userId')?.value
    if (!userId) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

    const body = (await req.json().catch(() => ({}))) as { enabled?: unknown }
    if (typeof body.enabled !== 'boolean') {
      return NextResponse.json({ ok: false, error: 'enabled (boolean) required' }, { status: 400 })
    }

    const supabase = getSupabaseServer()
    const { error } = await supabase
      .from('users')
      .update({ whatsapp_sync_enabled: body.enabled })
      .eq('id', userId)

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, enabled: body.enabled })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unexpected error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { getSupabaseServer } from '@/lib/supabaseServer'
import { isImpersonating } from '@/lib/admin-impersonation'

/** DB column `guide_approved`: when true, admins have cleared the user for full platform activity (agents and guides). */
export function canPerformFullActivity(row: { role?: string | null; guide_approved?: boolean | null }): boolean {
  const r = row.role
  if (r !== 'agent' && r !== 'guide') return true
  return row.guide_approved === true
}

/**
 * For authenticated agent/guide routes: returns 403 if the account is still pending admin approval.
 * Admins using overall access (impersonation) are allowed through so they can help onboarding.
 */
export async function denyIfActivityNotApproved(
  userId: string | null | undefined,
  supabase: SupabaseClient = getSupabaseServer()
): Promise<NextResponse | null> {
  if (!userId) return null

  try {
    const jar = await cookies()
    if (jar.get('role')?.value === 'admin') return null
    if (isImpersonating(jar)) return null
  } catch {
    // cookies() may be unavailable in some edge contexts — fall through to normal check
  }

  const { data, error } = await supabase.from('users').select('role, guide_approved').eq('id', userId).maybeSingle()
  if (error || !data) {
    return NextResponse.json({ ok: false, error: 'Not authenticated.' }, { status: 401 })
  }
  if (!canPerformFullActivity(data)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Your account is pending administrator approval. You can update your profile until an administrator enables full access.',
        pendingApproval: true,
      },
      { status: 403 }
    )
  }
  return null
}

import { NextRequest, NextResponse } from 'next/server';
import { requireSessionActor } from "@/lib/itinerary-access";
import { getSupabaseServer } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ number: string }> }
) {
  // Middleware rejects anonymous callers; this keeps the route correct on its own.
  const session = await requireSessionActor();
  if (!session.ok) return session.response;

  try {
    // Await the params before using them
    const { number } = await params;
    const guideNumber = number;
    if (!guideNumber) {
      return NextResponse.json({ ok: false, error: 'Guide number is required' }, { status: 400 });
    }

    const supabaseServer = getSupabaseServer();

    // Fetch guide data by guide_number
    const { data: guide, error } = await supabaseServer
      .from('users')
      .select(`
        id,
        first_name,
        last_name,
        email,
        phone,
        country,
        city,
        guide_number,

        role
      `)
      .eq('guide_number', guideNumber)
      .eq('role', 'guide')
      .single();
    if (error || !guide) {
      return NextResponse.json({ ok: false, error: 'Guide not found' }, { status: 404 });
    }

    // Normalize the data
    const normalizedGuide = {
      id: guide.id,
      firstName: guide.first_name,
      lastName: guide.last_name,
      email: guide.email,
      phone: guide.phone,
      country: guide.country,
      city: guide.city,
      guideNumber: guide.guide_number,
      role: guide.role,
    };

    return NextResponse.json({ ok: true, guide: normalizedGuide });
  } catch (e) {
    console.error('[guides] exception', e);
    const message = e instanceof Error ? e.message : 'Unexpected error.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
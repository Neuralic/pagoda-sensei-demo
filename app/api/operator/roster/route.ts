import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { requireOperatorAccount } from "@/lib/operator-auth";
import { guideTierLabel, isGuideTier } from "@/lib/guide-tier";
import { BUCKETS } from "@/lib/buckets";

export const runtime = "nodejs";

async function requireOperator() {
  const auth = await requireOperatorAccount();
  if (!auth.ok) return { error: auth.response };
  return { userId: auth.session.userId, supabase: auth.session.supabase };
}

/** List guides on this operator's roster */
export async function GET() {
  const auth = await requireOperator();
  if ("error" in auth && auth.error) return auth.error;
  const { userId, supabase } = auth as { userId: string; supabase: ReturnType<typeof getSupabaseServer> };

  const { data: roster, error } = await supabase
    .from("operator_roster")
    .select("id, guide_id, created_at")
    .eq("operator_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const guideIds = (roster || []).map((r) => (r as { guide_id: string }).guide_id);
  if (guideIds.length === 0) {
    return NextResponse.json({ ok: true, guides: [] });
  }

  const { data: users } = await supabase
    .from("users")
    .select("id, first_name, last_name, guide_number, guide_tier, email")
    .in("id", guideIds);

  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, profile_picture_path, marketplace_available, profile_slug")
    .in("user_id", guideIds);

  const usersById: Record<string, Record<string, unknown>> = {};
  for (const u of users || []) usersById[(u as { id: string }).id] = u as Record<string, unknown>;
  const profilesById: Record<string, Record<string, unknown>> = {};
  for (const p of profiles || []) profilesById[(p as { user_id: string }).user_id] = p as Record<string, unknown>;

  const guides = await Promise.all(
    (roster || []).map(async (r) => {
      const gid = (r as { guide_id: string }).guide_id;
      const u = usersById[gid];
      const prof = profilesById[gid];
      let avatarUrl: string | null = null;
      const pic = prof?.profile_picture_path as string | undefined;
      if (pic) {
        const { data: signed } = await supabase.storage.from(BUCKETS.avatars).createSignedUrl(pic, 3600);
        avatarUrl = signed?.signedUrl ?? null;
      }
      const tier = isGuideTier(u?.guide_tier as string) ? (u?.guide_tier as string) : "professional";
      const fn = (u?.first_name as string) || "";
      const ln = (u?.last_name as string) || "";
      return {
        rosterId: (r as { id: string }).id,
        id: gid,
        firstName: fn,
        lastName: ln,
        name: `${fn} ${ln}`.trim(),
        email: (u?.email as string) || null,
        guideNumber: (u?.guide_number as string) || null,
        guideTier: tier,
        guideTierLabel: guideTierLabel(tier),
        marketplaceAvailable: prof?.marketplace_available !== false,
        avatarUrl,
        profileSlug: (prof?.profile_slug as string | null) || null,
        addedAt: (r as { created_at: string }).created_at,
      };
    })
  );

  return NextResponse.json({ ok: true, guides });
}

/** Add a guide to roster by guide_number */
export async function POST(req: Request) {
  const auth = await requireOperator();
  if ("error" in auth && auth.error) return auth.error;
  const { userId, supabase } = auth as { userId: string; supabase: ReturnType<typeof getSupabaseServer> };

  const body = (await req.json().catch(() => ({}))) as { guideNumber?: string };
  const guideNumber = body.guideNumber?.trim();
  if (!guideNumber) {
    return NextResponse.json({ ok: false, error: "guideNumber is required" }, { status: 400 });
  }

  const { data: guide, error: guideErr } = await supabase
    .from("users")
    .select("id, role, first_name, last_name, guide_number")
    .eq("guide_number", guideNumber)
    .eq("role", "guide")
    .maybeSingle();

  if (guideErr) {
    return NextResponse.json({ ok: false, error: guideErr.message }, { status: 500 });
  }
  if (!guide) {
    return NextResponse.json({ ok: false, error: "Guide not found" }, { status: 404 });
  }
  if (guide.id === userId) {
    return NextResponse.json({ ok: false, error: "Cannot add yourself to the roster" }, { status: 400 });
  }

  const { error: insertErr } = await supabase.from("operator_roster").insert({
    operator_id: userId,
    guide_id: guide.id,
  });

  if (insertErr) {
    if (insertErr.code === "23505") {
      return NextResponse.json({ ok: false, error: "Guide is already on your roster" }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    guide: {
      id: guide.id,
      name: `${guide.first_name || ""} ${guide.last_name || ""}`.trim(),
      guideNumber: guide.guide_number,
    },
  });
}

/** Remove guide from roster: DELETE ?guideId= */
export async function DELETE(req: Request) {
  const auth = await requireOperator();
  if ("error" in auth && auth.error) return auth.error;
  const { userId, supabase } = auth as { userId: string; supabase: ReturnType<typeof getSupabaseServer> };

  const guideId = new URL(req.url).searchParams.get("guideId")?.trim();
  if (!guideId) {
    return NextResponse.json({ ok: false, error: "guideId is required" }, { status: 400 });
  }

  await supabase
    .from("guide_tour_assignments")
    .delete()
    .eq("operator_id", userId)
    .eq("guide_id", guideId);

  const { error } = await supabase
    .from("operator_roster")
    .delete()
    .eq("operator_id", userId)
    .eq("guide_id", guideId);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

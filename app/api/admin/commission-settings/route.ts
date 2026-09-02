import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { DEFAULT_COMMISSION_SETTINGS, FIXED_VAT_RATE_PCT } from "@/lib/tour-price";

export const dynamic = "force-dynamic";

async function ensureAdmin() {
  const jar = await cookies();
  const userId = jar.get("userId")?.value;
  const role = jar.get("role")?.value;
  if (role !== "admin" || !userId) {
    return { error: "Unauthorized. Admin access required." as const, supabase: null };
  }
  const supabase = getSupabaseServer();
  const { data: admin, error } = await supabase
    .from("admin")
    .select("id")
    .eq("id", userId)
    .eq("is_active", true)
    .single();
  if (error || !admin) {
    return { error: "Unauthorized. Admin access required." as const, supabase: null };
  }
  return { error: null, supabase };
}

/** GET: list of guides with their commission (admin only). Guides without a row use lib default. */
export async function GET() {
  const { error: authErr, supabase } = await ensureAdmin();
  if (authErr || !supabase) {
    return NextResponse.json({ ok: false, error: authErr }, { status: 403 });
  }

  const { data: guides, error: guidesErr } = await supabase
    .from("users")
    .select("id, first_name, last_name, email, guide_number")
    .eq("role", "guide")
    .order("first_name");

  if (guidesErr) {
    return NextResponse.json(
      { ok: false, error: "Failed to load guides", detail: guidesErr.message },
      { status: 500 }
    );
  }

  const guideIds = (guides || []).map((g) => (g as { id: string }).id).filter(Boolean);
  let settingsByGuide: Record<string, { commission_marketplace_pct: number; commission_agent_pct: number; vat_rate_pct: number }> = {};
  const avatarPathByGuide: Record<string, string | null> = {};

  if (guideIds.length > 0) {
    const [settingsRes, profilesRes] = await Promise.all([
      supabase
        .from("guide_commission_settings")
        .select("user_id, commission_marketplace_pct, commission_agent_pct, vat_rate_pct")
        .in("user_id", guideIds),
      supabase
        .from("profiles")
        .select("user_id, profile_picture_path")
        .in("user_id", guideIds),
    ]);

    const settingsRows = settingsRes.data || [];
    for (const row of settingsRows) {
      const uid = (row as { user_id?: string }).user_id;
      if (uid) {
        settingsByGuide[uid] = {
          commission_marketplace_pct: Number((row as { commission_marketplace_pct?: number }).commission_marketplace_pct) || DEFAULT_COMMISSION_SETTINGS.commissionMarketplacePct,
          commission_agent_pct: Number((row as { commission_agent_pct?: number }).commission_agent_pct) || DEFAULT_COMMISSION_SETTINGS.commissionAgentPct,
          vat_rate_pct: FIXED_VAT_RATE_PCT,
        };
      }
    }

    for (const p of profilesRes.data || []) {
      const uid = (p as { user_id?: string }).user_id;
      const path = (p as { profile_picture_path?: string | null }).profile_picture_path;
      if (uid) avatarPathByGuide[uid] = path ?? null;
    }
  }

  const guidesWithSettings = (guides || []).map((g) => {
    const id = (g as { id: string }).id;
    const s = settingsByGuide[id];
    return {
      id,
      firstName: (g as { first_name?: string }).first_name ?? "",
      lastName: (g as { last_name?: string }).last_name ?? "",
      email: (g as { email?: string }).email ?? "",
      guideNumber: (g as { guide_number?: string | null }).guide_number ?? null,
      avatarPath: avatarPathByGuide[id] ?? null,
      commissionMarketplacePct: s ? s.commission_marketplace_pct : DEFAULT_COMMISSION_SETTINGS.commissionMarketplacePct,
      commissionAgentPct: s ? s.commission_agent_pct : DEFAULT_COMMISSION_SETTINGS.commissionAgentPct,
    };
  });

  return NextResponse.json({
    ok: true,
    guides: guidesWithSettings,
  });
}

/** PUT: update one guide's commission (admin only). Requires guideId. */
export async function PUT(req: Request) {
  const { error: authErr, supabase } = await ensureAdmin();
  if (authErr || !supabase) {
    return NextResponse.json({ ok: false, error: authErr }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const guideId = body.guideId ?? body.guide_id;
  const marketplace = body.commissionMarketplacePct ?? body.commission_marketplace_pct;
  const agent = body.commissionAgentPct ?? body.commission_agent_pct;

  if (typeof guideId !== "string" || !guideId.trim()) {
    return NextResponse.json(
      { ok: false, error: "guideId is required to update a guide's commission" },
      { status: 400 }
    );
  }

  const m =
    typeof marketplace === "number" && marketplace >= 0 && marketplace <= 100
      ? marketplace
      : DEFAULT_COMMISSION_SETTINGS.commissionMarketplacePct;
  const a =
    typeof agent === "number" && agent >= 0 && agent <= 100
      ? agent
      : DEFAULT_COMMISSION_SETTINGS.commissionAgentPct;
  const vv = FIXED_VAT_RATE_PCT;

  const { error: upsertErr } = await supabase
    .from("guide_commission_settings")
    .upsert(
      {
        user_id: guideId.trim(),
        commission_marketplace_pct: m,
        commission_agent_pct: a,
        vat_rate_pct: vv,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (upsertErr) {
    return NextResponse.json(
      { ok: false, error: "Failed to update guide commission", detail: upsertErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    guideId: guideId.trim(),
    settings: { commissionMarketplacePct: m, commissionAgentPct: a, vatRatePct: vv },
  });
}

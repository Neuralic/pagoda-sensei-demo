import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabaseServer";
import {
  DEFAULT_FX_PROTECTION_PCT,
  fetchFrankfurterUsdJpyQuote,
  FX_RATE_SOURCE,
  fxRateTooltip,
} from "@/lib/fx-rate";
import { getFxProtectionPct, setFxProtectionPct } from "@/lib/fx-platform-settings";

export const dynamic = "force-dynamic";

async function ensureAdmin() {
  const jar = await cookies();
  const userId = jar.get("userId")?.value;
  const role = jar.get("role")?.value;
  if (role !== "admin" || !userId) {
    return { error: "Unauthorized. Admin access required." as const, supabase: null, userId: null };
  }
  const supabase = getSupabaseServer();
  const { data: admin, error } = await supabase
    .from("admin")
    .select("id")
    .eq("id", userId)
    .eq("is_active", true)
    .single();
  if (error || !admin) {
    return { error: "Unauthorized. Admin access required." as const, supabase: null, userId: null };
  }
  return { error: null, supabase, userId };
}

/** GET: current FX protection % and live ECB reference rate metadata. */
export async function GET() {
  const { error: authErr, supabase } = await ensureAdmin();
  if (authErr || !supabase) {
    return NextResponse.json({ ok: false, error: authErr }, { status: 403 });
  }

  try {
    const [quote, fxProtectionPct] = await Promise.all([
      fetchFrankfurterUsdJpyQuote(),
      getFxProtectionPct(supabase),
    ]);

    return NextResponse.json({
      ok: true,
      fxProtectionPct,
      defaultFxProtectionPct: DEFAULT_FX_PROTECTION_PCT,
      jpyPerUsd: quote.jpyPerUsd,
      rateDate: quote.rateDate,
      fetchedAt: quote.fetchedAt,
      source: FX_RATE_SOURCE,
      rateLabel: fxRateTooltip(quote, fxProtectionPct),
    });
  } catch (err) {
    const fxProtectionPct = await getFxProtectionPct(supabase);
    return NextResponse.json({
      ok: true,
      fxProtectionPct,
      defaultFxProtectionPct: DEFAULT_FX_PROTECTION_PCT,
      jpyPerUsd: null,
      rateDate: null,
      fetchedAt: null,
      source: FX_RATE_SOURCE,
      rateError: err instanceof Error ? err.message : "Rate unavailable",
    });
  }
}

/** PATCH: update FX protection % ({ fxProtectionPct: number }). */
export async function PATCH(req: NextRequest) {
  const { error: authErr, supabase, userId } = await ensureAdmin();
  if (authErr || !supabase || !userId) {
    return NextResponse.json({ ok: false, error: authErr }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { fxProtectionPct?: unknown };
  const raw = body.fxProtectionPct;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    return NextResponse.json(
      { ok: false, error: "fxProtectionPct must be a number from 0 to 100" },
      { status: 400 }
    );
  }

  try {
    const fxProtectionPct = await setFxProtectionPct(supabase, n, userId);
    return NextResponse.json({ ok: true, fxProtectionPct });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Could not save FX protection setting",
      },
      { status: 500 }
    );
  }
}

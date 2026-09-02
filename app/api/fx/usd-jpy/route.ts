import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { requireSessionActor } from "@/lib/itinerary-access";
import { getFxProtectionPct } from "@/lib/fx-platform-settings";
import {
  fetchFrankfurterUsdJpyQuote,
  FX_RATE_SOURCE,
  fxRateAdvisorHint,
} from "@/lib/fx-rate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/fx/usd-jpy
 * ECB reference USD/JPY (Frankfurter) + admin FX protection % for advisor USD estimates.
 */
export async function GET() {
  try {
    const session = await requireSessionActor();
    if (!session.ok) return session.response;

    const role = session.actor.role;
    const isAdmin = session.actor.isAdmin;
    if (role !== "agent" && role !== "agency" && role !== "admin" && !isAdmin) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const supabase = getSupabaseServer();
    const [quote, fxProtectionPct] = await Promise.all([
      fetchFrankfurterUsdJpyQuote(),
      getFxProtectionPct(supabase),
    ]);

    return NextResponse.json({
      ok: true,
      jpyPerUsd: quote.jpyPerUsd,
      rateDate: quote.rateDate,
      fetchedAt: quote.fetchedAt,
      source: FX_RATE_SOURCE,
      fxProtectionPct,
      rateLabel: fxRateAdvisorHint(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load exchange rate";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}

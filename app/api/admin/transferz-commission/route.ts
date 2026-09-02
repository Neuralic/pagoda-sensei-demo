import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabaseServer";
import {
  clampTransferzPlatformCommissionPct,
  getTransferzPlatformCommissionPct,
  setTransferzPlatformCommissionPct,
} from "@/lib/transferz/platform-commission-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function assertActiveAdmin() {
  const jar = await cookies();
  const adminId = jar.get("userId")?.value;
  const role = jar.get("role")?.value;

  if (!adminId || role !== "admin") {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Unauthorized. Admin access required." },
        { status: 403 }
      ),
    };
  }

  const supabase = getSupabaseServer();
  const { data: admin, error } = await supabase
    .from("admin")
    .select("id, is_active")
    .eq("id", adminId)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !admin) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Unauthorized. Admin access required." },
        { status: 403 }
      ),
    };
  }

  return { ok: true as const, adminId, supabase };
}

export async function GET() {
  const gate = await assertActiveAdmin();
  if (!gate.ok) return gate.response;

  const commissionPct = await getTransferzPlatformCommissionPct(gate.supabase);
  return NextResponse.json({ ok: true, commissionPct });
}

export async function PUT(req: Request) {
  const gate = await assertActiveAdmin();
  if (!gate.ok) return gate.response;

  const body = (await req.json().catch(() => null)) as { commissionPct?: unknown } | null;
  const raw = body?.commissionPct;
  const parsed =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && raw.trim()
        ? Number(raw.trim())
        : NaN;

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    return NextResponse.json(
      { ok: false, error: "commissionPct must be a number between 0 and 100" },
      { status: 400 }
    );
  }

  try {
    const commissionPct = await setTransferzPlatformCommissionPct(
      gate.supabase,
      clampTransferzPlatformCommissionPct(parsed),
      gate.adminId
    );
    return NextResponse.json({ ok: true, commissionPct });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to save" },
      { status: 500 }
    );
  }
}

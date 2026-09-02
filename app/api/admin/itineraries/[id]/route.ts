import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { parseIntakeData } from "@/lib/itinerary-intake";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
    }

    const { data: row, error } = await auth.supabase
      .from("itineraries")
      .select(
        "id, name, location, status, start_date, end_date, created_at, build_mode, intake_data, user_id, image, description, arrival_transfer, arrival_flight_number, arrival_flight_time, departure_transfer, departure_flight_number, departure_flight_time"
      )
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("[admin/itineraries/[id]] fetch error:", error);
      return NextResponse.json({ ok: false, error: "Database error" }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    const { data: advisor } = await auth.supabase
      .from("users")
      .select("id, first_name, last_name, email")
      .eq("id", row.user_id)
      .maybeSingle();

    const advisorName = advisor
      ? `${advisor.first_name || ""} ${advisor.last_name || ""}`.trim() ||
        advisor.email ||
        "Advisor"
      : "Advisor";

    return NextResponse.json({
      ok: true,
      itinerary: {
        ...row,
        intake_data: parseIntakeData(row.intake_data),
        advisor_name: advisorName,
        advisor_email: advisor?.email ?? "",
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

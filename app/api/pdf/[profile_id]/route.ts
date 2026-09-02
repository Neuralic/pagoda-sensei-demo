import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { assertItineraryAccess, requireSessionActor } from "@/lib/itinerary-access";
import { forbidden } from "@/lib/api-response";

export const runtime = "nodejs";

interface ItineraryUpdate {
  trips_summary?: Record<string, { summary: string[] }>;
  arrival_location?: Record<string, string>;
  arrival_heading?: Record<string, string>;
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ profile_id: string }> }
) {
  try {
    // Await params first
    const params = await context.params;
    const { profile_id } = params;

    // Ran unauthenticated: it wrote profiles.website for any profile_id and itinerary content
    // for any itineraryId in the body. The caller must now be signed in, may only write their
    // own profile, and must have access to the itinerary they are editing.
    const session = await requireSessionActor();
    if (!session.ok) return session.response;
    if (!session.actor.isAdmin && session.actor.userId !== profile_id) {
      return forbidden("You can only update your own PDF profile.");
    }

    const supabase = getSupabaseServer();

    const { itineraryId, profile, summaries, arrivalLocations, arrivalHeadings, skipProfileUpdate } =
      await req.json();

    if (itineraryId) {
      const access = await assertItineraryAccess(
        supabase,
        session.actor,
        String(itineraryId),
        "write"
      );
      if (!access.ok) return access.response;
    }

    // Validate profile fields
    if (!profile) {
      return NextResponse.json({ error: "Profile data is required" }, { status: 400 });
    }

    const { website, title, subtitle } = profile;

    if (!skipProfileUpdate) {
      if (!website) {
        return NextResponse.json({ error: "Website is required" }, { status: 400 });
      }

      // Update profile website only (title/subtitle belong on the itinerary PDF fields)
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ website })
        .eq("user_id", profile_id);

      if (profileError) {
        return NextResponse.json({ error: profileError.message }, { status: 400 });
      }
    }

    // Validate itinerary
    if (!itineraryId) {
      return NextResponse.json({ error: "itineraryId is required" }, { status: 400 });
    }

    if (!summaries || !arrivalLocations || !arrivalHeadings) {
      return NextResponse.json({ error: "Summaries, arrival locations, and arrival headings are required" }, { status: 400 });
    }

    // Update itinerary - only update itinerary-specific fields, not title/subtitle
    const updateItinerary: Record<string, unknown> = {
      trips_summary: summaries,
      pdf_title: title,
      pdf_subtitle: subtitle,
      arrival_location: arrivalLocations,
      arrival_heading: arrivalHeadings,
    };

    const { error: itineraryError } = await supabase
      .from("itineraries")
      .update(updateItinerary)
      .eq("id", itineraryId);

    if (itineraryError) {
      return NextResponse.json({ error: itineraryError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("API Error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
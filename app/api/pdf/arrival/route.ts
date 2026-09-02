import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { assertItineraryAccess, requireSessionActor } from "@/lib/itinerary-access";
import { badRequest } from "@/lib/api-response";

export async function PUT(req: Request) {
    try {
        // Ran unauthenticated, taking the target itinerary from the body — anyone could
        // overwrite arrival_heading on any trip.
        const session = await requireSessionActor();
        if (!session.ok) return session.response;

        const { itineraryId, date, plan } = await req.json();

        if (!itineraryId) {
            return badRequest("itineraryId is required");
        }
        if (!date || !plan) {
            return NextResponse.json(
                { error: "Missing date or plan" },
                { status: 400 }
            );
        }

        const supabase = getSupabaseServer();

        const access = await assertItineraryAccess(
            supabase,
            session.actor,
            String(itineraryId),
            "write"
        );
        if (!access.ok) return access.response;

        // 1. Fetch existing JSON
        const { data: itinerary, error: fetchError } = await supabase
            .from("itineraries")
            .select("arrival_heading")
            .eq("id", itineraryId) // change as needed
            .single();

        if (fetchError) {
            return NextResponse.json(
                { error: "Failed to fetch itinerary" },
                { status: 500 }
            );
        }

        // Parse JSON (if null, create empty object)
        let currentData = itinerary?.arrival_heading || {};
        if (typeof currentData === "string") {
            try {
                currentData = JSON.parse(currentData);
            } catch {
                currentData = {};
            }
        }

        // 2. Update ONLY the selected date
        currentData[date] = plan;

        // 3. Save back to DB
        const { error: updateError } = await supabase
            .from("itineraries")
            .update({
                arrival_heading: currentData,
            })
            .eq("id", itineraryId);

        if (updateError) {
            return NextResponse.json(
                { error: "Failed to update itinerary" },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            message: "Arrival date updated successfully",
            updated: currentData,
        });
    } catch (error) {
        console.error("Unexpected Error:", error);
        return NextResponse.json(
            { error: "Server error" },
            { status: 500 }
        );
    }
}
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { computeGuideTotalFromTour } from "@/lib/tour-price";
import {
  fetchAssignedGuidesForTours,
  setTourGuideAssignments,
} from "@/lib/guide-tour-assignments";
import { activityTypePostgrestOrFilter, canonicalizeActivityTypeLabel } from "@/lib/tour-activity-types";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  context: { params: Promise<{ user_id: string }> }
) {
  try {
    const { user_id } = await context.params;
    const userId = user_id;

    const jar = await cookies();
    const sessionUserId = jar.get("userId")?.value ?? null;
    /** Guide tour library (same user) needs drafts + published + banned; everyone else only sees published. */
    const isOwner = Boolean(sessionUserId && sessionUserId === userId);

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    // For user's own tour library, show all tours (no limit) to prevent tours from disappearing
    // If a limit is explicitly requested, use it; otherwise fetch all tours
    const requestedLimit = searchParams.get("limit");
    const limit = requestedLimit ? parseInt(requestedLimit) : 10000; // Large limit to effectively get all tours
    const activityType = searchParams.get("activityType") || "";
    const location = searchParams.get("location") || "";

    const offset = (page - 1) * limit;
    const supabase = getSupabaseServer();

    let query = supabase
      .from("tour")
      .select("*", { count: "exact" })
      .eq("user_id", userId);

    if (!isOwner) {
      query = query.eq("status", "published");
    }

    if (activityType) {
      const actOr = activityTypePostgrestOrFilter(activityType);
      if (actOr) query = query.or(actOr);
    }
    if (location) query = query.ilike("location", `%${location}%`);

    // Only apply pagination if a limit was explicitly requested
    if (requestedLimit) {
      query = query.range(offset, offset + limit - 1);
    }

    const { data: tours, error, count } = await query.order("created_at", {
      ascending: false,
    });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // ✅ Fetch the user info (agent info)
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id, first_name, last_name, email")
      .eq("id", userId)
      .single();

    if (userError) {
      return NextResponse.json({ ok: false, error: userError.message }, { status: 500 });
    }

    const tourIds = (tours || []).map((t) => String(t.id));
    const guidesByTour = await fetchAssignedGuidesForTours(supabase, tourIds);

    // Guide sees their price; support both per_person and group_rate
    const enrichedTours = (tours || []).map((tour) => {
      const result = computeGuideTotalFromTour(
        {
          pricing_model: tour.pricing_model,
          price_per_adult: tour.price_per_adult,
          price_per_child: tour.price_per_child,
          price_per_infant: tour.price_per_infant,
          base_rate: tour.base_rate,
          base_group_size: tour.base_group_size,
          max_group_size: tour.max_group_size,
          additional_per_person_rate: tour.additional_per_person_rate,
        },
        tour.pricing_model === "group_rate"
          ? { adults: tour.base_group_size || 1, children: 0, infants: 0 }
          : { adults: 1, children: 0, infants: 0 }
      );
      const assignedGuides = guidesByTour[String(tour.id)] || [];
      const out: Record<string, unknown> = {
        ...tour,
        assignedGuides,
        needsGuideProfile: assignedGuides.length === 0,
        agent: {
          id: user.id,
          name: `${user.first_name || ""} ${user.last_name || ""}`.trim(),
          email: user.email,
        },
      };
      delete (out as Record<string, unknown>).guide_price;
      if (result) {
        out.displayPrice = result.guideTotal;
        out.priceLabel =
          tour.pricing_model === "group_rate"
            ? `From (up to ${tour.base_group_size || 1} people)`
            : "From (1 adult)";
      }
      return out;
    });

    return NextResponse.json({
      ok: true,
      tours: enrichedTours,
      user, // optional: include user info separately
      pagination: {
        page,
        limit,
        total: count || 0,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unexpected error" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: Request,
  context: { params: Promise<{ user_id: string }> }
) {
  try {
    const jar = await cookies();
    const sessionUserId = jar.get("userId")?.value;
    const sessionRole = jar.get("role")?.value;
    if (!sessionUserId) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }
    const isAdmin = sessionRole === "admin";

    const { user_id } = await context.params;
    const tourId = user_id;
    const body = await req.json();

    const {
      name,
      country,
      location,
      description,
      notes,
      languages,
      activityType,
      startTime,
      endTime,
      image,
      imagePaths,
      pricingModel,
      pricePerAdult,
      pricePerChild,
      pricePerInfant,
      baseRate,
      baseGroupSize,
      maxGroupSize,
      additionalPerPersonRate,
      guideIds,
    } = body;

    const supabase = getSupabaseServer();

    const { data: existing, error: existingErr } = await supabase
      .from("tour")
      .select("id, user_id, status")
      .eq("id", tourId)
      .maybeSingle();

    if (existingErr) {
      return NextResponse.json({ ok: false, error: existingErr.message }, { status: 500 });
    }
    // Owners can update their own tours; admins can update any tour.
    // (Previously admin edits failed here with a misleading "Tour not found".)
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Tour not found" }, { status: 404 });
    }
    const isOwner = String(existing.user_id) === sessionUserId;
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ ok: false, error: "Tour not found" }, { status: 404 });
    }
    const operatorId = String(existing.user_id);

    // Support both single image (backward compatibility) and imagePaths array
    let finalImagePaths: string[] | null = null;
    if (imagePaths) {
      // Validate that imagePaths is an array
      if (Array.isArray(imagePaths)) {
        // Filter out invalid paths (must be non-empty strings)
        const validPaths = imagePaths
          .filter((path): path is string => typeof path === "string" && path.trim().length > 0)
          .slice(0, 5); // Ensure max 5 images
        finalImagePaths = validPaths.length > 0 ? validPaths : null;
      }
    } else if (image && typeof image === "string" && image.trim().length > 0) {
      finalImagePaths = [image.trim()];
    }
    const imageValue = finalImagePaths ? JSON.stringify(finalImagePaths) : null;

    const pricePerAdultNum =
      typeof pricePerAdult === "number" && pricePerAdult >= 0 ? pricePerAdult : undefined;
    const pricePerChildNum =
      typeof pricePerChild === "number" && pricePerChild >= 0 ? pricePerChild : undefined;
    const pricePerInfantNum =
      typeof pricePerInfant === "number" && pricePerInfant >= 0 ? pricePerInfant : undefined;
    const pricingModelVal = pricingModel === "group_rate" ? "group_rate" : "per_person";
    const baseRateNum = typeof baseRate === "number" && baseRate >= 0 ? baseRate : undefined;
    const baseGroupSizeNum =
      typeof baseGroupSize === "number" && baseGroupSize >= 1 ? baseGroupSize : undefined;
    const maxGroupSizeNum =
      typeof maxGroupSize === "number" && maxGroupSize >= 1 ? Math.floor(maxGroupSize) : undefined;
    const additionalPerPersonRateNum =
      typeof additionalPerPersonRate === "number" && additionalPerPersonRate >= 0
        ? additionalPerPersonRate
        : undefined;

    const updatePayload: Record<string, unknown> = {
      name,
      country,
      location,
      description,
      notes,
      languages,
      activity_type: canonicalizeActivityTypeLabel(activityType) || activityType,
      start_time: startTime,
      end_time: endTime,
      image: imageValue,
      updated_at: new Date().toISOString(),
      pricing_model: pricingModelVal,
    };
    if (pricingModelVal === "group_rate") {
      // Switching to group_rate: clear per-person columns.
      updatePayload.price_per_adult = null;
      updatePayload.price_per_child = null;
      updatePayload.price_per_infant = null;
      if (baseRateNum !== undefined) updatePayload.base_rate = baseRateNum;
      if (baseGroupSizeNum !== undefined) updatePayload.base_group_size = baseGroupSizeNum;
      if (maxGroupSizeNum !== undefined) updatePayload.max_group_size = maxGroupSizeNum;
      if (additionalPerPersonRateNum !== undefined)
        updatePayload.additional_per_person_rate = additionalPerPersonRateNum;
    } else {
      // Switching to per_person: clear group-rate columns.
      updatePayload.base_rate = null;
      updatePayload.base_group_size = null;
      updatePayload.max_group_size = null;
      updatePayload.additional_per_person_rate = null;
      if (pricePerAdultNum !== undefined) updatePayload.price_per_adult = pricePerAdultNum;
      if (pricePerChildNum !== undefined) updatePayload.price_per_child = pricePerChildNum;
      if (pricePerInfantNum !== undefined) updatePayload.price_per_infant = pricePerInfantNum;
    }

    if (Array.isArray(guideIds)) {
      const result = await setTourGuideAssignments(
        supabase,
        operatorId,
        tourId,
        guideIds.map((g: unknown) => String(g))
      );
      if (!result.ok) {
        return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
      }
    } else if (String(existing.status) === "published") {
      // Ensure published tours always keep at least one guide profile link
      const guidesByTour = await fetchAssignedGuidesForTours(supabase, [String(tourId)]);
      if (!(guidesByTour[String(tourId)] || []).length) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Every published tour needs a linked guide profile. Select a guide profile before saving.",
          },
          { status: 400 }
        );
      }
    }

    const { data, error } = await supabase
      .from("tour")
      .update(updatePayload)
      .eq("id", tourId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      message: "Tour updated successfully",
      tour: data,
    });
  } catch (e) {
    console.error("Error updating tour:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unexpected error" },
      { status: 500 }
    );
  }
}

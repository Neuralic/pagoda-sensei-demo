import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { setTourGuideAssignments, validateGuidesHavePublishedProfiles, assertGuideAssignableToOperator } from "@/lib/guide-tour-assignments";
import { canonicalizeActivityTypeLabel } from "@/lib/tour-activity-types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const jar = await cookies();
    const userId = jar.get("userId")?.value;
    if (!userId) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }


    const body = (await req.json().catch(() => ({}))) as {
      name?: string;
      country?: string;
      location?: string;
      startTime?: string;
      endTime?: string;
      imagePath?: string | null;
      imagePaths?: string[] | null;
      description?: string | null;
      status?: string | null;
      notes?: string | null;
      languages?: string | null;
      activityType?: string | null;
      pricingModel?: "per_person" | "group_rate" | null;
      pricePerAdult?: number | null;
      pricePerChild?: number | null;
      pricePerInfant?: number | null;
      baseRate?: number | null;
      baseGroupSize?: number | null;
      maxGroupSize?: number | null;
      additionalPerPersonRate?: number | null;
      /** Guide user ids whose published profiles are linked to this tour (defaults to self). */
      guideIds?: string[] | null;
    };

    // Sanitize & normalize
    const name = body.name?.trim() ?? "";
    const country = body.country?.trim() ?? "";
    const location = body.location?.trim() ?? "";
    const startTime = body.startTime ?? "";
    const endTime = body.endTime ?? "";
    // Support both single imagePath (backward compatibility) and imagePaths array
    let imagePaths: string[] | null = null;
    if (body.imagePaths) {
      // Validate that imagePaths is an array
      if (Array.isArray(body.imagePaths)) {
        // Filter out invalid paths (must be non-empty strings)
        const validPaths = body.imagePaths
          .filter((path): path is string => typeof path === 'string' && path.trim().length > 0)
          .slice(0, 5); // Ensure max 5 images
        imagePaths = validPaths.length > 0 ? validPaths : null;
      }
    } else if (body.imagePath && typeof body.imagePath === 'string' && body.imagePath.trim().length > 0) {
      imagePaths = [body.imagePath.trim()];
    }

    // Require at least one image
    if (!imagePaths || imagePaths.length === 0) {
      return NextResponse.json({ ok: false, error: "At least one image is required to create a tour" }, { status: 400 });
    }
    const description = body.description ?? null;
    const status = body.status ?? null;
    const notes = body.notes ?? null;
    const languages = body.languages ?? null;
    const activityType = canonicalizeActivityTypeLabel(body.activityType) || body.activityType || null;
    const pricingModel = body.pricingModel === "group_rate" ? "group_rate" : "per_person";

    const pricePerAdult =
      typeof body.pricePerAdult === "number" && body.pricePerAdult >= 0 ? body.pricePerAdult : null;
    const pricePerChild =
      typeof body.pricePerChild === "number" && body.pricePerChild >= 0 ? body.pricePerChild : null;
    const pricePerInfant =
      typeof body.pricePerInfant === "number" && body.pricePerInfant >= 0 ? body.pricePerInfant : null;

    const baseRate = typeof body.baseRate === "number" && body.baseRate >= 0 ? body.baseRate : null;
    const baseGroupSize = typeof body.baseGroupSize === "number" && body.baseGroupSize >= 1 ? body.baseGroupSize : null;
    const maxGroupSize =
      typeof body.maxGroupSize === "number" && body.maxGroupSize >= 1 ? Math.floor(body.maxGroupSize) : null;
    const additionalPerPersonRate =
      typeof body.additionalPerPersonRate === "number" && body.additionalPerPersonRate >= 0
        ? body.additionalPerPersonRate
        : null;

    if (pricingModel === "group_rate") {
      if (baseRate == null || baseGroupSize == null) {
        return NextResponse.json(
          { ok: false, error: "Group rate requires base rate and base group size." },
          { status: 400 }
        );
      }
      if (additionalPerPersonRate == null) {
        return NextResponse.json(
          { ok: false, error: "Group rate requires additional per person rate (¥)." },
          { status: 400 }
        );
      }
      if (maxGroupSize == null) {
        return NextResponse.json(
          { ok: false, error: "Group rate requires maximum group size." },
          { status: 400 }
        );
      }
      if (maxGroupSize < baseGroupSize) {
        return NextResponse.json(
          { ok: false, error: "Maximum group size must be at least the base group size." },
          { status: 400 }
        );
      }
    } else {
      const hasPerPerson = pricePerAdult != null && pricePerChild != null && pricePerInfant != null;
      if (!hasPerPerson) {
        return NextResponse.json(
          { ok: false, error: "Per-person pricing (Adults, Children, Infants) is required." },
          { status: 400 }
        );
      }
    }

    // Validate required fields
    if (!name || !country || !location || !startTime || !endTime || !status) {
      return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    const guideIdsRaw = Array.isArray(body.guideIds) ? body.guideIds : [];
    const guideIds =
      guideIdsRaw.length > 0
        ? [...new Set(guideIdsRaw.map((g) => String(g).trim()).filter(Boolean))]
        : [userId];

    const supabase = getSupabaseServer();

    // Link guide profiles before insert so we don't leave orphan published tours
    // (setTourGuideAssignments needs tour id — validate profiles first)
    for (const gid of guideIds) {
      if (!(await assertGuideAssignableToOperator(supabase, userId, gid))) {
        return NextResponse.json(
          {
            ok: false,
            error:
              gid === userId
                ? "Invalid guide selection."
                : "Selected guide is not on your roster.",
          },
          { status: 400 }
        );
      }
    }
    if (status === "published" || !status) {
      const profileCheck = await validateGuidesHavePublishedProfiles(supabase, guideIds);
      if (!profileCheck.ok) {
        return NextResponse.json(
          {
            ok: false,
            error:
              profileCheck.error ||
              "Every tour needs a published guide profile link. Publish your guide profile, then try again.",
          },
          { status: 400 }
        );
      }
    }

    // Prepare insert object
    // Store image paths as JSON array in the image field (or use a separate images field if your schema supports it)
    const insert: Record<string, unknown> = {
      user_id: userId,
      name,
      country,
      location,
      start_time: startTime,
      end_time: endTime,
      image: imagePaths ? JSON.stringify(imagePaths) : null,
      description,
      status,
      notes,
      languages,
      activity_type: activityType,
      pricing_model: pricingModel,
    };
    if (pricePerAdult != null) insert.price_per_adult = pricePerAdult;
    if (pricePerChild != null) insert.price_per_child = pricePerChild;
    if (pricePerInfant != null) insert.price_per_infant = pricePerInfant;
    if (pricingModel === "group_rate") {
      if (baseRate != null) insert.base_rate = baseRate;
      if (baseGroupSize != null) insert.base_group_size = baseGroupSize;
      if (maxGroupSize != null) insert.max_group_size = maxGroupSize;
      insert.additional_per_person_rate = additionalPerPersonRate;
    }

    

    // Insert into Supabase
    const { data, error } = await supabase
      .from("tour")
      .insert(insert)
      .select("*")
      .single();


    if (error) return NextResponse.json({ ok: false, error: "Insert failed" }, { status: 500 });

    const assignResult = await setTourGuideAssignments(supabase, userId, data.id, guideIds);
    if (!assignResult.ok) {
      // Roll back tour so we never leave a published tour without a guide profile link
      await supabase.from("tour").delete().eq("id", data.id).eq("user_id", userId);
      return NextResponse.json({ ok: false, error: assignResult.error }, { status: 400 });
    }

    // Construct newTour including user_id & profile_id
    const newTour = {
      id: String(data.id),
      userId: String(data.user_id),
    //  profileId: String(data.profile_id),
      title: String(data.name),
      country: String(data.country),
      location: String(data.location),
      startTime: String(data.start_date),
      endTime: String(data.end_date),
      description: String(data.description ?? ""),
      notes: String(data.notes ?? ""),
      languages: String(data.languages ?? ""),
      activityType: String(data.activity_type ?? ""),
      jobsCount: 0,
      unassignedCount: 0,
      activities: [],
      status: String(data.status ?? "draft"),
      guideIds,
    };

    return NextResponse.json({ ok: true, tour: newTour });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const jar = await cookies();
    const userId = jar.get("userId")?.value;
    if (!userId) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const tourId = searchParams.get("id");

    if (!tourId) {
      return NextResponse.json({ ok: false, error: "Tour ID is required" }, { status: 400 });
    }

    const supabase = getSupabaseServer();

    // Verify the tour exists and belongs to the user
    const { data: tour, error: fetchError } = await supabase
      .from("tour")
      .select("id, user_id")
      .eq("id", tourId)
      .eq("user_id", userId)
      .maybeSingle();

    if (fetchError) {
      return NextResponse.json({ ok: false, error: "Database error" }, { status: 500 });
    }

    if (!tour) {
      return NextResponse.json({ ok: false, error: "Tour not found or you don't have permission to delete it" }, { status: 404 });
    }

    // Delete the tour
    const { error: deleteError } = await supabase
      .from("tour")
      .delete()
      .eq("id", tourId)
      .eq("user_id", userId); // Double check ownership

    if (deleteError) {
      return NextResponse.json({ ok: false, error: "Failed to delete tour" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: "Tour deleted successfully" });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

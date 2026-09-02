import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { requireAdmin } from "@/lib/admin-auth";
import { BUCKETS } from "@/lib/buckets";
import { calculateTimeDuration } from "@/lib/common-function";
import { computeGuideTotalFromTour } from "@/lib/tour-price";
import { userMatchesNameSearch } from "@/lib/user-name-search";

export const runtime = "nodejs";

/** Guide price shown in admin table: same “from” basis as guide tour list (1 adult vs up-to base group). */
function adminTableGuidePrice(tour: {
  guide_price?: unknown;
  pricing_model?: string | null;
  price_per_adult?: number | null;
  price_per_child?: number | null;
  price_per_infant?: number | null;
  base_rate?: number | null;
  base_group_size?: number | null;
  max_group_size?: number | null;
  additional_per_person_rate?: number | null;
}): number | null {
  const participants =
    tour.pricing_model === "group_rate"
      ? { adults: Math.max(1, Number(tour.base_group_size) || 1), children: 0, infants: 0 }
      : { adults: 1, children: 0, infants: 0 };

  const computed = computeGuideTotalFromTour(tour, participants);
  if (computed != null && Number.isFinite(computed.guideTotal)) {
    return computed.guideTotal;
  }

  const gp = tour.guide_price;
  const legacy =
    typeof gp === "number" ? gp : gp != null ? Number(gp) : Number.NaN;
  return Number.isFinite(legacy) ? legacy : null;
}

export async function GET(req: Request) {
  // Reads the whole table with the service-role client, so it must prove admin here
  // and not rely on middleware alone.
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const supabase = getSupabaseServer();
    const { searchParams } = new URL(req.url);

    /* =======================
       Pagination
    ======================= */
    const page = parseInt(searchParams.get("page") || "1");
    const perPage = parseInt(searchParams.get("perPage") || "10");
    const offset = (page - 1) * perPage;

    /* =======================
       Search
    ======================= */
    const searchQuery = searchParams.get("search") || "";
    const guideSearchQuery = searchParams.get("guideSearch") || "";
    const guideIdFilter = (searchParams.get("guideId") || "").trim();

    /* =======================
       Filter: weekly / monthly / yearly / all
    ======================= */
    const filter = searchParams.get("filter") || "all";
    const now = new Date();
    let startDate: string | null = null;

    if (filter === "weekly") {
      const d = new Date(now);
      d.setDate(now.getDate() - 7);
      startDate = d.toISOString();
    } else if (filter === "monthly") {
      const d = new Date(now);
      d.setMonth(now.getMonth() - 1);
      startDate = d.toISOString();
    } else if (filter === "yearly") {
      const d = new Date(now);
      d.setFullYear(now.getFullYear() - 1);
      startDate = d.toISOString();
    }

    /* =======================
       Status filter
    ======================= */
    const statusFilter = searchParams.get("status") || "all";
    
    // Validate status filter
    const validStatuses = ["all", "draft", "published", "banned"];
    const finalStatusFilter = validStatuses.includes(statusFilter) ? statusFilter : "all";

    /* =======================
       Step 1: Build base query with count
    ======================= */
    let countQuery = supabase
      .from("tour")
      .select("*", { count: "exact", head: true });

    let query = supabase
      .from("tour")
      .select(
        "id, user_id, name, activity_type, start_time, end_time, location, country, description, image, notes, languages, tour_date, adults, children, status, created_at, updated_at, guide_price, pricing_model, price_per_adult, price_per_child, price_per_infant, base_rate, base_group_size, max_group_size, additional_per_person_rate"
      );

    // Apply date filter
    if (startDate) {
      countQuery = countQuery.gte("created_at", startDate);
      query = query.gte("created_at", startDate);
    }

    // Apply status filter
    if (finalStatusFilter !== "all") {
      countQuery = countQuery.eq("status", finalStatusFilter);
      query = query.eq("status", finalStatusFilter);
    }

    if (guideIdFilter) {
      countQuery = countQuery.eq("user_id", guideIdFilter);
      query = query.eq("user_id", guideIdFilter);
    }

    // Apply search filter
    if (searchQuery) {
      countQuery = countQuery.or(`name.ilike.%${searchQuery}%,location.ilike.%${searchQuery}%,country.ilike.%${searchQuery}%`);
      query = query.or(`name.ilike.%${searchQuery}%,location.ilike.%${searchQuery}%,country.ilike.%${searchQuery}%`);
    }

    // Handle guide name search - need to find user IDs first
    let guideUserIds: string[] = [];
    const trimmedGuideSearch = guideSearchQuery.trim();
    if (trimmedGuideSearch) {
      // Search by first_name, last_name, or concatenated full name
      // Fetch users and filter by full name in code since Supabase query builder
      // doesn't easily support concatenated field searches
      const { data: allUsers, error: usersSearchError } = await supabase
        .from("users")
        .select("id, first_name, last_name");
      
      if (usersSearchError) {
        return NextResponse.json({ error: usersSearchError.message }, { status: 500 });
      }
      
      const matchingUsers = (allUsers || []).filter((user) =>
        userMatchesNameSearch(user, trimmedGuideSearch)
      );
      
      guideUserIds = matchingUsers.map((u) => u.id).filter((id): id is string => !!id);
      
      // If no users match, return empty results
      if (guideUserIds.length === 0) {
        return NextResponse.json({
          success: true,
          page,
          perPage,
          total: 0,
          tours: [],
        });
      }
      
      // Filter tours by matching user IDs
      countQuery = countQuery.in("user_id", guideUserIds);
      query = query.in("user_id", guideUserIds);
    }
    // If trimmedGuideSearch is empty, don't apply any guide filter (show all tours)

    const { count, error: countError } = await countQuery;
    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }

    /* =======================
       Step 2: Fetch paginated tours
    ======================= */
    const { data: tours, error: toursError } = await query
      .range(offset, offset + perPage - 1)
      .order("created_at", { ascending: false });

    if (toursError) {
      return NextResponse.json({ error: toursError.message }, { status: 500 });
    }

    /* =======================
       Step 3: Fetch users (creators)
    ======================= */
    const userIds = [
      ...new Set((tours || []).map((t) => t.user_id).filter((id): id is string => !!id)),
    ];

    let users: Array<Record<string, unknown>> = [];
    let profiles: Array<Record<string, unknown>> = [];

    if (userIds.length > 0) {
      const { data: uData, error: usersErr } = await supabase
        .from("users")
        .select("id, first_name, last_name, email")
        .in("id", userIds);

      if (usersErr) {
        return NextResponse.json({ error: usersErr.message }, { status: 500 });
      }
      users = uData || [];

      const { data: pData, error: profilesErr } = await supabase
        .from("profiles")
        .select("id, user_id, profile_picture_path")
        .in("user_id", userIds);

      if (profilesErr) {
        return NextResponse.json({ error: profilesErr.message }, { status: 500 });
      }
      profiles = pData || [];
    }

    /* =======================
       Step 4: Create lookup maps
    ======================= */
    const usersById: Record<string, Record<string, unknown>> = {};
    for (const u of users) {
      const id = (u as Record<string, unknown>)?.id;
      if (typeof id === "string") usersById[id] = u;
    }

    const profilesByUserId: Record<string, Record<string, unknown>> = {};
    for (const p of profiles) {
      const uid = (p as Record<string, unknown>)?.user_id;
      if (typeof uid === "string") profilesByUserId[uid] = p;
    }

    /* =======================
       Step 5: Enrich tours with agent details
    ======================= */
    const enrichedTours = (tours || []).map((tour) => {
      const user = usersById[tour.user_id] || null;
      const profile = profilesByUserId[tour.user_id] || null;

      const agencyName = user
        ? `${user.first_name || ""} ${user.last_name || ""}`.trim() || "Agency"
        : "Agency";

      let avatarUrl: string | null = null;
      const path = profile?.profile_picture_path;
      if (typeof path === "string" && path) {
        try {
          const { data: pub } = supabase.storage
            .from(BUCKETS.avatars)
            .getPublicUrl(path);
          avatarUrl =
            (pub as Record<string, unknown> | null)?.publicUrl as string || null;
        } catch {
          avatarUrl = null;
        }
      }

      // Calculate duration from start_time and end_time
      const duration = calculateTimeDuration(tour.start_time, tour.end_time);

      const guidePrice = adminTableGuidePrice(tour);

      return {
        ...tour,
        duration,
        guidePrice,
        agent: {
          id: tour.user_id,
          name: agencyName,
          user: user
            ? {
                id: user.id,
                firstName: user.first_name,
                lastName: user.last_name,
                email: user.email,
              }
            : null,
          profile: profile
            ? {
                id: profile.id,
                userId: profile.user_id,
                avatarPath: profile.profile_picture_path,
                avatarUrl,
              }
            : null,
        },
      };
    });

    return NextResponse.json({
      success: true,
      page,
      perPage,
      total: count || 0,
      tours: enrichedTours,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  // Reads the whole table with the service-role client, so it must prove admin here
  // and not rely on middleware alone.
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const supabase = getSupabaseServer();
    const { searchParams } = new URL(req.url);
    const tourId = searchParams.get("id");

    if (!tourId) {
      return NextResponse.json({ error: "Tour ID is required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("tour")
      .delete()
      .eq("id", tourId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Tour deleted successfully" });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  // Reads the whole table with the service-role client, so it must prove admin here
  // and not rely on middleware alone.
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const supabase = getSupabaseServer();
    const body = await req.json();
    const { id, status } = body;

    if (!id) {
      return NextResponse.json({ error: "Tour ID is required" }, { status: 400 });
    }

    if (status !== undefined && !["draft", "published", "banned"].includes(status)) {
      return NextResponse.json({ error: "Invalid status. Must be 'draft' or 'published'" }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (status !== undefined) {
      updateData.status = status;
    }

    const { data, error } = await supabase
      .from("tour")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, tour: data });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}


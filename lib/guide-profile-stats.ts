import type { SupabaseClient } from "@supabase/supabase-js";

export async function getGuideBookingCount(
  supabase: SupabaseClient,
  guideUserId: string
): Promise<number> {
  const { count, error } = await supabase
    .from("job_hiring_history")
    .select("id", { count: "exact", head: true })
    .eq("guide_id", guideUserId);

  if (error) return 0;
  return count ?? 0;
}

export async function getGuideRatingSummary(
  supabase: SupabaseClient,
  guideUserId: string
): Promise<{ average: number | null; count: number }> {
  const { data } = await supabase
    .from("reviews")
    .select("rating")
    .eq("reviewee_id", guideUserId)
    .eq("is_visible", true);

  const rows = data || [];
  if (rows.length === 0) return { average: null, count: 0 };
  const sum = rows.reduce((s, r) => s + ((r as { rating: number }).rating || 0), 0);
  return {
    average: Math.round((sum / rows.length) * 10) / 10,
    count: rows.length,
  };
}

export async function enrichGuidesWithStats(
  supabase: SupabaseClient,
  guideIds: string[]
): Promise<
  Record<string, { bookingCount: number; ratingAverage: number | null; reviewCount: number }>
> {
  const out: Record<
    string,
    { bookingCount: number; ratingAverage: number | null; reviewCount: number }
  > = {};
  await Promise.all(
    guideIds.map(async (id) => {
      const [bookingCount, rating] = await Promise.all([
        getGuideBookingCount(supabase, id),
        getGuideRatingSummary(supabase, id),
      ]);
      out[id] = {
        bookingCount,
        ratingAverage: rating.average,
        reviewCount: rating.count,
      };
    })
  );
  return out;
}

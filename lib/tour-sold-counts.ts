import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Count how many times each catalog tour has been hired (sold).
 * Uses job_hiring_history joined to jobs.tour_id.
 */
export async function getTourSoldCounts(
  supabase: SupabaseClient,
  tourIds: Array<string | number>
): Promise<Record<string, number>> {
  const ids = [...new Set(tourIds.map((id) => String(id)).filter(Boolean))];
  if (ids.length === 0) return {};

  const numericIds = ids
    .map((id) => Number(id))
    .filter((n) => Number.isFinite(n) && n > 0);

  let jobsQuery = supabase.from("jobs").select("id, tour_id").not("tour_id", "is", null);
  if (numericIds.length > 0 && numericIds.length === ids.length) {
    jobsQuery = jobsQuery.in("tour_id", numericIds);
  } else {
    jobsQuery = jobsQuery.in("tour_id", ids);
  }

  const { data: jobs, error: jobsErr } = await jobsQuery;
  if (jobsErr || !jobs?.length) return {};

  const jobIds = jobs
    .map((j) => (j as { id?: string }).id)
    .filter((id): id is string => Boolean(id));
  if (jobIds.length === 0) return {};

  const { data: history, error: histErr } = await supabase
    .from("job_hiring_history")
    .select("job_id")
    .in("job_id", jobIds);
  if (histErr || !history?.length) return {};

  const hiredJobIds = new Set(
    history.map((h) => String((h as { job_id?: string }).job_id || "")).filter(Boolean)
  );

  const counts: Record<string, number> = {};
  for (const job of jobs) {
    const jobId = String((job as { id?: string }).id || "");
    const tourId = String((job as { tour_id?: string | number | null }).tour_id ?? "");
    if (!jobId || !tourId || !hiredJobIds.has(jobId)) continue;
    counts[tourId] = (counts[tourId] || 0) + 1;
  }
  return counts;
}

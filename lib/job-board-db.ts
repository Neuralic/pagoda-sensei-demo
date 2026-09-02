import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isJobTakenByApplications,
  type BoardHiddenReason,
} from "@/lib/job-board-visibility";

export async function hideJobFromBoard(
  supabase: SupabaseClient,
  jobId: string,
  reason: BoardHiddenReason
) {
  return supabase
    .from("jobs")
    .update({ job_available: false, board_hidden_reason: reason })
    .eq("id", jobId);
}

export async function reopenJobOnBoard(supabase: SupabaseClient, jobId: string) {
  return supabase
    .from("jobs")
    .update({ job_available: true, board_hidden_reason: null })
    .eq("id", jobId);
}

/** Message if this job must not accept new guide applications. */
export async function getJobClosedToApplicationsMessage(
  supabase: SupabaseClient,
  jobId: string,
  job?: { job_available?: boolean | null }
): Promise<string | null> {
  if (job?.job_available === false) {
    return "This job is no longer open for applications.";
  }

  const { data: activeHire } = await supabase
    .from("job_hiring_history")
    .select("id")
    .eq("job_id", jobId)
    .eq("is_closed", false)
    .limit(1);

  if (activeHire && activeHire.length > 0) {
    return "This job has been filled.";
  }

  const { data: apps } = await supabase
    .from("job_applications")
    .select("offer_status, hire_id")
    .eq("job_id", jobId);

  if (isJobTakenByApplications(apps)) {
    return "This job has been filled.";
  }

  return null;
}

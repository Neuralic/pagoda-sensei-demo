/** Shared rules for hiding jobs from the guide job board (data stays in DB). */

export const HIRED_OFFER_STATUSES = new Set(["completed", "hired"]);

export type BoardHiddenReason = "hired" | "past_date" | "accepted" | "manual";

export type JobApplicationLike = {
  offer_status?: string | null;
  hire_id?: string | null;
};

export function isJobPastByStartTime(
  startTime: string | null | undefined,
  now = new Date()
): boolean {
  if (!startTime) return false;
  const start = new Date(startTime);
  if (Number.isNaN(start.getTime())) return false;
  return start.getTime() < now.getTime();
}

export function isJobHiredByApplications(
  apps: JobApplicationLike[] | null | undefined
): boolean {
  if (!apps?.length) return false;
  return apps.some(
    (a) =>
      HIRED_OFFER_STATUSES.has(String(a.offer_status ?? "")) ||
      (typeof a.hire_id === "string" && a.hire_id.length > 0)
  );
}

/** Guide has committed (accepted) or job is fully hired — hide from open bidding. */
export function isJobTakenByApplications(
  apps: JobApplicationLike[] | null | undefined
): boolean {
  if (!apps?.length) return false;
  return apps.some((a) => {
    const status = String(a.offer_status ?? "");
    return (
      HIRED_OFFER_STATUSES.has(status) ||
      status === "accepted" ||
      (typeof a.hire_id === "string" && a.hire_id.length > 0)
    );
  });
}

export function shouldShowOnGuideJobBoard(
  job: {
    job_available?: boolean | null;
    start_time?: string | null;
  },
  applications?: JobApplicationLike[] | null
): boolean {
  if (job.job_available === false) return false;
  if (isJobPastByStartTime(job.start_time)) return false;
  if (isJobTakenByApplications(applications)) return false;
  return true;
}

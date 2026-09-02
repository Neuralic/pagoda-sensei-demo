import { JobApplicationRow, JobRow } from "@/app/types";

export interface JobWithMultipleCandidates {
  id: string;
  name: string;
  candidateCount: number;
}

/**
 * Check if any jobs have multiple candidates
 * Returns an array of jobs that have more than one candidate
 */
export function checkMultipleCandidates(jobs: JobRow[]): JobWithMultipleCandidates[] {
  if (!Array.isArray(jobs) || jobs.length === 0) return [];
  
  const jobsWithMultiple: JobWithMultipleCandidates[] = [];
  
  jobs.forEach((job) => {
    const applications = job.job_applications || [];
    // Count candidates (is_candidate === true or offer_status === "candidate" or "accepted")
    const candidates = applications.filter((app: JobApplicationRow) => {
      return app.is_candidate === true || 
             app.offer_status === "candidate" || 
             app.offer_status === "accepted";
    });
    
    // Only count non-hired candidates (hired guides are fine to show)
    const nonHiredCandidates = candidates.filter((app: JobApplicationRow) => {
      return app.offer_status !== "completed" && app.offer_status !== "hired";
    });
    
    if (nonHiredCandidates.length >= 2) {
      jobsWithMultiple.push({
        id: job.id,
        name: job.name || "Unnamed Job",
        candidateCount: nonHiredCandidates.length,
      });
    }
  });
  
  return jobsWithMultiple;
}


"use client";

import { useState, useEffect } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";

interface JobWithMultipleCandidates {
  id: string;
  name: string;
  candidateCount: number;
}

interface Candidate {
  id: string;
  applicant_id: string;
  first_name?: string;
  last_name?: string;
  why?: string;
  profile_picture_path?: string;
  signedAvatarUrl?: string;
  offer_status?: string;
  is_candidate?: boolean;
  is_finalist?: boolean;
  languages?: string[];
}

interface MultipleCandidatesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobs: JobWithMultipleCandidates[];
  role?: string;
  onFinalistsSelected?: () => void;
}

export function MultipleCandidatesModal({
  open,
  onOpenChange,
  jobs,
  role = "agent",
  onFinalistsSelected,
}: MultipleCandidatesModalProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [jobCandidates, setJobCandidates] = useState<Record<string, Candidate[]>>({});
  const [selectedFinalists, setSelectedFinalists] = useState<Record<string, string>>({});

  // Fetch candidates for each job
  useEffect(() => {
    if (!open || jobs.length === 0) return;

    const fetchCandidates = async () => {
      setLoading(true);
      const candidatesMap: Record<string, Candidate[]> = {};

      try {
        await Promise.all(
          jobs.map(async (job) => {
            try {
              const response = await fetch(`/api/hire?jobId=${job.id}`);
              const data = await response.json();

              if (data.applications) {
                // Filter to only show candidates (not all applicants)
                const candidates = data.applications.filter((app: any) => {
                  return (
                    app.is_candidate === true ||
                    app.offer_status === "candidate" ||
                    app.offer_status === "accepted"
                  ) && (
                    app.offer_status !== "completed" && app.offer_status !== "hired"
                  );
                });

                candidatesMap[job.id] = candidates;

                // Set initial selection to current finalist, or first candidate if none
                const currentFinalist = candidates.find((c: Candidate) => c.is_finalist === true);
                if (currentFinalist) {
                  setSelectedFinalists((prev) => ({
                    ...prev,
                    [job.id]: currentFinalist.applicant_id,
                  }));
                } else if (candidates.length > 0) {
                  setSelectedFinalists((prev) => ({
                    ...prev,
                    [job.id]: candidates[0].applicant_id,
                  }));
                }
              }
            } catch (error) {
              console.error(`Error fetching candidates for job ${job.id}:`, error);
            }
          })
        );

        setJobCandidates(candidatesMap);
      } catch (error) {
        console.error("Error fetching candidates:", error);
        toast.error("Failed to load candidates");
      } finally {
        setLoading(false);
      }
    };

    fetchCandidates();
  }, [open, jobs]);

  const handleSave = async () => {
    setSaving(true);
    const errors: string[] = [];

    try {
      await Promise.all(
        jobs.map(async (job) => {
          const selectedApplicantId = selectedFinalists[job.id];
          if (!selectedApplicantId) {
            errors.push(`No finalist selected for ${job.name}`);
            return;
          }

          try {
            const response = await fetch("/api/jobs/finalist", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                job_id: job.id,
                applicant_ids: [selectedApplicantId],
              }),
            });

            const data = await response.json();
            if (!data.ok) {
              errors.push(`Failed to set finalist for ${job.name}: ${data.error}`);
            }
          } catch (error) {
            errors.push(`Error setting finalist for ${job.name}`);
          }
        })
      );

      if (errors.length > 0) {
        toast.error(errors.join(", "));
      } else {
        toast.success("Finalists selected successfully!");
        if (onFinalistsSelected) {
          await onFinalistsSelected();
        }
        onOpenChange(false);
      }
    } catch (error) {
      toast.error("Failed to save finalist selections");
    } finally {
      setSaving(false);
    }
  };

  const getCandidateName = (candidate: Candidate) => {
    if (candidate.first_name || candidate.last_name) {
      return `${candidate.first_name || ""} ${candidate.last_name || ""}`.trim();
    }
    return "Unknown Guide";
  };

  const getCandidateInitials = (candidate: Candidate) => {
    const first = candidate.first_name?.[0] || "";
    const last = candidate.last_name?.[0] || "";
    return (first + last).toUpperCase() || "G";
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>Select Guides for PDF</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              <div>
                <p className="text-base font-medium text-foreground mb-2">
                  The following jobs have 2 or more candidates. Please select 1 guide for each job to appear in the PDF.
                </p>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">Loading candidates...</span>
                </div>
              ) : (
                <div className="space-y-4">
                  {jobs.map((job) => {
                    const candidates = jobCandidates[job.id] || [];
                    const selectedId = selectedFinalists[job.id];

                    return (
                      <div
                        key={job.id}
                        className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 space-y-3"
                      >
                        <div className="font-medium text-yellow-900 text-sm">
                          {job.name}
                        </div>
                        <div className="text-xs text-muted-foreground mb-3">
                          {candidates.length} candidate{candidates.length !== 1 ? "s" : ""}
                        </div>

                        {candidates.length === 0 ? (
                          <div className="text-sm text-muted-foreground">No candidates available</div>
                        ) : (
                          <RadioGroup
                            value={selectedId || ""}
                            onValueChange={(value) => {
                              setSelectedFinalists((prev) => ({
                                ...prev,
                                [job.id]: value,
                              }));
                            }}
                            className="space-y-2"
                          >
                            {candidates.map((candidate) => {
                              const isSelected = selectedId === candidate.applicant_id;
                              const avatarUrl = candidate.signedAvatarUrl || 
                                (candidate.profile_picture_path?.startsWith('http') 
                                  ? candidate.profile_picture_path 
                                  : null);

                              return (
                                <div
                                  key={candidate.applicant_id}
                                  className={`flex items-center space-x-3 p-3 rounded-md border-2 transition-colors ${
                                    isSelected
                                      ? "border-[#D4AA25] bg-yellow-50"
                                      : "border-gray-200 bg-white hover:border-gray-300"
                                  }`}
                                >
                                  <RadioGroupItem
                                    value={candidate.applicant_id}
                                    id={`${job.id}-${candidate.applicant_id}`}
                                    className="mt-0"
                                  />
                                  <Label
                                    htmlFor={`${job.id}-${candidate.applicant_id}`}
                                    className="flex-1 flex items-center space-x-3 cursor-pointer"
                                  >
                                    <Avatar className="w-10 h-10">
                                      <AvatarImage src={avatarUrl || undefined} alt={getCandidateName(candidate)} />
                                      <AvatarFallback className="bg-[#D4AA25] text-white text-sm">
                                        {getCandidateInitials(candidate)}
                                      </AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1">
                                      <div className="font-medium text-sm text-foreground">
                                        {getCandidateName(candidate)}
                                      </div>
                                      {candidate.why && (
                                        <div className="text-xs text-muted-foreground mt-1">
                                          {candidate.why}
                                        </div>
                                      )}
                                      {candidate.languages && candidate.languages.length > 0 && (
                                        <div className="text-xs text-muted-foreground mt-1">
                                          Languages: {candidate.languages.join(", ")}
                                        </div>
                                      )}
                                    </div>
                                    {candidate.is_finalist && (
                                      <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
                                        Current Finalist
                                      </span>
                                    )}
                                  </Label>
                                </div>
                              );
                            })}
                          </RadioGroup>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleSave}
            disabled={loading || saving || jobs.some((job) => !selectedFinalists[job.id])}
            className="bg-[#D4AA25] hover:bg-[#C49A1F] text-white"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save & Continue to PDF"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

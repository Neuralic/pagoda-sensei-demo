"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle2, XCircle, Clock } from "lucide-react";
import toast from "react-hot-toast";
import { JobClosedReviewModal } from "@/components/reviews/job-closed-review-modal";
import { supabase } from "@/lib/supabase";

interface EndRequest {
  id: string;
  job_id: string;
  hiring_history_id: string;
  agent_id: string;
  guide_id: string;
  status: "pending" | "accepted" | "rejected";
  requested_at: string;
  responded_at?: string;
  job?: {
    id: string;
    name: string;
    location?: string;
    start_time?: string;
  };
}

export function EndRequestNotification() {
  const [requests, setRequests] = useState<EndRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState<string | null>(null);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewJobId, setReviewJobId] = useState<string | null>(null);
  const [reviewJobName, setReviewJobName] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const mountedRef = useRef(true);

  // Get current user ID and role
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/user", { cache: 'no-store' });
        const json = await res.json().catch(() => ({}));
        if (!cancelled && json?.ok && json.user?.id) {
          setCurrentUserId(json.user.id);
          setUserRole(json.user.role || null);
        }
      } catch (error) {
        console.error("Error fetching user:", error);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchRequests = async () => {
    try {
      const res = await fetch("/api/jobs/end-request");
      const data = await res.json();

      if (data.ok && Array.isArray(data.requests)) {
        if (mountedRef.current) {
          setRequests(data.requests);
        }
      }
    } catch (error) {
      console.error("Error fetching end requests:", error);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  };

  // Initial fetch
  useEffect(() => {
    if (currentUserId && userRole) {
      fetchRequests();
    }
  }, [currentUserId, userRole]);

  // Real-time subscription for job_end_requests
  useEffect(() => {
    if (!currentUserId || !userRole) return;

    // Determine filter based on role
    const filter = userRole === "guide" 
      ? `guide_id=eq.${currentUserId}`
      : `agent_id=eq.${currentUserId}`;

    // Subscribe to INSERT events (new requests)
    const insertChannel = supabase
      .channel('end-requests:insert')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'job_end_requests',
          filter: filter,
        },
        (payload) => {
          if (!mountedRef.current) return;
          // Refresh requests when a new one is created
          fetchRequests();
        }
      )
      .subscribe();

    // Subscribe to UPDATE events (status changes)
    const updateChannel = supabase
      .channel('end-requests:update')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'job_end_requests',
          filter: filter,
        },
        (payload) => {
          if (!mountedRef.current) return;
          // Refresh requests when status changes
          fetchRequests();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(insertChannel);
      supabase.removeChannel(updateChannel);
    };
  }, [currentUserId, userRole]);

  const handleRespond = async (requestId: string, action: "accept" | "reject") => {
    setResponding(requestId);
    try {
      const res = await fetch("/api/jobs/end-request/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: requestId, action }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to respond to request");
      }

      if (action === "accept") {
        toast.success("Job end request accepted. Job is now closed.");
        // Find the request to get job info
        const request = requests.find((r) => r.id === requestId);
        if (request) {
          setReviewJobId(request.job_id);
          setReviewJobName(request.job?.name || null);
          setReviewModalOpen(true);
        }
      } else {
        toast.success("Job end request rejected.");
      }

      // Refresh requests
      await fetchRequests();
    } catch (error) {
      console.error("Error responding to request:", error);
      toast.error(error instanceof Error ? error.message : "Failed to respond to request");
    } finally {
      setResponding(null);
    }
  };

  if (loading) {
    return null;
  }

  const pendingRequests = requests.filter((r) => r.status === "pending");

  if (pendingRequests.length === 0) {
    return null;
  }

  return (
    <>
      {pendingRequests.length > 0 && (
        <div className="space-y-3 mb-6">
          <h3 className="text-lg font-semibold text-foreground mb-2">
            Job Termination Requests
          </h3>
          {pendingRequests.map((request) => (
            <Alert key={request.id} className="border-orange-300 bg-orange-50 shadow-md">
              <Clock className="h-5 w-5 text-orange-600" />
              <AlertTitle className="text-orange-900 font-semibold text-base">
                Job Termination Request
              </AlertTitle>
              <AlertDescription className="text-orange-800 mt-2">
                <p className="mb-3 text-sm">
                  An agent has requested to terminate the job:{" "}
                  <strong className="font-semibold">{request.job?.name || "Unknown Job"}</strong>
                  {request.job?.location && (
                    <span className="text-orange-700"> • {request.job.location}</span>
                  )}
                </p>
                <p className="text-xs text-orange-700 mb-3">
                  Please review and respond to this request. Once accepted, the job will be closed and you'll be able to leave a review.
                </p>
                <div className="flex gap-2 mt-4">
                  <Button
                    size="sm"
                    onClick={() => handleRespond(request.id, "accept")}
                    disabled={responding === request.id}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                    {responding === request.id ? "Processing..." : "Accept"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRespond(request.id, "reject")}
                    disabled={responding === request.id}
                    className="border-red-300 text-red-700 hover:bg-red-50"
                  >
                    <XCircle className="h-4 w-4 mr-1" />
                    Reject
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {reviewJobId && (
        <JobClosedReviewModal
          isOpen={reviewModalOpen}
          onClose={() => {
            setReviewModalOpen(false);
            setReviewJobId(null);
            setReviewJobName(null);
          }}
          jobId={reviewJobId}
          jobName={reviewJobName || undefined}
          onReviewSubmitted={() => {
            // Optionally refresh data
          }}
        />
      )}
    </>
  );
}


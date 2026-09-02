"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { BidsClient } from "@/components/guide/BidsClient";
import Link from "next/link";
import { ArrowLeft, Calendar, MapPin, Users, FileEdit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getSignedUrls } from "@/lib/storage-sign-client";
import { BUCKETS } from "@/lib/buckets";
import { formatDate } from "@/lib/utils";
type User = {
    id: string;
    name: string;
    lastName?: string;
    email: string;
    role: string | undefined;
    avatar: string;
};
type Job = {
    id: string;
    name?: string | null;
    description?: string | null;
    location?: string | null;
    start_time?: string | null |undefined;
    end_time?: string | null;
    images?: string[] | null;
    signedImageUrls?: string[] | null;
    languages?: string[] | null;
    group_size?: number | null;
    min_price?: number | null;
    max_price?: number | null;
    created_at?: string | null;
    itinerary_id?: string | null;
};

interface Application {
    id: string
    applicant_id: string
    first_name?: string
    last_name?: string
    applicant_name?: string
    why?: string
    signedAvatarUrl?: string
    languages: string[]
    status?: string
    submitted_at?: string
    guide_price?: number
    hire_id?: string
    offer_status?: string
    is_candidate?: boolean
    is_finalist?: boolean
    total_price?: number | null
    profile_slug?: string
}

function BidsPageInner() {
    const searchParams = useSearchParams();
    const router = useRouter();

    const jobId = searchParams.get("jobId") ?? "";
    const [user, setUser] = useState<User>({
        id: '',
        name: '',
        lastName: '',
        email: '',
        role: '',
        avatar: ''
    });
    const [job, setJob] = useState<Job | null>(null);
    const [applications, setApplications] = useState<Application[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!jobId) return;

        async function fetchData() {
            setLoading(true);
            try {
                const res = await fetch(`/api/hire?jobId=${jobId}`);
                const data = await res.json();
                setJob(data.job);
                setApplications(data.applications);
                console.log("applications: ", data.applications);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        }

        fetchData();
    }, [jobId]);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            try {
                const res = await fetch('/api/user', { cache: 'no-store' });
                const data = await res.json();
                const profileRes = await fetch("/api/profile");
                const profileData = await profileRes.json();
                const userData = data?.account || data?.user;

                let avatar = "";
                if (profileData.profile?.profile_picture_path) {
                    const resp = await getSignedUrls([
                        { bucket: BUCKETS.avatars, path: profileData.profile.profile_picture_path },
                    ]);
                    avatar = resp[0]?.signedUrl ?? "";
                }

                if (!cancelled) {
                    setUser({
                        id: userData.id,
                        name: `${userData.first_name ?? ''} ${userData.last_name ?? ''}`.trim() || 'User',
                        lastName: userData.last_name ?? undefined,
                        email: userData.email ?? '',
                        role: (userData as { role?: string }).role ?? undefined,
                        avatar: avatar ?? undefined
                    });
                }
            } catch (err) {
                console.error("Error loading user:", err);
            }
        }

        load();

        return () => { cancelled = true; };
    }, []);

    if (loading) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mb-4" />
            <p className="text-muted-foreground">Loading job and applications…</p>
          </div>
        </div>
      );
    }
    if (!job) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-6">
          <div className="text-center">
            <p className="text-lg font-medium text-foreground">Job not found</p>
            <p className="text-sm text-muted-foreground mt-1">This job may have been removed or you don’t have access.</p>
            <button
              onClick={() => router.back()}
              className="mt-4 text-sm text-primary hover:underline cursor-pointer"
            >
              Go back
            </button>
          </div>
        </div>
      );
    }

    return (
            <div className="lg:p-8 pt-0 container mx-auto">
                <div className="min-h-screen bg-background">
                    {/* Back Navigation */}
                    <div className="border-b border-border bg-card">
                        <div className="container mx-auto px-4 py-4">
                            <button
                                onClick={() => router.back()}
                                className="inline-flex items-center gap-2 text-sm hover:text-foreground transition-colors cursor-pointer"
                            >
                                <ArrowLeft className="h-4 w-4" />
                                Back
                            </button>
                        </div>
                    </div>

                    {/* Hero Section */}
                    <div className="relative h-[280px] overflow-hidden rounded-xl mb-8">
                        <div
                            className="absolute rounded-3xl inset-0 bg-cover bg-center"
                            style={{
                                backgroundImage: `url(${job?.signedImageUrls?.[0] || job?.images?.[0] || '/assets/placeholder.svg'})`,
                            }}
                        >
                            <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/30 to-black/60" />
                        </div>

                        <div className="relative container mx-auto px-4 h-full flex flex-col justify-between py-8">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <h1 className="text-4xl md:text-5xl font-bold text-white mb-3 text-balance">{job ? String(job.name) : 'Job'}</h1>
                                    {/* <p className="text-lg text-white/95 max-w-2xl text-pretty">
                                        {job ? String(job.description ?? '') : 'Job details and applications will appear here.'}
                                    </p> */}
                                </div>
                                {job?.itinerary_id && (
                                    <Button variant="secondary" size="sm" className="gap-1.5 shrink-0 bg-white/95 text-foreground hover:bg-white" asChild>
                                        <Link href={`/agent/edit-itinerary?itineraryId=${job.itinerary_id}`}>
                                            <FileEdit className="h-4 w-4" />
                                            Edit itinerary
                                        </Link>
                                    </Button>
                                )}
                            </div>

                            {/* Info Cards */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <Card className="p-4 border-0">
                                    <div className="flex items-start gap-3">
                                        <div className="bg-[#FEEEC9] p-2 rounded-lg">
                                            <MapPin className="h-5 w-5 text-primary" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-xs text-white mb-1">Destination</p>
                                            <p className="font-semibold foreground text-white text-sm">{job?.location ?? '—'}</p>
                                        </div>
                                    </div>
                                </Card>

                                <Card className="p-4 border-0">
                                    <div className="flex items-start gap-3">
                                        <div className="bg-[#FEEEC9] p-2 rounded-lg">
                                            <Calendar className="h-5 w-5 text-primary" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-xs text-white mb-1">Date</p>
                                            <p className="font-semibold  text-white text-sm">{formatDate(job?.start_time)}</p>
                                        </div>
                                    </div>
                                </Card>

                                {/* <Card className="p-4 border-0">
                                <div className="flex items-start gap-3">
                                    <div className="bg-[#FEEEC9] p-2 rounded-lg">
                                        <DollarSign className="h-5 w-5 text-primary" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs text-white mb-1">Price Range</p>
                                        <p className="font-semibold  text-white text-sm">{job?.min_price ?? '—'} — {job?.max_price ?? '—'}</p>
                                    </div>
                                </div>
                            </Card> */}

                                <Card className="p-4 border-0">
                                    <div className="flex items-start gap-3">
                                        <div className="bg-[#FEEEC9] p-2 rounded-lg">
                                            <Users className="h-5 w-5 text-primary" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-xs text-white mb-1">Applicants</p>
                                            <p className="font-semibold text-white text-sm">{applications?.length} applicants</p>
                                        </div>
                                    </div>
                                </Card>
                            </div>
                        </div>
                    </div>

                    {/* Applications */}
                    <div className="mb-6">
                      <h2 className="text-xl font-semibold text-foreground mb-1">Applicants</h2>
                      <p className="text-sm text-muted-foreground">
                        Review proposals and total price, then send an offer or hire.
                      </p>
                    </div>
                    {applications?.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border bg-muted/20 p-12 text-center">
                        <p className="text-muted-foreground">No applications yet for this job.</p>
                        <p className="text-sm text-muted-foreground mt-1">Applicants will appear here when guides apply.</p>
                      </div>
                    ) : (
                      <BidsClient applications={applications} user={user} jobId={jobId} jobName={job?.name ?? undefined} />
                    )}
                </div>

            </div>
    );
}

export default function BidsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background p-6 text-muted-foreground">
          Loading…
        </div>
      }
    >
      <BidsPageInner />
    </Suspense>
  );
}

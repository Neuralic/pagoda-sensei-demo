// components/BidsClient.tsx
"use client"

import { useState } from "react"
import { GuideProfileCard } from "@/components/guide/GuideProfileCard"
import { BidProposalModal } from "@/components/bids/BidProposalModal"
import { RequestPriceUpdateModal } from "@/components/bids/RequestPriceUpdateModal"
import { useRouter } from "next/navigation"
import toast from "react-hot-toast"
import { buildPublicProfilePath } from "@/lib/profile-refresh"

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

type User = {
  id: string;
  name: string;
  lastName?: string;
  email: string;
  role?: string;
  avatar?: string;
};


interface BidsClientProps {
  applications: Application[]
  user: User | null
  jobId?: string
  jobName?: string
}

export function BidsClient({ applications, user, jobId, jobName }: BidsClientProps) {
  const router = useRouter();
  const [proposalModalApplicantId, setProposalModalApplicantId] = useState<string | null>(null);
  const [proposalModalApp, setProposalModalApp] = useState<Application | null>(null);
  const [requestPriceApp, setRequestPriceApp] = useState<Application | null>(null);

  const handleViewProfile = (profileSlug?: string | null) => {
    const path = buildPublicProfilePath(profileSlug);
    if (!path) {
      toast.error("This guide has not published their public profile yet.");
      return;
    }
    window.open(path, "_blank", "noopener,noreferrer");
  }

  const handleMessage = async (app: Application) => {
    try {
      if (!user?.id) {
        console.error('Missing required context: userId');
        // Fallback: go to conversation root if missing context
        const base = user?.role === 'agent' ? '/agent' : '/guide'
        router.push(`${base}/conversation`);
        return;
      }

      // Use ensure-pair endpoint - only need agencyId and guideId
      const payload = {
        agencyId: user.id,
        guideId: app.applicant_id,
      };


      const res = await fetch('/api/chats/ensure-pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch((err) => {
        console.error('Failed to parse response:', err);
        return { ok: false, error: 'Failed to parse response' };
      });


      if (res.ok && json?.ok && json?.chatId) {
        // Deep-link directly to the chat
        const base = user?.role === 'agent' ? '/agent' : '/guide'
        const chatPath = `${base}/conversation/${json.chatId}`;
        router.push(chatPath);
      } else {
        // If ensure failed, log error and navigate to conversation root
        console.error('Failed to ensure chat:', json?.error || 'Unknown error');
        const base = user?.role === 'agent' ? '/agent' : '/guide'
        router.push(`${base}/conversation`);
      }
    } catch (error) {
      console.error('Error in handleMessage:', error);
      const base = user?.role === 'agent' ? '/agent' : '/guide'
      router.push(`${base}/conversation`);
    }
  }

  return (
    <>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {applications.map((app) => {
          const firstName = app.first_name || ""
          const lastName = app.last_name || ""
          const name = [firstName, lastName].filter(Boolean).join(" ") || app.applicant_name || "Applicant"
          const title = app.why || "Professional Guide"
          const languages = Array.isArray(app.languages) ? app.languages : []
          const image = app.signedAvatarUrl || null
          const proposalSnippet = app.why
            ? (app.why.length > 100 ? app.why.slice(0, 100) + "…" : app.why)
            : null

          return (
            <div key={app.id} className="flex flex-col h-full min-h-0">
              <GuideProfileCard
                applicant_id={app.applicant_id}
                name={name}
                title={title}
                proposalSnippet={proposalSnippet}
                rating={4.9}
                reviews={342}
                tours={340}
                guide_avatar={image || ""}
                languages={languages}
                status={app.status}
                submitted={app.submitted_at}
                guide_price={app.guide_price}
                hire_id={app.hire_id}
                offer_status={app.offer_status}
                is_candidate={app.is_candidate}
                is_finalist={app.is_finalist}
                jobId={jobId}
                userRole={user?.role}
                total_price={app.total_price ?? undefined}
                onViewProfile={() => handleViewProfile(app.profile_slug)}
                onMessage={() => handleMessage(app)}
                onViewProposal={
                  (user?.role === "agent" || user?.role === "agency") && jobId
                    ? () => {
                        setProposalModalApp(app);
                        setProposalModalApplicantId(app.applicant_id);
                      }
                    : undefined
                }
                onRequestPriceUpdate={
                  (user?.role === "agent" || user?.role === "agency") && jobId
                    ? () => setRequestPriceApp(app)
                    : undefined
                }
              />
            </div>
          )
        })}
      </div>

      {(user?.role === "agent" || user?.role === "agency") && jobId && proposalModalApplicantId && (
        <BidProposalModal
          isOpen={!!proposalModalApplicantId}
          onClose={() => {
            setProposalModalApplicantId(null);
            setProposalModalApp(null);
          }}
          jobId={jobId}
          applicantId={proposalModalApplicantId}
          applicantName={
            proposalModalApp
              ? [proposalModalApp.first_name, proposalModalApp.last_name].filter(Boolean).join(" ") ||
                proposalModalApp.applicant_name
              : undefined
          }
          proposalText={proposalModalApp?.why}
        />
      )}

      {(user?.role === "agent" || user?.role === "agency") && jobId && requestPriceApp && (
        <RequestPriceUpdateModal
          isOpen={!!requestPriceApp}
          onClose={() => setRequestPriceApp(null)}
          jobId={jobId}
          applicantId={requestPriceApp.applicant_id}
          jobName={jobName}
          guideName={
            [requestPriceApp.first_name, requestPriceApp.last_name].filter(Boolean).join(" ") ||
            requestPriceApp.applicant_name ||
            undefined
          }
        />
      )}
    </>
  )
}
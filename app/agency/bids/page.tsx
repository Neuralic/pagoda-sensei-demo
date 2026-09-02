import { ArrowLeft, MapPin, Calendar, Users } from "lucide-react"
import { Card } from "@/components/ui/card"
import { getSupabaseServer } from '@/lib/supabaseServer'
import { BidsClient } from "@/components/guide/BidsClient"
import { BUCKETS } from '@/lib/buckets'
import { cookies } from 'next/headers'
import { formatDate } from '@/lib/utils'
import { BackButton } from "@/components/shared/back-button"
import {
  DEFAULT_COMMISSION_SETTINGS,
  getAgentDisplayTotalRounded,
  parseCommissionSettings,
} from "@/lib/tour-price"

type Props = {
    searchParams?: { jobId?: string }
}

type User = {
    id: string;
    name: string;
    lastName?: string;
    email: string;
    role?: string;
    avatar?: string;
};

export default async function Bids({ searchParams }: Props) {
    const jobId = searchParams?.jobId ? String(searchParams?.jobId) : ''
    const supabase = getSupabaseServer()
    // Load current user on the server using cookie userId
    let user: User | null = null
    try {
        const jar = await cookies()
        const userId = jar.get('userId')?.value
        if (userId) {
            const { data: u } = await supabase
                .from('users')
                .select('id, first_name, last_name, email, role')
                .eq('id', userId)
                .maybeSingle()

            if (u) {
                // try enrich with avatar
                let avatar: string | undefined
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('profile_picture_path')
                    .eq('user_id', userId)
                    .maybeSingle()
                const path = profile?.profile_picture_path as string | undefined
                if (path) {
                    const { data: signed } = await supabase
                        .storage
                        .from(BUCKETS.avatars)
                        .createSignedUrl(path, 60 * 60 * 24 * 7)
                    avatar = signed?.signedUrl || undefined
                }

                user = {
                    id: String(u.id),
                    name: `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || 'User',
                    lastName: u.last_name ?? undefined,
                    email: u.email ?? '',
                    role: (u as { role?: string }).role ?? undefined,
                    avatar,
                }
            }
        }
    } catch {
        // ignore user load errors
    }

    type Job = {
        id: string
        name?: string | null
        description?: string | null
        location?: string | null
        start_time?: string | null
        end_time?: string | null
        images?: string[] | null
        signedImageUrls?: string[] | null
        languages?: string[] | null
        group_size?: number | null
        min_price?: number | null
        max_price?: number | null
        created_at?: string | null
    }

    // Match components/guide/BidsClient.tsx expectations
    type Application = {
        id: string
        applicant_id: string
        first_name?: string
        last_name?: string
        applicant_name?: string
        why?: string
        profile_picture_path?: string
        avatarUrl?: string
        languages: string[]
        status?: string
        submitted_at?: string
        offer_status?: string
        hire_id?: string
        guide_price?: number
        total_price?: number | null
        is_finalist?: boolean
    }

    let job: Job | null = null
    let applications: Application[] = []
    let jobError: string | null = null

    if (jobId) {
        const { data: jdata, error: jErr } = await supabase
            .from('jobs')
            .select('id, name, description, location, start_time, end_time, images, languages, group_size, min_price, max_price, created_at')
            .eq('id', jobId)
            .maybeSingle()
        if (jErr) jobError = jErr.message
        job = jdata ?? null

        // Fetch signed URLs for job images
        if (job && Array.isArray(job.images) && job.images.length > 0) {
            const imagePaths = job.images.filter((img): img is string =>
                typeof img === 'string' &&
                img.length > 0 &&
                !img.startsWith('http://') &&
                !img.startsWith('https://')
            )

            if (imagePaths.length > 0) {
                const signedUrlPromises = imagePaths.map(async (path) => {
                    const { data, error } = await supabase.storage
                        .from(BUCKETS.jobs)
                        .createSignedUrl(path, 60 * 60 * 24 * 7) // 7 days
                    return { path, signedUrl: error ? null : data?.signedUrl ?? null }
                })

                const signedResults = await Promise.all(signedUrlPromises)
                const pathToUrl = new Map(signedResults.map(r => [r.path, r.signedUrl]))

                // Replace image paths with signed URLs
                job.signedImageUrls = job.images.map(img => {
                    if (typeof img === 'string' && !img.startsWith('http://') && !img.startsWith('https://')) {
                        return pathToUrl.get(img) || img
                    }
                    return img
                }).filter((url): url is string => url !== null)
            }
        }

        // Fetch job with tour information
        const { data: jobWithTour, error: jobTourError } = await supabase
            .from('jobs')
            .select('tour_id, tour:tour_id(user_id), languages')
            .eq('id', jobId)
            .maybeSingle()

        const { data: apps, error: aErr } = await supabase
            .from('job_applications')
            .select('*')
            .eq('job_id', jobId)
            .order('submitted_at', { ascending: false })
        if (!aErr && Array.isArray(apps)) {
            // Normalize to strict Application shape expected by BidsClient
            applications = (apps as unknown[]).map((a) => {
                const r = a as Record<string, unknown>
                const languages = Array.isArray(r.languages)
                    ? (r.languages.filter((x): x is string => typeof x === 'string'))
                    : []
                return {
                    id: String(r.id ?? ''),
                    applicant_id: String(r.applicant_id ?? ''),
                    first_name: typeof r.first_name === 'string' ? r.first_name : undefined,
                    last_name: typeof r.last_name === 'string' ? r.last_name : undefined,
                    applicant_name: typeof r.applicant_name === 'string' ? r.applicant_name : undefined,
                    why: typeof r.why === 'string' ? r.why : undefined,
                    profile_picture_path: typeof r.profile_picture_path === 'string' ? r.profile_picture_path : undefined,
                    languages,
                    status: typeof r.status === 'string' ? r.status : undefined,
                    submitted_at: typeof r.submitted_at === 'string' ? r.submitted_at : undefined,
                    offer_status: typeof r.offer_status === 'string' ? r.offer_status : undefined,
                    hire_id: typeof r.hire_id === 'string' ? r.hire_id : undefined,
                    is_candidate: typeof r.is_candidate === 'boolean' ? r.is_candidate : undefined,
                    is_finalist: typeof r.is_finalist === 'boolean' ? r.is_finalist : undefined,
                    guide_price:
                      r.guide_price != null && Number.isFinite(Number(r.guide_price))
                        ? Number(r.guide_price)
                        : undefined,
                }
            }) as Application[]

            // Enrich with purchase price (guide + commissions) so bid cards can show both
            const guideIds = [
              ...new Set(applications.map((a) => a.applicant_id).filter(Boolean)),
            ]
            const commissionByGuide = new Map<
              string,
              { m: number; a: number; v: number }
            >()
            if (guideIds.length > 0) {
              const { data: settingsRows } = await supabase
                .from("guide_commission_settings")
                .select("user_id, commission_marketplace_pct, commission_agent_pct, vat_rate_pct")
                .in("user_id", guideIds)
              for (const row of settingsRows ?? []) {
                const parsed = parseCommissionSettings(row)
                commissionByGuide.set(String(row.user_id), {
                  m: parsed.commissionMarketplacePct,
                  a: parsed.commissionAgentPct,
                  v: parsed.vatRatePct,
                })
              }
            }
            applications = applications.map((app) => {
              const gp = app.guide_price
              if (gp == null || !Number.isFinite(gp) || gp <= 0) return app
              const s = commissionByGuide.get(app.applicant_id) ?? {
                m: DEFAULT_COMMISSION_SETTINGS.commissionMarketplacePct,
                a: DEFAULT_COMMISSION_SETTINGS.commissionAgentPct,
                v: DEFAULT_COMMISSION_SETTINGS.vatRatePct,
              }
              return {
                ...app,
                total_price: getAgentDisplayTotalRounded(gp, s.m, s.a, s.v),
              }
            })

            // Note: Tour owners are only shown if they have an actual application in the database
            // We no longer create synthetic applications for tour owners who haven't applied

            // Fetch profiles for all applicants to get avatar paths
            const applicantIds = applications.map(a => a.applicant_id).filter(Boolean)

            if (applicantIds.length > 0) {
                const { data: profiles, error: profilesErr } = await supabase
                    .from('profiles')
                    .select('id, user_id, profile_picture_path, profile_slug')
                    .in('user_id', applicantIds)

                if (!profilesErr && profiles) {
                    const profileByUserId: Record<string, { id: string; user_id: string; profile_picture_path: string | null; profile_slug: string | null }> = {}
                    for (const p of profiles) {
                        profileByUserId[p.user_id] = p
                    }

                    // Collect avatar paths for batch signing
                    const avatarPaths = profiles
                        .map(p => p.profile_picture_path)
                        .filter((path): path is string => typeof path === 'string' && path.length > 0)

                    let pathToUrl = new Map<string, string>()
                    if (avatarPaths.length > 0) {
                        const signedUrlPromises = avatarPaths.map(async (path) => {
                            const { data, error } = await supabase.storage
                                .from(BUCKETS.avatars)
                                .createSignedUrl(path, 60 * 60 * 24 * 7) // 7 days
                            return { path, signedUrl: error ? null : data?.signedUrl ?? null }
                        })

                        const signedResults = await Promise.all(signedUrlPromises)
                        pathToUrl = new Map(
                            signedResults
                                .filter(r => r.signedUrl !== null)
                                .map(r => [r.path, r.signedUrl as string])
                        )
                    }

                    // Enrich applications with profile data and signed URLs
                    applications = applications.map(app => {
                        const profile = profileByUserId[app.applicant_id]
                        const avatarPath = profile?.profile_picture_path
                        const avatarUrl = avatarPath ? pathToUrl.get(avatarPath) : undefined

                        return {
                            ...app,
                            profile_picture_path: avatarPath || app.profile_picture_path,
                            profile_slug: profile?.profile_slug || undefined,
                            avatarUrl: avatarUrl
                        }
                    })
                }
            }

            // Note: Further enrichment of applications (profiles/users) can be added here if needed.
        }
    }

    console.log({ job, jobError, applications })

    return (
        <div className="lg:p-8 pt-0 container mx-auto">
            <div className="min-h-screen bg-background">
                {/* Back Navigation */}
                <div className="border-b border-border bg-card">
                    <div className="container mx-auto px-4 py-4">
                        <BackButton />
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
                        <div>
                            <h1 className="text-4xl md:text-5xl font-bold text-white mb-3 text-balance">{job ? String(job.name) : 'Job'}</h1>
                            <p className="text-lg text-white/95 max-w-2xl text-pretty">
                                {job ? String(job.description ?? '') : 'Job details and applications will appear here.'}
                            </p>
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
                <BidsClient applications={applications} user={user} jobId={jobId} />
            </div>
        </div>
    )
}

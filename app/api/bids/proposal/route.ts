import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { denyIfActivityNotApproved } from "@/lib/activity-approval";
import { cookies } from "next/headers";
import {
  computeGuideTotalFromTour,
  getAgentDisplayTotalRounded,
  getPerPersonBreakdown,
  isGroupSizeOverTourLimit,
  mapGuideBreakdownLinesToAgentRounded,
  normalizeJobParticipants,
  parseCommissionSettings,
  type AgentBidPricingPayload,
} from "@/lib/tour-price";

export type { AgentBidPricingPayload };

/**
 * GET /api/bids/proposal?jobId=xxx&applicantId=xxx
 * Agent/agency: proposal text + platform agent total (same rules as /api/hire).
 * Does not expose raw guide_price.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get("jobId") || "";
    const applicantId = searchParams.get("applicantId") || "";

    if (!jobId || !applicantId)
      return NextResponse.json(
        { ok: false, error: "jobId and applicantId are required" },
        { status: 400 }
      );

    const jar = await cookies();
    const userId = jar.get("userId")?.value;
    const role = jar.get("role")?.value;

    if (!userId)
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    if (role !== "agent" && role !== "agency")
      return NextResponse.json(
        { ok: false, error: "Only agents can view bid proposals" },
        { status: 403 }
      );

    const supabase = getSupabaseServer();
    const activityBid = await denyIfActivityNotApproved(userId, supabase);
    if (activityBid) return activityBid;

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, created_by, tour_id, adults, children, infants, group_size")
      .eq("id", jobId)
      .eq("created_by", userId)
      .single();

    if (jobError || !job)
      return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });

    const { data: app, error: appError } = await supabase
      .from("job_applications")
      .select(
        "id, applicant_id, first_name, last_name, why, languages, submitted_at, guide_price, price_per_adult, price_per_child, price_per_infant, offer_status, is_candidate"
      )
      .eq("job_id", jobId)
      .eq("applicant_id", applicantId)
      .single();

    if (appError || !app)
      return NextResponse.json(
        { ok: false, error: "Application not found" },
        { status: 404 }
      );

    const participants = normalizeJobParticipants({
      adults: (job as { adults?: number | null }).adults,
      children: (job as { children?: number | null }).children,
      infants: (job as { infants?: number | null }).infants,
      group_size: (job as { group_size?: number | null }).group_size,
    });

    const jobTourId = (job as { tour_id?: string | null }).tour_id;
    let tour: Record<string, unknown> | null = null;
    let tourOwnerId: string | null = null;
    let tourOwnerGuideResult = null as ReturnType<typeof computeGuideTotalFromTour>;
    let groupOverMax = false;

    if (jobTourId) {
      const { data: t } = await supabase
        .from("tour")
        .select(
          "user_id, pricing_model, price_per_adult, price_per_child, price_per_infant, base_rate, base_group_size, max_group_size, additional_per_person_rate"
        )
        .eq("id", jobTourId)
        .maybeSingle();
      if (t && (t as { user_id?: string }).user_id) {
        tour = t as Record<string, unknown>;
        tourOwnerId = String((t as { user_id: string }).user_id);
        tourOwnerGuideResult = computeGuideTotalFromTour(
          {
            pricing_model: (t as { pricing_model?: string | null }).pricing_model,
            price_per_adult: (t as { price_per_adult?: number | null }).price_per_adult,
            price_per_child: (t as { price_per_child?: number | null }).price_per_child,
            price_per_infant: (t as { price_per_infant?: number | null }).price_per_infant,
            base_rate: (t as { base_rate?: number | null }).base_rate,
            base_group_size: (t as { base_group_size?: number | null }).base_group_size,
            max_group_size: (t as { max_group_size?: number | null }).max_group_size,
            additional_per_person_rate: (t as { additional_per_person_rate?: number | null })
              .additional_per_person_rate,
          },
          participants
        );
      }
    }

    if (tour) {
      groupOverMax = isGroupSizeOverTourLimit(
        {
          pricing_model: String(tour.pricing_model ?? ""),
          max_group_size: (tour.max_group_size as number | null) ?? null,
        },
        participants
      );
    }

    let guidePrice: number | null =
      app.guide_price != null ? Number(app.guide_price) : null;

    if (tourOwnerId && applicantId === tourOwnerId && tourOwnerGuideResult != null) {
      guidePrice = tourOwnerGuideResult.guideTotal;
    }

    const { data: settingsRow } = await supabase
      .from("guide_commission_settings")
      .select("commission_marketplace_pct, commission_agent_pct, vat_rate_pct")
      .eq("user_id", applicantId)
      .maybeSingle();

    const commission = parseCommissionSettings(
      (settingsRow as Parameters<typeof parseCommissionSettings>[0]) ?? {}
    );

    let pricingModel: AgentBidPricingPayload["pricingModel"] = "flat";
    let lines: { label: string; count: number; displayAmount: number }[] | null = null;

    if (tourOwnerId && applicantId === tourOwnerId && tour && tourOwnerGuideResult) {
      pricingModel = tour.pricing_model === "group_rate" ? "group_rate" : "per_person";
      lines = mapGuideBreakdownLinesToAgentRounded(
        tourOwnerGuideResult.breakdownLines,
        tourOwnerGuideResult.guideTotal,
        commission
      );
    } else {
      const pa =
        app.price_per_adult != null ? Number(app.price_per_adult) : null;
      const pc =
        app.price_per_child != null ? Number(app.price_per_child) : null;
      const pi =
        app.price_per_infant != null ? Number(app.price_per_infant) : null;
      if (pa != null && pc != null && pi != null) {
        const r = getPerPersonBreakdown(
          pa,
          pc,
          pi,
          participants.adults,
          participants.children,
          participants.infants
        );
        if (r.guideTotal > 0 && guidePrice != null) {
          pricingModel = "per_person";
          const match =
            Math.abs(r.guideTotal - guidePrice) <= 1;
          if (match) {
            lines = mapGuideBreakdownLinesToAgentRounded(
              r.breakdownLines,
              guidePrice,
              commission
            );
          }
        }
      }
    }

    let agentPricing: AgentBidPricingPayload | null = null;

    if (guidePrice != null && Number.isFinite(guidePrice) && guidePrice > 0) {
      const totalInclVat = getAgentDisplayTotalRounded(
        guidePrice,
        commission.commissionMarketplacePct,
        commission.commissionAgentPct,
        commission.vatRatePct
      );

      agentPricing = {
        guideTotal: guidePrice,
        totalInclVat,
        pricingModel,
        participants: {
          adults: participants.adults,
          children: participants.children,
          infants: participants.infants,
        },
        groupOverMax,
        lines: lines && lines.length > 0 ? lines : null,
        commission,
      };
    }

    const application = {
      id: app.id,
      applicant_id: app.applicant_id,
      first_name: app.first_name,
      last_name: app.last_name,
      why: app.why,
      languages: Array.isArray(app.languages)
        ? app.languages
        : typeof app.languages === "string"
          ? app.languages
            ? [app.languages]
            : []
          : [],
      submitted_at: app.submitted_at,
      offer_status: app.offer_status,
      is_candidate: app.is_candidate,
    };

    return NextResponse.json({
      ok: true,
      application,
      agentPricing,
    });
  } catch (err) {
    console.error("Error fetching bid proposal:", err);
    return NextResponse.json(
      { ok: false, error: "Server error" },
      { status: 500 }
    );
  }
}

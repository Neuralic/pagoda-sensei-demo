import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { cookies } from "next/headers";
import { computeGuideTotalFromTour, normalizeJobParticipants } from "@/lib/tour-price";

/**
 * POST /api/jobs/finalist
 * Agent selects finalist candidates for a job (up to 2 finalists per job)
 * Body: { job_id: string, applicant_ids: string[] } (array of applicant IDs, max 2)
 */
export async function POST(req: NextRequest) {
  try {
    const jar = await cookies();
    const userId = jar.get("userId")?.value;
    const role = jar.get("role")?.value;

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Only agents and agencies can select finalists
    if (role !== "agent" && role !== "agency") {
      return NextResponse.json(
        { ok: false, error: "Only agents and agencies can select finalists" },
        { status: 403 }
      );
    }

    const { job_id, applicant_ids } = await req.json();

    if (!job_id || !applicant_ids) {
      return NextResponse.json(
        { ok: false, error: "job_id and applicant_ids are required" },
        { status: 400 }
      );
    }

    // Ensure applicant_ids is an array
    const applicantIdsArray = Array.isArray(applicant_ids) ? applicant_ids : [applicant_ids];
    
    // Limit to 2 finalists per job
    if (applicantIdsArray.length > 2) {
      return NextResponse.json(
        { ok: false, error: "Maximum 2 finalists allowed per job" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServer();

    // Verify the job exists and belongs to the agent
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select(
        "id, name, created_by, tour_id, adults, children, infants, group_size, tour:tour_id(user_id)"
      )
      .eq("id", job_id)
      .eq("created_by", userId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { ok: false, error: "Job not found or you don't have permission" },
        { status: 404 }
      );
    }

    // Check if any are tour owners (synthetic candidates)
    const tourOwnerId = (job.tour as any)?.user_id;

    // Ensure applications exist for all selected applicants
    for (const applicant_id of applicantIdsArray) {
      const isTourOwner = tourOwnerId === applicant_id;

      if (isTourOwner) {
        // For tour owner, we need to check if they have an application or create one
        const { data: existingApp } = await supabase
          .from("job_applications")
          .select("id")
          .eq("job_id", job_id)
          .eq("applicant_id", applicant_id)
          .maybeSingle();

        if (!existingApp) {
          // Create application for tour owner if it doesn't exist
          const { data: tourOwner } = await supabase
            .from("users")
            .select("id, first_name, last_name")
            .eq("id", applicant_id)
            .single();

          if (tourOwner) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("id")
              .eq("user_id", applicant_id)
              .maybeSingle();

            let guidePrice: number | undefined;
            let priceExtras: Record<string, number> = {};
            const tid = job.tour_id as string | null | undefined;
            if (tid) {
              const { data: tourRow } = await supabase
                .from("tour")
                .select(
                  "pricing_model, price_per_adult, price_per_child, price_per_infant, base_rate, base_group_size, max_group_size, additional_per_person_rate"
                )
                .eq("id", tid)
                .maybeSingle();
              if (tourRow) {
                const participants = normalizeJobParticipants({
                  adults: job.adults,
                  children: job.children,
                  infants: job.infants,
                  group_size: job.group_size,
                });
                const pr = computeGuideTotalFromTour(
                  {
                    pricing_model: (tourRow as { pricing_model?: string | null }).pricing_model,
                    price_per_adult: (tourRow as { price_per_adult?: number | null }).price_per_adult,
                    price_per_child: (tourRow as { price_per_child?: number | null }).price_per_child,
                    price_per_infant: (tourRow as { price_per_infant?: number | null }).price_per_infant,
                    base_rate: (tourRow as { base_rate?: number | null }).base_rate,
                    base_group_size: (tourRow as { base_group_size?: number | null }).base_group_size,
                    max_group_size: (tourRow as { max_group_size?: number | null }).max_group_size,
                    additional_per_person_rate: (tourRow as { additional_per_person_rate?: number | null })
                      .additional_per_person_rate,
                  },
                  participants
                );
                if (pr != null && pr.guideTotal > 0) {
                  guidePrice = Math.round(pr.guideTotal);
                }
                const pm = (tourRow as { pricing_model?: string | null }).pricing_model;
                if (pm !== "group_rate") {
                  const pa = (tourRow as { price_per_adult?: number | null }).price_per_adult;
                  const pc = (tourRow as { price_per_child?: number | null }).price_per_child;
                  const pi = (tourRow as { price_per_infant?: number | null }).price_per_infant;
                  if (pa != null && pc != null && pi != null) {
                    priceExtras = {
                      price_per_adult: Number(pa),
                      price_per_child: Number(pc),
                      price_per_infant: Number(pi),
                    };
                  }
                }
              }
            }

            const { error: insertError } = await supabase
              .from("job_applications")
              .insert({
                job_id: job_id,
                applicant_id: applicant_id,
                applicant_profile_id: profile?.id ?? null,
                first_name: tourOwner.first_name || "",
                last_name: tourOwner.last_name || "",
                why: `Tour owner for "${job.name || "this job"}"`,
                offer_status: "candidate",
                is_candidate: true,
                is_finalist: false,
                submitted_at: new Date().toISOString(),
                ...(guidePrice != null && guidePrice > 0 ? { guide_price: guidePrice } : {}),
                ...priceExtras,
              });

            if (insertError) {
              console.error("[finalist] Tour owner application insert failed:", insertError);
              return NextResponse.json(
                { ok: false, error: insertError.message || "Failed to create tour owner application" },
                { status: 500 }
              );
            }
          }
        }
      }
    }

    // Remove finalist status from all applications for this job
    await supabase
      .from("job_applications")
      .update({ is_finalist: false })
      .eq("job_id", job_id);

    // Set selected applications as finalists
    if (applicantIdsArray.length > 0) {
      const { error: updateError } = await supabase
        .from("job_applications")
        .update({ is_finalist: true })
        .eq("job_id", job_id)
        .in("applicant_id", applicantIdsArray);

      if (updateError) {
        return NextResponse.json(
          { ok: false, error: updateError.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      ok: true,
      message: "Finalists selected successfully",
    });
  } catch (err) {
    console.error("Error selecting finalists:", err);
    return NextResponse.json(
      { ok: false, error: "Server error while selecting finalists" },
      { status: 500 }
    );
  }
}


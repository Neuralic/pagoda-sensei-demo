import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { denyIfActivityNotApproved } from "@/lib/activity-approval";
import { cookies } from "next/headers";
import { sendGuidePriceUpdateToAgentEmail } from "@/lib/mailer";
import {
  computeGuideTotalGroupRate,
  isGroupSizeOverTourLimit,
} from "@/lib/tour-price";

/** PATCH: Update guide_price on the applicant's own application. Allowed only when not yet hired. */
export async function PATCH(req: NextRequest) {
  try {
    const jar = await cookies();
    const userId = jar.get("userId")?.value;
    const role = jar.get("role")?.value;

    if (!userId)
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    if (role !== "guide")
      return NextResponse.json({ error: "Only guides can update their price" }, { status: 403 });

    const body = await req.json() as Record<string, unknown>;
    const job_id = body.job_id;
    const user_id = body.user_id;
    const rawPrice = body.guide_price;
    const rawPa = body.price_per_adult;
    const rawPc = body.price_per_child;
    const rawPi = body.price_per_infant;
    const pricingModel = body.pricing_model;

    if (!job_id || !user_id)
      return NextResponse.json({ error: "job_id and user_id are required" }, { status: 400 });
    if (user_id !== userId)
      return NextResponse.json({ error: "You can only update your own price" }, { status: 403 });

    const supabase = getSupabaseServer();
    const activityGp = await denyIfActivityNotApproved(userId, supabase);
    if (activityGp) return activityGp;
    const { data: application, error: findError } = await supabase
      .from("job_applications")
      .select("id, offer_status")
      .eq("job_id", job_id)
      .eq("applicant_id", user_id)
      .single();

    if (findError || !application)
      return NextResponse.json({ error: "Application not found for this job and user" }, { status: 404 });
    if (application.offer_status === "completed")
      return NextResponse.json({ error: "Cannot update price after you have been hired" }, { status: 400 });

    let guidePriceNum: number;
    const updatePayload: {
      guide_price: number;
      price_per_adult?: number | null;
      price_per_child?: number | null;
      price_per_infant?: number | null;
    } = { guide_price: 0 };

    const { data: jobRow } = await supabase
      .from("jobs")
      .select("adults, children, infants, tour_id")
      .eq("id", job_id)
      .single();

    const isTourJob =
      jobRow != null &&
      (jobRow as { tour_id?: string | null }).tour_id != null &&
      String((jobRow as { tour_id?: string | null }).tour_id).trim() !== "";

    const adults = jobRow?.adults != null ? Number(jobRow.adults) : 0;
    const children = jobRow?.children != null ? Number(jobRow.children) : 0;
    const infants = jobRow?.infants != null ? Number(jobRow.infants) : 0;
    const hasParticipants = adults > 0 || children > 0 || infants > 0;

    if (hasParticipants && pricingModel === "group_rate") {
      const baseRate = Number(body.base_rate);
      const baseGroupSize = Number(body.base_group_size);
      const additional =
        body.additional_per_person_rate != null && body.additional_per_person_rate !== ""
          ? Number(body.additional_per_person_rate)
          : 0;
      const maxGroupSize =
        isTourJob && body.max_group_size != null && body.max_group_size !== ""
          ? Number(body.max_group_size)
          : null;
      if (!Number.isFinite(baseRate) || baseRate < 0)
        return NextResponse.json({ error: "Enter a valid base rate (¥) of 0 or more" }, { status: 400 });
      if (!Number.isFinite(baseGroupSize) || baseGroupSize < 1)
        return NextResponse.json({ error: "Base group size must be at least 1" }, { status: 400 });
      if (!Number.isFinite(additional) || additional < 0)
        return NextResponse.json({ error: "Additional per person must be zero or greater" }, { status: 400 });
      if (
        maxGroupSize != null &&
        (!Number.isFinite(maxGroupSize) || maxGroupSize < 1)
      )
        return NextResponse.json({ error: "Maximum group size must be at least 1 when set" }, { status: 400 });
      if (
        isGroupSizeOverTourLimit(
          { pricing_model: "group_rate", max_group_size: maxGroupSize },
          { adults, children, infants }
        )
      )
        return NextResponse.json(
          { error: `Group size exceeds your maximum (${maxGroupSize} people).` },
          { status: 400 }
        );
      const result = computeGuideTotalGroupRate(
        baseRate,
        baseGroupSize,
        adults,
        children,
        infants,
        additional
      );
      if (result.guideTotal < 0)
        return NextResponse.json({ error: "Computed total must be 0 or more" }, { status: 400 });
      guidePriceNum = Math.round(result.guideTotal);
      updatePayload.guide_price = guidePriceNum;
      updatePayload.price_per_adult = null;
      updatePayload.price_per_child = null;
      updatePayload.price_per_infant = null;
    } else if (hasParticipants && rawPa != null && rawPc != null && rawPi != null) {
      const pa = parseFloat(String(rawPa));
      const pc = parseFloat(String(rawPc));
      const pi = parseFloat(String(rawPi));
      if (!Number.isFinite(pa) || !Number.isFinite(pc) || !Number.isFinite(pi) || pa < 0 || pc < 0 || pi < 0)
        return NextResponse.json({ error: "price_per_adult, price_per_child, price_per_infant must be non-negative numbers" }, { status: 400 });
      guidePriceNum = adults * pa + children * pc + infants * pi;
      if (!Number.isFinite(guidePriceNum) || guidePriceNum < 0)
        return NextResponse.json({ error: "Total price (per person × participants) must be 0 or more" }, { status: 400 });
      updatePayload.guide_price = guidePriceNum;
      updatePayload.price_per_adult = pa;
      updatePayload.price_per_child = pc;
      updatePayload.price_per_infant = pi;
    } else {
      const priceNum = rawPrice != null ? parseFloat(String(rawPrice)) : NaN;
      if (!Number.isFinite(priceNum) || priceNum < 0)
        return NextResponse.json({ error: "guide_price is required and must be 0 or more" }, { status: 400 });
      guidePriceNum = priceNum;
      updatePayload.guide_price = guidePriceNum;
    }

    const { data: updated, error: updateError } = await supabase
      .from("job_applications")
      .update(updatePayload)
      .eq("id", application.id)
      .select()
      .single();

    if (updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 });

    // Notify the agent that the guide updated their price (fire-and-forget)
    try {
      const { data: jobData, error: jobErr } = await supabase
        .from("jobs")
        .select("id, name, created_by")
        .eq("id", job_id)
        .single();
      if (!jobErr && jobData?.created_by) {
        const [{ data: agentUser }, { data: guideUser }] = await Promise.all([
          supabase
            .from("users")
            .select("email, first_name, last_name")
            .eq("id", jobData.created_by)
            .single(),
          supabase
            .from("users")
            .select("first_name, last_name")
            .eq("id", user_id)
            .single(),
        ]);
        const agentEmail = (agentUser as { email?: string } | null)?.email;
        if (agentEmail) {
          const a = agentUser as { first_name?: string; last_name?: string } | null;
          const agentName = a?.first_name || a?.last_name
            ? `${a?.first_name ?? ""} ${a?.last_name ?? ""}`.trim()
            : "Agent";
          const g = guideUser as { first_name?: string; last_name?: string } | null;
          const guideName = g?.first_name || g?.last_name
            ? `${g?.first_name ?? ""} ${g?.last_name ?? ""}`.trim()
            : "A guide";
          const updatedPriceFormatted = `¥${Number(guidePriceNum).toLocaleString()}`;
          sendGuidePriceUpdateToAgentEmail(
            agentEmail,
            agentName,
            guideName,
            jobData.name ?? "Your job",
            jobData.id,
            updatedPriceFormatted
          ).catch((err) =>
            console.error("Failed to send guide price update notification to agent", err)
          );
        }
      }
    } catch (emailErr) {
      console.error("Error preparing/sending guide price update email to agent", emailErr);
    }

    return NextResponse.json({ message: "Price updated successfully", data: updated });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error while updating price" }, { status: 500 });
  }
}

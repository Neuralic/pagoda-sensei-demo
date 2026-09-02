export type GuideFulfillmentInput = {
  pickup_date?: string | null;
  pickup_time?: string | null;
  pickup_location?: string | null;
  guide_display_name?: string | null;
  guide_whatsapp?: string | null;
};

export type GuideFulfillmentFields = GuideFulfillmentInput & {
  fulfillment_submitted_at?: string | null;
};

export function validateGuideFulfillment(body: GuideFulfillmentInput): string | null {
  const pickupDate = String(body.pickup_date ?? "").trim();
  const pickupTime = String(body.pickup_time ?? "").trim();
  const pickupLocation = String(body.pickup_location ?? "").trim();
  const guideName = String(body.guide_display_name ?? "").trim();
  const whatsapp = String(body.guide_whatsapp ?? "").trim();

  if (!pickupDate) return "Pickup date is required.";
  if (!pickupTime) return "Pickup time is required.";
  if (!pickupLocation) return "Pickup location is required.";
  if (!guideName) return "Guide name is required.";
  if (!whatsapp) return "Guide WhatsApp number is required.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pickupDate)) return "Pickup date must be YYYY-MM-DD.";
  if (!/^\d{1,2}:\d{2}$/.test(pickupTime)) return "Pickup time must be HH:MM.";
  return null;
}

export function normalizeGuideFulfillment(
  body: GuideFulfillmentInput
): Required<GuideFulfillmentInput> {
  return {
    pickup_date: String(body.pickup_date ?? "").trim(),
    pickup_time: String(body.pickup_time ?? "").trim(),
    pickup_location: String(body.pickup_location ?? "").trim(),
    guide_display_name: String(body.guide_display_name ?? "").trim(),
    guide_whatsapp: String(body.guide_whatsapp ?? "").trim(),
  };
}

export function formatGuideFulfillmentBlock(
  fulfillment: GuideFulfillmentFields | null | undefined
): string | null {
  if (!fulfillment) return null;
  const lines: string[] = [];
  if (fulfillment.guide_display_name?.trim()) {
    lines.push(`Guide: ${fulfillment.guide_display_name.trim()}`);
  }
  if (fulfillment.guide_whatsapp?.trim()) {
    lines.push(`WhatsApp: ${fulfillment.guide_whatsapp.trim()}`);
  }
  if (fulfillment.pickup_date?.trim() || fulfillment.pickup_time?.trim()) {
    const date = fulfillment.pickup_date?.trim() ?? "";
    const time = fulfillment.pickup_time?.trim() ?? "";
    lines.push(`Pickup: ${[date, time].filter(Boolean).join(" at ")}`);
  }
  if (fulfillment.pickup_location?.trim()) {
    lines.push(`Pickup location: ${fulfillment.pickup_location.trim()}`);
  }
  return lines.length > 0 ? lines.join("\n") : null;
}

/** Pick the application row that carries traveler-facing fulfillment details. */
export function pickFulfillmentApplication<
  T extends GuideFulfillmentFields & { offer_status?: string | null; hire_id?: string | null }
>(apps: T[] | null | undefined): T | null {
  if (!apps?.length) return null;
  const hired =
    apps.find((a) => a.offer_status === "completed" || a.offer_status === "hired") ??
    apps.find((a) => a.offer_status === "accepted") ??
    apps.find((a) => a.fulfillment_submitted_at);
  return hired ?? null;
}

/** Coerce Supabase embed (array or single object) into an applications array. */
export function normalizeJobApplications<T>(
  raw: T[] | T | null | undefined
): T[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") return [raw];
  return [];
}

type GuideNameApp = GuideFulfillmentFields & {
  offer_status?: string | null;
  hire_id?: string | null;
  is_finalist?: boolean | null;
  is_candidate?: boolean | null;
  first_name?: string | null;
  last_name?: string | null;
};

function appPersonName(app: GuideNameApp | null | undefined): string | null {
  if (!app) return null;
  const fromFulfillment = String(app.guide_display_name ?? "").trim();
  if (fromFulfillment) return fromFulfillment;
  const fromUser = `${app.first_name ?? ""} ${app.last_name ?? ""}`.trim();
  return fromUser || null;
}

/**
 * Advisor-facing guide/operator label for a job:
 * fulfillment display name → hired/accepted → finalist → candidate → first app with a name.
 */
export function resolveJobGuideDisplayName(
  apps: GuideNameApp[] | GuideNameApp | null | undefined
): string | null {
  const list = normalizeJobApplications(apps);
  if (!list.length) return null;

  const fulfillment = pickFulfillmentApplication(list);
  const fromFulfillment = appPersonName(fulfillment);
  if (fromFulfillment) return fromFulfillment;

  const isHired = (a: GuideNameApp) =>
    a.offer_status === "completed" ||
    a.offer_status === "hired" ||
    a.offer_status === "accepted" ||
    (typeof a.hire_id === "string" && a.hire_id.length > 0);
  const isFinalist = (a: GuideNameApp) => a.is_finalist === true;
  const isCandidate = (a: GuideNameApp) =>
    a.offer_status === "candidate" || a.is_candidate === true;

  const chosen =
    list.find((a) => isHired(a) && appPersonName(a)) ??
    list.find((a) => isFinalist(a) && appPersonName(a)) ??
    list.find((a) => isCandidate(a) && appPersonName(a)) ??
    list.find((a) => appPersonName(a));

  return appPersonName(chosen);
}

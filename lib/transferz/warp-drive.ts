import { transferzLogSecretPreview } from "./config";
import { resolveTransferzWarpDriveConfig } from "./resolve-warp-drive";

export async function transferzPartnerPost(
  path: "/partners/quotes" | "/partners/bookings",
  jsonBody: unknown,
  options?: { requestId?: string | null }
): Promise<Response> {
  const cfg = await resolveTransferzWarpDriveConfig();
  if (!cfg) {
    throw new Error("TRANSFERZ_NOT_CONFIGURED");
  }
  const url = `${cfg.baseUrl}${path}`;
  console.log("[transferz] warp drive POST", {
    url,
    warpDriveBaseUrl: cfg.baseUrl,
    path,
    xApiKeyPreview: transferzLogSecretPreview(cfg.apiKey),
  });
  return fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-API-Key": cfg.apiKey,
      ...(options?.requestId ? { "X-Request-ID": options.requestId } : {}),
    },
    body: JSON.stringify(jsonBody),
  });
}

/** POST JSON to any Warp Drive path (e.g. `/partners/journeys/{id}/changes`). */
export async function transferzPartnerPostJson(
  path: string,
  jsonBody: unknown,
  options?: { requestId?: string | null }
): Promise<Response> {
  const cfg = await resolveTransferzWarpDriveConfig();
  if (!cfg) {
    throw new Error("TRANSFERZ_NOT_CONFIGURED");
  }
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const url = `${cfg.baseUrl}${normalized}`;
  console.log("[transferz] warp drive POST (json path)", {
    url,
    path: normalized,
    xApiKeyPreview: transferzLogSecretPreview(cfg.apiKey),
  });
  return fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-API-Key": cfg.apiKey,
      ...(options?.requestId ? { "X-Request-ID": options.requestId } : {}),
    },
    body: JSON.stringify(jsonBody),
  });
}

/** GET e.g. `/partners/bookings/{id}` — see Transferz Warp Drive OpenAPI. */
export async function transferzPartnerGet(
  path: string,
  options?: { requestId?: string | null }
): Promise<Response> {
  const cfg = await resolveTransferzWarpDriveConfig();
  if (!cfg) {
    throw new Error("TRANSFERZ_NOT_CONFIGURED");
  }
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const url = `${cfg.baseUrl}${normalized}`;
  console.log("[transferz] warp drive GET", {
    url,
    warpDriveBaseUrl: cfg.baseUrl,
    path: normalized,
    xApiKeyPreview: transferzLogSecretPreview(cfg.apiKey),
  });
  return fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-API-Key": cfg.apiKey,
      ...(options?.requestId ? { "X-Request-ID": options.requestId } : {}),
    },
  });
}

/** Reasons accepted by Warp Drive `CancelJourneyDto.reason` (subset we allow from our API). */
export type TransferzCancelJourneyReason =
  | "NOT_NEEDED_ANYMORE"
  | "OTHER"
  | "TECHNICAL_ISSUE"
  | "FORCE_MAJEURE";

const DEFAULT_CANCEL_BODY: { reason: TransferzCancelJourneyReason; acceptCharges: boolean } = {
  reason: "NOT_NEEDED_ANYMORE",
  acceptCharges: true,
};

/**
 * Cancel a journey at Transferz (Warp Drive).
 * Request body **must** match `CancelJourneyDto` (`reason` required, `acceptCharges` optional).
 *
 * Tries `POST /partners/journeys/{id}/cancel` first, then booking-scoped
 * `POST /partners/bookings/{bookingId}/journeys/{id}/cancel` if the first returns 404.
 *
 * @see https://developers.transferz.com/reference/canceljourney
 */
export async function transferzPartnerCancelJourney(
  journeyId: string | number,
  bookingId: string | number | null | undefined,
  options?: {
    requestId?: string | null;
    /** Defaults to NOT_NEEDED_ANYMORE + acceptCharges true (outside free window, charges may apply). */
    body?: { reason?: TransferzCancelJourneyReason; acceptCharges?: boolean };
  }
): Promise<Response> {
  const jid = encodeURIComponent(String(journeyId));
  const cancelBody = {
    reason: options?.body?.reason ?? DEFAULT_CANCEL_BODY.reason,
    acceptCharges: options?.body?.acceptCharges ?? DEFAULT_CANCEL_BODY.acceptCharges,
  };
  let res = await transferzPartnerPostJson(`/partners/journeys/${jid}/cancel`, cancelBody, {
    requestId: options?.requestId,
  });
  if (res.status === 404 && bookingId != null && String(bookingId).trim() !== "") {
    const bid = encodeURIComponent(String(bookingId));
    res = await transferzPartnerPostJson(`/partners/bookings/${bid}/journeys/${jid}/cancel`, cancelBody, {
      requestId: options?.requestId,
    });
  }
  return res;
}

/**
 * Cancel all eligible journeys on a booking (`POST /partners/bookings/{id}/cancel`).
 * Same `CancelJourneyDto` as journey cancel; use only when a single-journey cancel is not enough
 * (e.g. provider routing), and the booking has one journey so partner scope stays correct.
 *
 * @see https://developers.transferz.com/reference/cancelbooking
 */
export async function transferzPartnerCancelBooking(
  bookingId: string | number,
  options?: {
    requestId?: string | null;
    body?: { reason?: TransferzCancelJourneyReason; acceptCharges?: boolean };
  }
): Promise<Response> {
  const bid = encodeURIComponent(String(bookingId));
  const cancelBody = {
    reason: options?.body?.reason ?? DEFAULT_CANCEL_BODY.reason,
    acceptCharges: options?.body?.acceptCharges ?? DEFAULT_CANCEL_BODY.acceptCharges,
  };
  return transferzPartnerPostJson(`/partners/bookings/${bid}/cancel`, cancelBody, {
    requestId: options?.requestId,
  });
}

export async function transferzPartnerPostNoBody(
  path: string,
  options?: { requestId?: string | null }
): Promise<Response> {
  const cfg = await resolveTransferzWarpDriveConfig();
  if (!cfg) {
    throw new Error("TRANSFERZ_NOT_CONFIGURED");
  }
  const url = `${cfg.baseUrl}${path}`;
  console.log("[transferz] warp drive POST (empty JSON body)", {
    url,
    warpDriveBaseUrl: cfg.baseUrl,
    path,
    xApiKeyPreview: transferzLogSecretPreview(cfg.apiKey),
  });
  // Warp Drive (Spring-style) often requires a readable JSON body; bare POST with no
  // Content-Type yields 400 "Failed to read request" on e.g. journey cancel / pay-by-invoice.
  return fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-API-Key": cfg.apiKey,
      ...(options?.requestId ? { "X-Request-ID": options.requestId } : {}),
    },
    body: "{}",
  });
}

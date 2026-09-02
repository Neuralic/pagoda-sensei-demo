const TRANSFERZ_GATEWAY_WARP_MISMATCH_PREFIX = "TRANSFERZ_GATEWAY_WARP_MISMATCH:";

/** When `ensureTransferzGatewayWarpPaired()` throws, returns the human-readable detail; otherwise null. */
export function transferzGatewayWarpMismatchMessage(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  if (!error.message.startsWith(TRANSFERZ_GATEWAY_WARP_MISMATCH_PREFIX)) return null;
  const rest = error.message.slice(TRANSFERZ_GATEWAY_WARP_MISMATCH_PREFIX.length).trim();
  return rest || null;
}

export async function transferzReadErrorMessage(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    const detail = typeof j.detail === "string" ? j.detail.trim() : "";
    const title = typeof j.title === "string" ? j.title.trim() : "";
    const msg =
      (detail && title ? `${title}: ${detail}` : detail || title || null) ||
      (typeof j.message === "string" && j.message) ||
      (typeof j.error === "string" && j.error) ||
      (Array.isArray(j.errors) && typeof j.errors[0] === "string" && j.errors[0]) ||
      null;
    if (msg) return msg;
  } catch {
    /* ignore */
  }
  return text.slice(0, 500) || `HTTP ${res.status}`;
}

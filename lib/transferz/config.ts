const DEFAULT_WARP_DRIVE_STAGING = "https://warpdrive.staging.transferz.com";
const DEFAULT_GATEWAY_STAGING = "https://gateway.staging.transferz.com";
const DEFAULT_WARP_DRIVE_PRODUCTION = "https://warpdrive.transferz.com";
const DEFAULT_GATEWAY_PRODUCTION = "https://gateway.transferz.com";

export type TransferzEnvMode = "staging" | "production";

/**
 * Logical Transferz tier for **default** gateway / Warp Drive hosts when explicit URL env vars are omitted.
 *
 * - `TRANSFERZ_ENV` — `staging` (default), `production`, `prod`, or `live`.
 * - Per-host overrides: `TRANSFERZ_WARP_DRIVE_BASE_URL`, `TRANSFERZ_GATEWAY_BASE_URL` (still validated as a pair).
 */
export function getTransferzEnvMode(): TransferzEnvMode {
  const raw = process.env.TRANSFERZ_ENV?.trim().toLowerCase();
  if (raw === "production" || raw === "prod" || raw === "live") return "production";
  return "staging";
}

function defaultWarpDriveUrlForMode(mode: TransferzEnvMode): string {
  return mode === "production" ? DEFAULT_WARP_DRIVE_PRODUCTION : DEFAULT_WARP_DRIVE_STAGING;
}

function defaultGatewayUrlForMode(mode: TransferzEnvMode): string {
  return mode === "production" ? DEFAULT_GATEWAY_PRODUCTION : DEFAULT_GATEWAY_STAGING;
}

export function getWarpDriveBaseUrl(): string {
  const explicit = process.env.TRANSFERZ_WARP_DRIVE_BASE_URL?.trim();
  const raw = explicit || defaultWarpDriveUrlForMode(getTransferzEnvMode());
  const base = raw.replace(/\/$/, "");
  // Accept either:
  // - https://warpdrive.*.transferz.com
  // - https://warpdrive.*.transferz.com/partners  (as shown in some OpenAPI server URLs)
  return base.endsWith("/partners") ? base.slice(0, -"/partners".length) : base;
}

export function getGatewayBaseUrl(): string {
  const explicit = process.env.TRANSFERZ_GATEWAY_BASE_URL?.trim();
  const raw = explicit || defaultGatewayUrlForMode(getTransferzEnvMode());
  return raw.replace(/\/$/, "");
}

type TransferzHostTier = "staging" | "production" | "unknown";

function transferzHostTierFromHostname(hostname: string): TransferzHostTier {
  const h = hostname.trim().toLowerCase();
  if (!h) return "unknown";
  if (h.includes(".staging.")) return "staging";
  if (h === "gateway.transferz.com" || h === "warpdrive.transferz.com") return "production";
  if (h.endsWith(".transferz.com") && !h.includes(".staging.")) return "production";
  return "unknown";
}

function transferzUrlTier(url: string): TransferzHostTier {
  try {
    return transferzHostTierFromHostname(new URL(url).hostname);
  } catch {
    return "unknown";
  }
}

/**
 * Gateway and Warp Drive must be the same tier (staging vs production). Mixed configs break
 * email/password minting (key from one tier used against the other host) and confuse operators.
 */
export function getTransferzGatewayWarpPairingError(): string | null {
  const w = getWarpDriveBaseUrl();
  const g = getGatewayBaseUrl();
  const tw = transferzUrlTier(w);
  const tg = transferzUrlTier(g);
  if (tw === "unknown" || tg === "unknown") return null;
  if (tw !== tg) {
    return `Transferz gateway and Warp Drive URLs must both be staging or both production (got gateway tier "${tg}" vs warp tier "${tw}"). Set TRANSFERZ_ENV and/or TRANSFERZ_GATEWAY_BASE_URL + TRANSFERZ_WARP_DRIVE_BASE_URL consistently.`;
  }
  return null;
}

/** Throws if gateway and Warp Drive hosts are a mixed staging/production pair. */
export function ensureTransferzGatewayWarpPaired(): void {
  const err = getTransferzGatewayWarpPairingError();
  if (err) {
    throw new Error(`TRANSFERZ_GATEWAY_WARP_MISMATCH: ${err}`);
  }
}

export function getTransferzApiKey(): string | null {
  const k = process.env.TRANSFERZ_API_KEY?.trim();
  return k || null;
}

/** Partner login in env: used to mint a Warp Drive API key in-process when `TRANSFERZ_API_KEY` is unset. */
export function hasTransferzEnvPasswordCredentials(): boolean {
  return Boolean(
    process.env.TRANSFERZ_EMAIL?.trim() && process.env.TRANSFERZ_PASSWORD
  );
}

/** True if Warp Drive can run: explicit API key and/or partner email+password in env. */
export function isTransferzWarpDriveConfigured(): boolean {
  return Boolean(getTransferzApiKey() || hasTransferzEnvPasswordCredentials());
}

/** Only reflects `TRANSFERZ_API_KEY`. For runtime auth including auto-mint, use `resolveTransferzWarpDriveConfig()`. */
export function getTransferzWarpDriveConfig(): {
  apiKey: string;
  baseUrl: string;
} | null {
  const apiKey = getTransferzApiKey();
  if (!apiKey) return null;
  return { apiKey, baseUrl: getWarpDriveBaseUrl() };
}

/** @deprecated Use getTransferzWarpDriveConfig — kept for stable naming in API routes. */
export function getTransferzEnv(): ReturnType<typeof getTransferzWarpDriveConfig> {
  return getTransferzWarpDriveConfig();
}

/** True when `TRANSFERZ_WARP_DRIVE_BASE_URL` is unset (effective URL comes from `TRANSFERZ_ENV` + built-in defaults). */
export function isDefaultStagingWarpDrive(): boolean {
  return !process.env.TRANSFERZ_WARP_DRIVE_BASE_URL?.trim();
}

/** True when `TRANSFERZ_GATEWAY_BASE_URL` is unset (effective URL comes from `TRANSFERZ_ENV` + built-in defaults). */
export function isDefaultStagingGateway(): boolean {
  return !process.env.TRANSFERZ_GATEWAY_BASE_URL?.trim();
}

/**
 * ISO 4217 code for Transferz quote amounts (e.g. JPY).
 * @see https://developers.transferz.com/docs/requesting-quotes-1 — optional `currencyCode`;
 * by default the API uses the origin’s local currency.
 *
 * Set `TRANSFERZ_QUOTE_CURRENCY` to override. If unset or invalid, defaults to **JPY**
 * (Pagoda’s primary market). Note: Transferz documents that this field does not change
 * partner invoicing terms — it controls the currency of returned quote prices.
 */
export function getTransferzQuoteCurrency(): string {
  const raw = process.env.TRANSFERZ_QUOTE_CURRENCY?.trim().toUpperCase();
  if (raw && /^[A-Z]{3}$/.test(raw)) return raw;
  return "JPY";
}

/** When Transferz gave you a numeric partner id for multi-account credentials. */
export function getTransferzPartnerId(): number | undefined {
  const raw = process.env.TRANSFERZ_PARTNER_ID?.trim();
  if (!raw) return undefined;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Server logs only — never log full tokens or API keys. */
export function transferzLogSecretPreview(value: string, headChars = 10): string {
  if (!value) return "(empty)";
  const h = Math.min(headChars, value.length);
  return `${value.slice(0, h)}… (len ${value.length})`;
}

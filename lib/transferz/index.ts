/**
 * Transferz integration — **one Pagoda Travel partner account** for all agents/agencies.
 *
 * Env (server only):
 * - `TRANSFERZ_API_KEY` — preferred: long-lived Warp Drive key (quotes/bookings).
 * - `TRANSFERZ_EMAIL` + `TRANSFERZ_PASSWORD` — partner login; if API key is omitted, the server
 *   mints a key once per process and caches it (set `TRANSFERZ_API_KEY` in production / serverless).
 * - `TRANSFERZ_ENV` — `staging` (default) or `production` / `prod` / `live`: picks default gateway
 *   and Warp Drive hosts when `TRANSFERZ_*_BASE_URL` vars are omitted. Gateway and Warp Drive must
 *   always be the same tier (mixed staging/production is rejected).
 * - `TRANSFERZ_WARP_DRIVE_BASE_URL`, `TRANSFERZ_GATEWAY_BASE_URL` — optional overrides for each host.
 * - `TRANSFERZ_QUOTE_CURRENCY` — optional ISO 4217 code for `/partners/quotes` (default **JPY**).
 *
 * @see https://developers.transferz.com/docs/creating-an-api-key
 * @see https://developers.transferz.com/docs/introduction-for-partners-using-warp-drive
 */

export * from "./config";
export * from "./errors";
export * from "./gateway";
export * from "./resolve-warp-drive";
export { normalizePartnerQuotesBody } from "./normalize-partner-quotes-body";
export * from "./warp-drive";
export * from "./session";
export * from "./journey";
export * from "./journey-modify";
export * from "./commission";

/** Non-null Warp Drive client config (API key + base URL). */
export type TransferzEnv = { apiKey: string; baseUrl: string };

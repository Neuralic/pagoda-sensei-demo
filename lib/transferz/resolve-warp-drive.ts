import {
  ensureTransferzGatewayWarpPaired,
  getTransferzApiKey,
  getWarpDriveBaseUrl,
  hasTransferzEnvPasswordCredentials,
  transferzLogSecretPreview,
} from "./config";
import { transferzCreateApiKeyFromPassword } from "./gateway";

type WarpDriveCfg = { apiKey: string; baseUrl: string };

type Box = {
  cached?: WarpDriveCfg;
  inflight?: Promise<WarpDriveCfg | null>;
};

function box(): Box {
  const g = globalThis as typeof globalThis & { __pagodaTransferz?: Box };
  if (!g.__pagodaTransferz) g.__pagodaTransferz = {};
  return g.__pagodaTransferz;
}

/**
 * Resolves Warp Drive credentials for the **single Pagoda Travel Transferz partner** account.
 *
 * 1. If `TRANSFERZ_API_KEY` is set → use it (recommended for production / serverless).
 * 2. Else if `TRANSFERZ_EMAIL` + `TRANSFERZ_PASSWORD` → mint an API key once per process,
 *    cache in memory, and reuse. Logs a warning: prefer setting `TRANSFERZ_API_KEY` so new
 *    deploy instances do not create additional keys.
 */
export async function resolveTransferzWarpDriveConfig(): Promise<WarpDriveCfg | null> {
  ensureTransferzGatewayWarpPaired();

  const fromEnv = getTransferzApiKey();
  const baseUrl = getWarpDriveBaseUrl();
  if (fromEnv) {
    console.log("[transferz] warp drive config from env", {
      source: "TRANSFERZ_API_KEY",
      warpDriveBaseUrl: baseUrl,
      apiKeyPreview: transferzLogSecretPreview(fromEnv),
    });
    return { apiKey: fromEnv, baseUrl };
  }

  if (!hasTransferzEnvPasswordCredentials()) return null;

  const b = box();
  if (b.cached) return b.cached;

  if (!b.inflight) {
    b.inflight = (async (): Promise<WarpDriveCfg | null> => {
      const email = process.env.TRANSFERZ_EMAIL!.trim();
      const password = process.env.TRANSFERZ_PASSWORD!;
      const result = await transferzCreateApiKeyFromPassword(
        email,
        password,
        `Pagoda Travel — platform ${new Date().toISOString().slice(0, 19)}Z`
      );
      if (!result.ok) {
        console.error("[transferz] Could not mint API key from env:", result.error);
        return null;
      }
      const cfg: WarpDriveCfg = { apiKey: result.key, baseUrl: getWarpDriveBaseUrl() };
      b.cached = cfg;
      console.log("[transferz] warp drive config after mint", {
        source: "TRANSFERZ_EMAIL/PASSWORD",
        warpDriveBaseUrl: cfg.baseUrl,
        apiKeyPreview: transferzLogSecretPreview(cfg.apiKey),
      });
      console.warn(
        "[transferz] Using partner credentials from TRANSFERZ_EMAIL/PASSWORD; API key is cached in memory. Set TRANSFERZ_API_KEY in env for production (avoids minting a new key on every cold start)."
      );
      return cfg;
    })().finally(() => {
      b.inflight = undefined;
    });
  }

  return b.inflight;
}

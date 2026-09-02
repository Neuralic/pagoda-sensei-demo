import { NextResponse } from "next/server";
import { requireSessionActor } from "@/lib/itinerary-access";
import {
  getGatewayBaseUrl,
  getTransferzApiKey,
  getTransferzEnvMode,
  getTransferzGatewayWarpPairingError,
  getTransferzQuoteCurrency,
  getWarpDriveBaseUrl,
  hasTransferzEnvPasswordCredentials,
  isDefaultStagingGateway,
  isDefaultStagingWarpDrive,
  isTransferzWarpDriveConfigured,
} from "@/lib/transferz";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { getTransferzPlatformCommissionPct } from "@/lib/transferz/platform-commission-settings";

export const runtime = "nodejs";

function hostOnly(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "unknown";
  }
}

/**
 * Client-safe snapshot. `warpDriveReady` = partner is usable (API key and/or env login for auto-mint).
 */
export async function GET() {
  // Middleware rejects anonymous callers; this keeps the route correct on its own.
  const session = await requireSessionActor();
  if (!session.ok) return session.response;

  const hasApiKey = Boolean(getTransferzApiKey());
  const hasEnvCreds = hasTransferzEnvPasswordCredentials();
  const ready = isTransferzWarpDriveConfigured();

  const pairingError = getTransferzGatewayWarpPairingError();
  const supabase = getSupabaseServer();
  const platformCommissionPct = await getTransferzPlatformCommissionPct(supabase);

  return NextResponse.json({
    ok: true,
    warpDriveReady: ready && !pairingError,
    configured: ready && !pairingError,
    hasApiKey,
    hasEnvCredentials: hasEnvCreds,
    /** Auto-mint from env is possible when API key is missing but email+password exist. */
    usesAutoMintedKey: hasEnvCreds && !hasApiKey,
    canAdminBootstrap: hasEnvCreds,
    /** `staging` or `production` — drives default hosts when per-service base URL env vars are unset. */
    environment: getTransferzEnvMode(),
    gatewayHost: hostOnly(getGatewayBaseUrl()),
    warpDriveHost: hostOnly(getWarpDriveBaseUrl()),
    gatewayBaseUrl: getGatewayBaseUrl(),
    warpDriveBaseUrl: getWarpDriveBaseUrl(),
    /** Non-null when gateway and Warp Drive URLs point at different Transferz tiers (misconfiguration). */
    pairingError,
    stagingDefaults: {
      gateway: isDefaultStagingGateway(),
      warpDrive: isDefaultStagingWarpDrive(),
    },
    /** Effective default for quote requests when the client omits `currencyCode`. */
    quoteCurrency: getTransferzQuoteCurrency(),
    /** Pagoda markup % on Transferz provider net (admin-editable in Transfer invoices). */
    platformCommissionPct,
  });
}

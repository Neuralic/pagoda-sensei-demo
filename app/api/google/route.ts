import { googleAuthRedirect } from "../../../lib/google";
import { requireSessionActor } from "@/lib/itinerary-access";

/**
 * Starts the Google OAuth consent flow. The callback stores tokens against the signed-in
 * user, so an anonymous start would attach someone else's Google account to whatever session
 * finished the flow.
 */
export async function GET() {
  const session = await requireSessionActor();
  if (!session.ok) return session.response;

  return await googleAuthRedirect();
}

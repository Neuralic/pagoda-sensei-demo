/** Login URL that returns to guide price confirmation after sign-in (email clients on mobile). */
export function getGuideConfirmBookingLoginDeepLinkUrl(jobId: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
  const afterLogin = `/guide/confirm-booking?jobId=${encodeURIComponent(String(jobId).trim())}`;
  return `${base}/guide/login?redirect=${encodeURIComponent(afterLogin)}`;
}

/** Direct deep link (already signed in as guide). */
export function getGuideConfirmBookingDeepLinkUrl(jobId: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
  return `${base}/guide/confirm-booking?jobId=${encodeURIComponent(String(jobId).trim())}`;
}

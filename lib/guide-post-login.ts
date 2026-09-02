/** Post-login destination for guide accounts (operator, team, independent). */
export function getGuidePostLoginPath(opts: {
  guideApproved?: boolean | null;
  redirectTo?: string | null;
  isValidRedirect?: (path: string) => boolean;
}): string {
  const redirect = opts.redirectTo?.trim();
  if (redirect && opts.isValidRedirect?.(redirect)) {
    return redirect.startsWith("/") ? redirect : `/${redirect}`;
  }
  if (opts.guideApproved === false) return "/settings";
  return "/guide/landing";
}

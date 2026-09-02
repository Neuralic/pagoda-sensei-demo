/** Default landing path after login / when bouncing authenticated users off login pages. */
export function homePathForRole(role: string | null | undefined): string {
  switch (String(role || "").toLowerCase()) {
    case "admin":
      return "/admin/dashboard";
    case "guide":
      return "/guide/landing";
    case "agency":
      return "/agency/itineraries";
    case "agent":
      return "/agent/itineraries";
    default:
      return "/";
  }
}

export function isLoginPath(pathname: string): boolean {
  return (
    pathname === "/agent/login" ||
    pathname === "/guide/login" ||
    pathname === "/admin/login" ||
    pathname === "/auth/login"
  );
}

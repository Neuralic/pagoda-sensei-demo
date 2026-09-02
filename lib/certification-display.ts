/** §5 certification badges — display mapping for marketplace profiles (§3.4). */

export type CertificationStage = "provisional" | "certified" | "elite" | "rejected";

export function certificationStageFromStatus(
  status: string | null | undefined
): CertificationStage {
  const s = (status || "pending").toLowerCase();
  if (s === "certified") return "certified";
  if (s === "elite") return "elite";
  if (s === "rejected") return "rejected";
  return "provisional";
}

export function certificationBadgeLabel(stage: CertificationStage): string {
  switch (stage) {
    case "certified":
      return "Certified";
    case "elite":
      return "Elite";
    case "rejected":
      return "Rejected";
    default:
      return "Provisional";
  }
}

export function certificationBadgeClassName(stage: CertificationStage): string {
  switch (stage) {
    case "certified":
      return "bg-teal-600 text-white border-teal-700";
    case "elite":
      return "bg-amber-500 text-black border-amber-600";
    case "rejected":
      return "bg-red-100 text-red-900 border-red-300";
    default:
      return "bg-zinc-200 text-zinc-800 border-zinc-400";
  }
}

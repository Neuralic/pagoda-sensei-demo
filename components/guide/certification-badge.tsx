import {
  certificationBadgeClassName,
  certificationBadgeLabel,
  certificationStageFromStatus,
} from "@/lib/certification-display";

type Props = {
  status: string | null | undefined;
  bookingCount?: number;
  reviewCount?: number;
};

export function CertificationBadge({ status, bookingCount, reviewCount }: Props) {
  const stage = certificationStageFromStatus(status);
  const label = certificationBadgeLabel(stage);
  const extra =
    stage === "certified" && bookingCount != null && bookingCount > 0
      ? ` · ${bookingCount} bookings`
      : stage === "elite" && reviewCount != null && reviewCount > 0
        ? ` · ${reviewCount} reviews`
        : "";

  return (
    <span
      className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded border ${certificationBadgeClassName(stage)}`}
    >
      Pagoda {label}
      {extra}
    </span>
  );
}

"use client";

import Link from "next/link";
import { GuideTourAssignmentsClient } from "@/components/guide_tours/guide-tour-assignments-client";
import { BackButton } from "@/components/shared/back-button";
import { OperatorOnlyGuard } from "@/components/guide/operator-only-guard";

export default function GuideTourAssignmentsPage() {
  return (
    <OperatorOnlyGuard>
    <main className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <BackButton label="Back" className="text-[#D4AA25]" />
        <Link
          href="/guide/tour-library"
          className="text-sm text-muted-foreground hover:text-[#D4AA25]"
        >
          Tour library
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-foreground mb-2">Guide–tour assignments</h1>
      <p className="text-muted-foreground mb-8">
        Every tour in the library needs a linked guide profile (yours and/or roster guides) so
        travel advisors can send complete proposals. Agents see these pairings in the marketplace
        and on client PDFs.
      </p>
      <GuideTourAssignmentsClient />
    </main>
    </OperatorOnlyGuard>
  );
}

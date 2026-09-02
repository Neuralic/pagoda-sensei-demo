"use client";

import { Info } from "lucide-react";

/**
 * Persistent reminder on the message board: keep coordination on Pagoda
 * and avoid sharing personal contact details or net/private pricing.
 */
export function MessageBoardPolicyBanner() {
  return (
    <div className="mx-6 mt-3 mb-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 flex items-start gap-2 text-sm text-amber-900 shrink-0">
      <Info className="h-4 w-4 mt-0.5 shrink-0 text-amber-700" aria-hidden />
      <p className="leading-snug">
        <span className="font-medium">Dear partners, please keep all communication within the Pagoda marketplace.</span>{" "}
        For everyone's privacy, avoid sharing personal contact details or rates here — some information may be hidden automatically to help with that. Thanks for understanding!
      </p>
    </div>
  );
}

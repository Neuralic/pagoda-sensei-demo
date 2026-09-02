"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import AdminLayout from "@/components/admin_layout/admin-layout";
import { EditItineraryPageInner } from "@/app/agent/edit-itinerary/page";

function AdminEditItineraryInner() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";

  return (
    <EditItineraryPageInner
      itineraryIdOverride={id}
      backHref="/admin/itineraries"
      editorRole="admin"
    />
  );
}

/**
 * Admin view of an advisor's itinerary. Chat notification emails link straight here.
 *
 * This was the only admin page outside login that did not render AdminLayout, and because
 * HeaderWrapper suppresses the advisor header on /admin/* it had no navigation at all — an
 * admin who followed a message link could read and reply but then had no way back. Production
 * logs for 27 Aug show exactly that: opened from the email at 19:22, and the next admin page
 * only at 20:08, reached by re-opening the same email.
 */
export default function AdminEditItineraryPage() {
  return (
    <AdminLayout>
      <Suspense
        fallback={
          <div className="min-h-screen bg-background p-6 text-muted-foreground">Loading…</div>
        }
      >
        <AdminEditItineraryInner />
      </Suspense>
    </AdminLayout>
  );
}

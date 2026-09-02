"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { GuideTierBadge } from "./guide-tier-badge";
import toast from "react-hot-toast";
import { Loader2, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { buildPublicProfilePath } from "@/lib/profile-refresh";

type RosterGuide = {
  id: string;
  name: string;
  guideNumber: string | null;
  guideTier: string;
  profileSlug?: string | null;
};

type TourRow = {
  id: string;
  name: string;
  location?: string;
  status?: string;
};

/** tour.id is bigint in DB — normalize so Set lookups match across tabs and API responses */
function normalizeTourId(id: string | number | null | undefined): string {
  return id != null ? String(id) : "";
}

export function GuideTourAssignmentsClient() {
  const [roster, setRoster] = useState<RosterGuide[]>([]);
  const [selfGuide, setSelfGuide] = useState<RosterGuide | null>(null);
  const [tours, setTours] = useState<TourRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addNumber, setAddNumber] = useState("");
  const [activeTab, setActiveTab] = useState<"by-guide" | "by-tour">("by-guide");
  const [selectedGuideId, setSelectedGuideId] = useState<string | null>(null);
  const [selectedTourId, setSelectedTourId] = useState<string | null>(null);
  const [checkedTourIds, setCheckedTourIds] = useState<Set<string>>(new Set());
  const [checkedGuideIds, setCheckedGuideIds] = useState<Set<string>>(new Set());

  const loadRoster = useCallback(async () => {
    const [rosterRes, optionsRes] = await Promise.all([
      fetch("/api/operator/roster"),
      fetch("/api/tour/guide-options"),
    ]);
    const data = await rosterRes.json();
    if (data.ok) setRoster(data.guides || []);
    const optData = await optionsRes.json().catch(() => null);
    if (optData?.ok && Array.isArray(optData.options)) {
      const self = optData.options.find(
        (o: { isSelf?: boolean; id: string }) => o.isSelf || o.id === optData.selfGuideId
      );
      if (self) {
        setSelfGuide({
          id: String(self.id),
          name: `${self.name || "You"} (you)`,
          guideNumber: self.guideNumber ?? null,
          guideTier: "professional",
          profileSlug: self.profileSlug ?? null,
        });
      }
    }
  }, []);

  const loadTours = useCallback(async () => {
    const me = await fetch("/api/auth/me");
    const meData = await me.json();
    if (!meData?.user?.id) return;
    const res = await fetch(`/api/tour/${meData.user.id}`);
    const data = await res.json();
    if (data.ok && data.tours) {
      setTours(
        data.tours.map((t: { id: string | number; name: string; location?: string; status?: string }) => ({
          id: normalizeTourId(t.id),
          name: t.name,
          location: t.location,
          status: t.status,
        }))
      );
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadRoster(), loadTours()]);
    setLoading(false);
  }, [loadRoster, loadTours]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const loadGuideAssignments = useCallback(async (guideId: string) => {
    const res = await fetch(`/api/operator/guide-tour-assignments?guideId=${encodeURIComponent(guideId)}`);
    const data = await res.json();
    if (data.ok) {
      setCheckedTourIds(
        new Set((data.assignedTourIds || []).map((id: string | number) => normalizeTourId(id)))
      );
    }
  }, []);

  const loadTourAssignments = useCallback(async (tourId: string) => {
    const res = await fetch(
      `/api/operator/guide-tour-assignments?tourId=${encodeURIComponent(normalizeTourId(tourId))}`
    );
    const data = await res.json();
    if (data.ok) {
      setCheckedGuideIds(new Set(data.assignedGuideIds || []));
    }
  }, []);

  useEffect(() => {
    if (selectedGuideId) void loadGuideAssignments(selectedGuideId);
  }, [selectedGuideId, loadGuideAssignments]);

  useEffect(() => {
    if (selectedTourId) void loadTourAssignments(selectedTourId);
  }, [selectedTourId, loadTourAssignments]);

  const handleTabChange = (value: string) => {
    const tab = value as "by-guide" | "by-tour";
    setActiveTab(tab);
    if (tab === "by-guide" && selectedGuideId) {
      void loadGuideAssignments(selectedGuideId);
    }
    if (tab === "by-tour" && selectedTourId) {
      void loadTourAssignments(selectedTourId);
    }
  };

  const addToRoster = async () => {
    const num = addNumber.trim();
    if (!num) return;
    const res = await fetch("/api/operator/roster", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guideNumber: num }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Could not add guide");
      return;
    }
    toast.success(`Added ${data.guide?.name || "guide"} to roster`);
    setAddNumber("");
    await loadRoster();
  };

  const removeFromRoster = async (guideId: string) => {
    if (!confirm("Remove this guide from your roster? Their tour assignments will be cleared.")) return;
    const res = await fetch(`/api/operator/roster?guideId=${encodeURIComponent(guideId)}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Could not remove");
      return;
    }
    toast.success("Guide removed from roster");
    if (selectedGuideId === guideId) setSelectedGuideId(null);
    await refresh();
  };

  const saveByGuide = async () => {
    if (!selectedGuideId) return;
    setSaving(true);
    const res = await fetch("/api/operator/guide-tour-assignments", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guideId: selectedGuideId,
        tourIds: Array.from(checkedTourIds),
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      toast.error(data.error || "Save failed");
      return;
    }
    toast.success("Tour assignments saved");
    if (selectedTourId) {
      await loadTourAssignments(selectedTourId);
    }
  };

  const saveByTour = async () => {
    if (!selectedTourId) return;
    setSaving(true);
    const res = await fetch("/api/operator/guide-tour-assignments", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tourId: selectedTourId,
        guideIds: Array.from(checkedGuideIds),
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      toast.error(data.error || "Save failed");
      return;
    }
    toast.success("Guide assignments saved");
    if (selectedGuideId) {
      await loadGuideAssignments(selectedGuideId);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-border p-4 bg-muted/20">
        <h2 className="text-lg font-semibold flex items-center gap-2 mb-3">
          <Users className="h-5 w-5" />
          Your guide roster
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Add guides by their Pagoda guide number. You can also link your own published
          profile to any tour. Every tour needs at least one guide profile link.
        </p>
        <div className="flex flex-wrap gap-2 mb-4">
          <Input
            placeholder="Guide number"
            value={addNumber}
            onChange={(e) => setAddNumber(e.target.value)}
            className="max-w-xs"
          />
          <Button type="button" onClick={addToRoster} className="gap-1">
            <UserPlus className="h-4 w-4" />
            Add to roster
          </Button>
        </div>
        {roster.length === 0 ? (
          <p className="text-sm text-muted-foreground">No guides on your roster yet.</p>
        ) : (
          <ul className="space-y-2">
            {roster.map((g) => (
              <li
                key={g.id}
                className="flex items-center justify-between gap-2 py-2 border-b border-border/50 last:border-0"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Link
                    href={buildPublicProfilePath(g.profileSlug) || "#"}
                    target={g.profileSlug ? "_blank" : undefined}
                    rel={g.profileSlug ? "noopener noreferrer" : undefined}
                    className="font-medium hover:text-[#D4AA25] truncate"
                    onClick={(e) => {
                      if (!g.profileSlug) e.preventDefault();
                    }}
                  >
                    {g.name}
                  </Link>
                  {g.guideNumber && (
                    <span className="text-xs text-muted-foreground">#{g.guideNumber}</span>
                  )}
                  <GuideTierBadge tier={g.guideTier} />
                </div>
                <Button variant="ghost" size="sm" onClick={() => removeFromRoster(g.id)}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {tours.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Create tours in your tour library before assigning guides.
        </p>
      ) : (
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList>
            <TabsTrigger value="by-guide">Assign by guide</TabsTrigger>
            <TabsTrigger value="by-tour">Assign by tour</TabsTrigger>
          </TabsList>

          <TabsContent value="by-guide" className="mt-6 space-y-4">
            <label className="text-sm font-medium">Select a guide</label>
            <select
              className="w-full max-w-md border rounded-md px-3 py-2 bg-background"
              value={selectedGuideId || ""}
              onChange={(e) => setSelectedGuideId(e.target.value || null)}
            >
              <option value="">Choose guide…</option>
              {roster.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            {roster.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Add roster guides to assign them in bulk, or use “Assign by tour” to link your own
                profile.
              </p>
            ) : null}
            {selectedGuideId && (
              <>
                <p className="text-sm text-muted-foreground">Tours this guide can lead:</p>
                <ul className="space-y-2 max-h-80 overflow-y-auto border rounded-lg p-3">
                  {tours.map((t) => (
                    <li key={t.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`tour-${t.id}`}
                        checked={checkedTourIds.has(t.id)}
                        onChange={(e) => {
                          const tourId = normalizeTourId(t.id);
                          const next = new Set(checkedTourIds);
                          if (e.target.checked) next.add(tourId);
                          else next.delete(tourId);
                          setCheckedTourIds(next);
                        }}
                      />
                      <label htmlFor={`tour-${t.id}`} className="text-sm cursor-pointer flex-1">
                        {t.name}
                        {t.location && (
                          <span className="text-muted-foreground"> — {t.location}</span>
                        )}
                        {t.status !== "published" && (
                          <span className="text-xs text-amber-700 ml-1">({t.status})</span>
                        )}
                      </label>
                    </li>
                  ))}
                </ul>
                <Button onClick={saveByGuide} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save assignments"}
                </Button>
              </>
            )}
          </TabsContent>

          <TabsContent value="by-tour" className="mt-6 space-y-4">
            <label className="text-sm font-medium">Select a tour</label>
            <select
              className="w-full max-w-md border rounded-md px-3 py-2 bg-background"
              value={selectedTourId || ""}
              onChange={(e) => setSelectedTourId(e.target.value || null)}
            >
              <option value="">Choose tour…</option>
              {tours.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {selectedTourId && (
              <>
                <p className="text-sm text-muted-foreground">
                  Guides available for this tour (your profile + roster). At least one required:
                </p>
                <ul className="space-y-2 max-h-80 overflow-y-auto border rounded-lg p-3">
                  {[...(selfGuide ? [selfGuide] : []), ...roster].map((g) => (
                    <li key={g.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`guide-${g.id}`}
                        checked={checkedGuideIds.has(g.id)}
                        onChange={(e) => {
                          const next = new Set(checkedGuideIds);
                          if (e.target.checked) next.add(g.id);
                          else next.delete(g.id);
                          setCheckedGuideIds(next);
                        }}
                      />
                      <label htmlFor={`guide-${g.id}`} className="text-sm cursor-pointer flex-1 flex items-center gap-2">
                        {g.name}
                        {g.profileSlug ? (
                          <Link
                            href={buildPublicProfilePath(g.profileSlug) || "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-[#D4AA25] hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Profile
                          </Link>
                        ) : null}
                        <GuideTierBadge tier={g.guideTier} />
                      </label>
                    </li>
                  ))}
                </ul>
                <Button onClick={saveByTour} disabled={saving || checkedGuideIds.size === 0}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save assignments"}
                </Button>
              </>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

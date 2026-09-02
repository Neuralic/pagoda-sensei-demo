"use client";

import React, { useEffect, useState } from "react";
import AdminLayout from "@/components/admin_layout/admin-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import toast from "react-hot-toast";
import { getSignedUrls } from "@/lib/storage-sign-client";
import { BUCKETS } from "@/lib/buckets";

type GuideCommission = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  guideNumber: string | null;
  avatarPath: string | null;
  commissionMarketplacePct: number;
  commissionAgentPct: number;
};

export default function CommissionSettingsPage() {
  const [guides, setGuides] = useState<GuideCommission[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingGuideId, setSavingGuideId] = useState<string | null>(null);
  const [avatarUrlByGuideId, setAvatarUrlByGuideId] = useState<Record<string, string>>({});
  const [editingGuide, setEditingGuide] = useState<GuideCommission | null>(null);
  const [fxProtectionPct, setFxProtectionPct] = useState("3");
  const [fxRateLabel, setFxRateLabel] = useState<string | null>(null);
  const [fxSaving, setFxSaving] = useState(false);

  const fetchFxSettings = async () => {
    try {
      const res = await fetch("/api/admin/fx-settings", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok && data.fxProtectionPct != null) {
        setFxProtectionPct(String(data.fxProtectionPct));
        setFxRateLabel(typeof data.rateLabel === "string" ? data.rateLabel : null);
      }
    } catch (err) {
      console.error("Failed to load FX settings", err);
    }
  };

  const handleSaveFx = async () => {
    const n = parseFloat(fxProtectionPct);
    if (Number.isNaN(n) || n < 0 || n > 100) {
      toast.error("FX protection must be between 0 and 100");
      return;
    }
    setFxSaving(true);
    try {
      const res = await fetch("/api/admin/fx-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fxProtectionPct: n }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Save failed");
      }
      setFxProtectionPct(String(data.fxProtectionPct));
      toast.success("FX protection updated");
      void fetchFxSettings();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save FX setting");
    } finally {
      setFxSaving(false);
    }
  };

  const fetchData = async () => {
    try {
      const res = await fetch("/api/admin/commission-settings", { cache: "no-store" });
      const data = await res.json();
      if (res.ok && data.ok) {
        const list = Array.isArray(data.guides) ? data.guides : [];
        setGuides(list);
        const paths: string[] = list
          .map((g: GuideCommission) => g.avatarPath)
          .filter((p: string | null | undefined): p is string => typeof p === "string" && p.length > 0);
        const uniquePaths = Array.from(new Set(paths));
        if (uniquePaths.length > 0) {
          const items = uniquePaths.map((path: string) => ({ bucket: BUCKETS.avatars, path }));
          const results = await getSignedUrls(items);
          const pathToUrl: Record<string, string> = {};
          results.forEach((r) => {
            if (r.signedUrl) pathToUrl[r.path] = r.signedUrl;
          });
          const map: Record<string, string> = {};
          list.forEach((g: GuideCommission) => {
            if (g.avatarPath && pathToUrl[g.avatarPath]) map[g.id] = pathToUrl[g.avatarPath];
          });
          setAvatarUrlByGuideId(map);
        }
      }
    } catch (err) {
      console.error("Failed to load commission settings", err);
      toast.error("Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    void fetchFxSettings();
  }, []);

  const handleSaveGuide = async (guideId: string, marketplace: string, agent: string) => {
    const m = parseFloat(marketplace);
    const a = parseFloat(agent);
    if (Number.isNaN(m) || m < 0 || m > 100 || Number.isNaN(a) || a < 0 || a > 100) {
      toast.error("All values must be between 0 and 100");
      return;
    }
    setSavingGuideId(guideId);
    try {
      const res = await fetch("/api/admin/commission-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guideId,
          commissionMarketplacePct: m,
          commissionAgentPct: a,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to save guide settings");
        return;
      }
      toast.success("Guide commission saved");
      setGuides((prev) =>
        prev.map((g) =>
          g.id === guideId
            ? { ...g, commissionMarketplacePct: m, commissionAgentPct: a }
            : g
        )
      );
      setEditingGuide(null);
    } catch (err) {
      toast.error("Failed to save guide settings");
    } finally {
      setSavingGuideId(null);
    }
  };

  return (
    <AdminLayout>
      {editingGuide && (
        <EditCommissionModal
          guide={editingGuide}
          avatarUrl={avatarUrlByGuideId[editingGuide.id]}
          open={true}
          onOpenChange={(open) => !open && setEditingGuide(null)}
          onSave={handleSaveGuide}
          saving={savingGuideId === editingGuide.id}
        />
      )}
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Commission Settings</h1>
          <p className="text-sm text-gray-500 mt-1">
            Set marketplace and agent commission for each guide. Guide price → + Marketplace % → + Agent % = Total.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>USD display (FX protection)</CardTitle>
            <CardDescription>
              Advisors see USD estimates beside JPY on itinerary lines. Rates come from the ECB
              reference (Frankfurter API, updated daily). The protection buffer is added on top
              when converting JPY → USD. Partner JPY prices are never changed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 max-w-md">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground" htmlFor="fx-protection-pct">
                FX protection buffer (%)
              </label>
              <Input
                id="fx-protection-pct"
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={fxProtectionPct}
                onChange={(e) => setFxProtectionPct(e.target.value)}
              />
            </div>
            {fxRateLabel ? (
              <p className="text-xs text-muted-foreground">{fxRateLabel}</p>
            ) : null}
            <Button type="button" onClick={() => void handleSaveFx()} disabled={fxSaving}>
              {fxSaving ? "Saving…" : "Save FX protection"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Per-guide commission</CardTitle>
            <CardDescription>
              New guides default to Marketplace 25% / Agent 15%. VAT is not added to the sales price.
              These percentages apply everywhere a price is shown — Tour Library, itinerary lines,
              booking confirmation emails and the client PDF — and take effect the next time each
              page loads. Agent % is the advisor&rsquo;s default margin; an advisor who sets their own
              markup on an itinerary or line overrides it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : guides.length === 0 ? (
              <p className="text-sm text-muted-foreground">No guides registered yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 pr-2 w-14">Avatar</th>
                      <th className="text-left py-2 pr-4">Guide</th>
                      <th className="text-left py-2 pr-4">Email</th>
                      <th className="text-left py-2 pr-2">Marketplace %</th>
                      <th className="text-left py-2 pr-2">Agent %</th>
                      <th className="text-left py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {guides.map((g) => (
                      <GuideRow
                        key={g.id}
                        guide={g}
                        avatarUrl={avatarUrlByGuideId[g.id]}
                        onEdit={() => setEditingGuide(g)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}

function GuideRow({
  guide,
  avatarUrl,
  onEdit,
}: {
  guide: GuideCommission;
  avatarUrl?: string;
  onEdit: () => void;
}) {
  const name = [guide.firstName, guide.lastName].filter(Boolean).join(" ") || "—";
  const initials = [guide.firstName?.[0], guide.lastName?.[0]].filter(Boolean).join("").toUpperCase() || "?";

  return (
    <tr className="border-b align-top">
      <td className="py-3 pr-2">
        <Avatar className="h-9 w-9">
          {avatarUrl ? <AvatarImage src={avatarUrl} alt={name} /> : null}
          <AvatarFallback className="text-xs bg-gray-200">{initials}</AvatarFallback>
        </Avatar>
      </td>
      <td className="py-3 pr-4">
        <span className="font-medium">{name}</span>
        {guide.guideNumber && (
          <span className="block text-muted-foreground text-xs">#{guide.guideNumber}</span>
        )}
      </td>
      <td className="py-3 pr-4 text-muted-foreground">{guide.email || "—"}</td>
      <td className="py-3 pr-2">
        <Input
          type="number"
          min={0}
          max={100}
          step={0.5}
          className="w-20 h-8 text-sm bg-muted"
          value={guide.commissionMarketplacePct}
          readOnly
          disabled
        />
      </td>
      <td className="py-3 pr-2">
        <Input
          type="number"
          min={0}
          max={100}
          step={0.5}
          className="w-20 h-8 text-sm bg-muted"
          value={guide.commissionAgentPct}
          readOnly
          disabled
        />
      </td>
      <td className="py-3">
        <Button type="button" size="sm" variant="outline" onClick={onEdit} className="cursor-pointer">
          Edit
        </Button>
      </td>
    </tr>
  );
}

function EditCommissionModal({
  guide,
  avatarUrl,
  open,
  onOpenChange,
  onSave,
  saving,
}: {
  guide: GuideCommission;
  avatarUrl?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (guideId: string, m: string, a: string) => void;
  saving: boolean;
}) {
  const [m, setM] = useState(String(guide.commissionMarketplacePct));
  const [a, setA] = useState(String(guide.commissionAgentPct));

  useEffect(() => {
    setM(String(guide.commissionMarketplacePct));
    setA(String(guide.commissionAgentPct));
  }, [guide.id, guide.commissionMarketplacePct, guide.commissionAgentPct]);

  const handleSave = () => onSave(guide.id, m, a);
  const handleCancel = () => onOpenChange(false);

  const name = [guide.firstName, guide.lastName].filter(Boolean).join(" ") || "—";
  const initials = [guide.firstName?.[0], guide.lastName?.[0]].filter(Boolean).join("").toUpperCase() || "?";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit commission</DialogTitle>
          <DialogDescription>
            Update marketplace and agent commission for this guide. Saving reprices their tours
            and every itinerary line that books them.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12">
              {avatarUrl ? <AvatarImage src={avatarUrl} alt={name} /> : null}
              <AvatarFallback className="text-sm bg-gray-200">{initials}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">{name}</p>
              {guide.guideNumber && (
                <p className="text-xs text-muted-foreground">#{guide.guideNumber}</p>
              )}
              <p className="text-xs text-muted-foreground">{guide.email || "—"}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3">
            <label className="text-sm font-medium">
              Marketplace %
              <Input
                type="number"
                min={0}
                max={100}
                step={0.5}
                className="mt-1"
                value={m}
                onChange={(e) => setM(e.target.value)}
              />
            </label>
            <label className="text-sm font-medium">
              Agent %
              <Input
                type="number"
                min={0}
                max={100}
                step={0.5}
                className="mt-1"
                value={a}
                onChange={(e) => setA(e.target.value)}
              />
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" disabled={saving} onClick={handleCancel} className="cursor-pointer">
              Cancel
            </Button>
            <Button type="button" disabled={saving} onClick={handleSave} className="cursor-pointer">
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

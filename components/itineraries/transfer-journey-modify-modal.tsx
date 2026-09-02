"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  formatTransferzFreeCancellationSummary,
  transferzPastFreeCancellationDeadline,
} from "@/lib/transferz/journey";
import {
  TRANSFERZ_MODIFIABLE_TRAVELLER_INFO_KEYS,
  TRANSFERZ_MODIFY_TRAVELLER_FIELD_LABELS,
  defaultsForTransferzModifyForm,
  normalizeTravelAddonRows,
  travelAddonsPayloadChanged,
  type TransferzModifyFormDefaults,
  type TransferzTravelAddonRow,
} from "@/lib/transferz/journey-modify";

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function toPickupDateApiFromDatetimeLocal(v: string): string | null {
  const s = v.trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::\d{2})?$/);
  if (!m) return null;
  return `${m[1]}T${m[2]}:${m[3]}:00`;
}

export type TransferJourneyModifyModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itineraryId: string;
  /** `itinerary_transferz_bookings.id` (UUID), not provider booking id. */
  transferzRowId: string;
  title: string;
  payload: Record<string, unknown> | null;
  onApplied?: () => void;
};

export function TransferJourneyModifyModal({
  open,
  onOpenChange,
  itineraryId,
  transferzRowId,
  title,
  payload,
  onApplied,
}: TransferJourneyModifyModalProps) {
  const p = payload && isRecord(payload) ? payload : {};
  const payloadKey = useMemo(() => JSON.stringify(payload ?? null), [payload]);

  const initialRef = useRef<TransferzModifyFormDefaults | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadWarning, setLoadWarning] = useState<string | null>(null);
  const [pickupLocal, setPickupLocal] = useState("");
  const [travellerInfo, setTravellerInfo] = useState<
    Record<(typeof TRANSFERZ_MODIFIABLE_TRAVELLER_INFO_KEYS)[number], string>
  >(() => {
    const empty = {} as Record<(typeof TRANSFERZ_MODIFIABLE_TRAVELLER_INFO_KEYS)[number], string>;
    for (const k of TRANSFERZ_MODIFIABLE_TRAVELLER_INFO_KEYS) empty[k] = "";
    return empty;
  });
  const [driverComments, setDriverComments] = useState("");
  const [travelAddons, setTravelAddons] = useState<TransferzTravelAddonRow[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const policyLine = formatTransferzFreeCancellationSummary(p.cancellationDetails);
  const pickupChangeLocked = transferzPastFreeCancellationDeadline(p.cancellationDetails);

  useEffect(() => {
    if (!open) {
      setLoadWarning(null);
      return;
    }

    let cancelled = false;
    initialRef.current = null;

    (async () => {
      setLoading(true);
      setLoadWarning(null);
      try {
        const res = await fetch(
          `/api/itineraries/${encodeURIComponent(itineraryId)}/transferz-bookings/${encodeURIComponent(transferzRowId)}`,
          { method: "GET" }
        );
        const data = (await res.json().catch(() => null)) as { ok?: boolean; journey?: unknown; error?: string } | null;

        if (cancelled) return;

        const j =
          res.ok && data?.ok && data.journey && isRecord(data.journey)
            ? (data.journey as Record<string, unknown>)
            : null;

        if (!res.ok || !data?.ok) {
          setLoadWarning(
            typeof data?.error === "string"
              ? data.error
              : "Could not load live journey from the provider; showing saved itinerary values."
          );
        }

        const d = defaultsForTransferzModifyForm(j, p);
        initialRef.current = d;
        setPickupLocal(d.pickupDatetimeLocal);
        setTravellerInfo({ ...d.travellerInfo });
        setDriverComments(d.driverComments);
        setTravelAddons(d.travelAddons.map((r) => ({ ...r })));
      } catch {
        if (!cancelled) {
          setLoadWarning("Network error while loading journey; showing saved itinerary values.");
          const d = defaultsForTransferzModifyForm(null, p);
          initialRef.current = d;
          setPickupLocal(d.pickupDatetimeLocal);
          setTravellerInfo({ ...d.travellerInfo });
          setDriverComments(d.driverComments);
          setTravelAddons(d.travelAddons.map((r) => ({ ...r })));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, itineraryId, transferzRowId, payloadKey]);

  const setTravellerField = useCallback(
    (key: (typeof TRANSFERZ_MODIFIABLE_TRAVELLER_INFO_KEYS)[number], value: string) => {
      setTravellerInfo((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const updateAddonRow = useCallback((index: number, patch: Partial<TransferzTravelAddonRow>) => {
    setTravelAddons((rows) => {
      const next = rows.map((r, i) => (i === index ? { ...r, ...patch } : r));
      return next;
    });
  }, []);

  const removeAddonRow = useCallback((index: number) => {
    setTravelAddons((rows) => rows.filter((_, i) => i !== index));
  }, []);

  const addAddonRow = useCallback(() => {
    setTravelAddons((rows) => [...rows, { type: "", amount: 1 }]);
  }, []);

  const buildBody = useCallback((): Record<string, unknown> | null => {
    const init = initialRef.current;
    if (!init) return null;

    const out: Record<string, unknown> = {};
    const pickupApi = pickupLocal.trim() ? toPickupDateApiFromDatetimeLocal(pickupLocal.trim()) : null;
    const initPickup = init.pickupDatetimeLocal.trim()
      ? toPickupDateApiFromDatetimeLocal(init.pickupDatetimeLocal.trim())
      : null;

    if (!pickupChangeLocked && pickupApi && pickupApi !== initPickup) {
      out.pickupDate = pickupApi;
    }

    const ti: Record<string, string> = {};
    for (const k of TRANSFERZ_MODIFIABLE_TRAVELLER_INFO_KEYS) {
      const cur = (travellerInfo[k] ?? "").trim();
      const was = (init.travellerInfo[k] ?? "").trim();
      if (cur !== was) {
        ti[k] = cur;
      }
    }
    if (Object.keys(ti).length > 0) {
      out.travellerInfo = ti;
    }

    const dc = driverComments.trim().slice(0, 4000);
    const initDc = init.driverComments.trim().slice(0, 4000);
    if (dc !== initDc) {
      out.driverComments = dc;
    }

    const curAddons = normalizeTravelAddonRows(travelAddons);
    const initAddons = normalizeTravelAddonRows(init.travelAddons);
    if (!pickupChangeLocked && travelAddonsPayloadChanged(curAddons, initAddons)) {
      out.travelAddons = curAddons;
    }

    if (Object.keys(out).length === 0) return null;
    return out;
  }, [
    pickupChangeLocked,
    pickupLocal,
    travellerInfo,
    driverComments,
    travelAddons,
  ]);

  const handleSubmit = async () => {
    const body = buildBody();
    if (!body) {
      toast.error(
        "Change at least one field, or adjust pickup, traveller details, driver comments, or travel add-ons."
      );
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/itineraries/${encodeURIComponent(itineraryId)}/transferz-bookings/${encodeURIComponent(transferzRowId)}/changes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Modification failed");
      }
      const invoiced = data?.additionalPaymentInvoiced === true;
      toast.success(
        invoiced
          ? "Change confirmed. Any price difference was charged on invoice."
          : "Journey updated with the transfer provider."
      );
      onOpenChange(false);
      onApplied?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Modification failed");
    } finally {
      setSubmitting(false);
    }
  };

  const addonsLocked = pickupChangeLocked;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modify transfer (provider)</DialogTitle>
          <p className="text-sm text-muted-foreground font-normal leading-snug">{title}</p>
        </DialogHeader>

        {policyLine ? (
          <p className="text-xs text-muted-foreground leading-relaxed border-b border-border/60 pb-3">
            {policyLine}
          </p>
        ) : null}

        {loadWarning ? (
          <p className="text-xs text-amber-800 dark:text-amber-200 rounded-md border border-amber-600/40 bg-amber-500/10 px-2 py-2 leading-relaxed">
            {loadWarning}
          </p>
        ) : null}

        <p className="text-xs text-muted-foreground leading-relaxed">
          Changes are sent to your transfer provider. 
        </p>

        {pickupChangeLocked ? (
          <p className="text-xs text-amber-800 dark:text-amber-200 rounded-md border border-amber-600/40 bg-amber-500/10 px-2 py-2 leading-relaxed">
            The free cancellation window has ended. <strong>Pickup time and travel add-ons cannot be changed</strong>.
            You can still update traveller details (flight, name, phone, email) and driver comments.
          </p>
        ) : null}

        {loading ? (
          <p className="text-sm text-muted-foreground py-2">Loading current journey…</p>
        ) : null}

        <div className="space-y-3 pt-2 opacity-100">
          <div>
            <label className="text-sm font-medium text-foreground block mb-1">Pickup (local)</label>
            <Input
              type="datetime-local"
              value={pickupLocal}
              onChange={(e) => setPickupLocal(e.target.value)}
              disabled={submitting || loading || pickupChangeLocked}
            />
          </div>

          {TRANSFERZ_MODIFIABLE_TRAVELLER_INFO_KEYS.map((key) => (
            <div key={key}>
              <label className="text-sm font-medium text-foreground block mb-1">
                {TRANSFERZ_MODIFY_TRAVELLER_FIELD_LABELS[key]}
              </label>
              <Input
                value={travellerInfo[key]}
                onChange={(e) => setTravellerField(key, e.target.value)}
                disabled={submitting || loading}
                type={key === "email" ? "email" : key === "phone" ? "tel" : "text"}
                placeholder={key === "flightNumber" ? "e.g. JL004" : undefined}
              />
            </div>
          ))}

          <div>
            <label className="text-sm font-medium text-foreground block mb-1">Comments for driver</label>
            <Textarea
              value={driverComments}
              onChange={(e) => setDriverComments(e.target.value)}
              placeholder="Optional"
              disabled={submitting || loading}
              rows={3}
              maxLength={4000}
              className="resize-y min-h-[72px]"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-sm font-medium text-foreground">Travel add-ons</label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                onClick={addAddonRow}
                disabled={submitting || loading || addonsLocked}
              >
                <Plus className="h-4 w-4 mr-1" aria-hidden />
                Add row
              </Button>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Type and quantity (per provider). Submitting replaces all add-ons on the journey with this list.
            </p>
            {travelAddons.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No rows yet. If you remove all rows and submit, add-ons at the provider are cleared.</p>
            ) : null}
            {travelAddons.map((row, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <Input
                  className="flex-1 min-w-[120px]"
                  placeholder="Add-on type"
                  value={row.type}
                  onChange={(e) => updateAddonRow(i, { type: e.target.value })}
                  disabled={submitting || loading || addonsLocked}
                />
                <Input
                  className="w-24"
                  type="number"
                  min={0}
                  step={1}
                  value={Number.isFinite(row.amount) ? row.amount : 0}
                  onChange={(e) => updateAddonRow(i, { amount: Number(e.target.value) || 0 })}
                  disabled={submitting || loading || addonsLocked}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  aria-label="Remove add-on row"
                  onClick={() => removeAddonRow(i)}
                  disabled={submitting || loading || addonsLocked}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-[#D4AA25] hover:bg-[#C49A1F] text-white"
            disabled={submitting || loading || !initialRef.current}
            onClick={() => void handleSubmit()}
          >
            {submitting ? "Saving…" : "Submit changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
